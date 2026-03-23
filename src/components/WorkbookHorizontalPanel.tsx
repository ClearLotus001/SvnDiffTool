import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import type {
  DiffLine,
  SearchMatch,
  SplitRow,
  WorkbookFreezeState,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from '../types';
import { useTheme } from '../context/theme';
import { getWorkbookFontScale } from '../constants/typography';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { useHorizontalVirtualColumns } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import { extractVersionLabel } from '../utils/diffMeta';
import {
  findWorkbookSectionIndex,
  getWorkbookColumnLabel,
  getWorkbookSections,
} from '../utils/workbookSections';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
} from '../utils/workbookNavigation';
import { buildWorkbookSectionRowIndex } from '../utils/workbookSheetIndex';
import {
  buildWorkbookSelectionSelector,
  ensureElementVisibleHorizontally,
  getWorkbookRowScopedSelection,
} from '../utils/workbookSelection';
import { buildWorkbookCompareCells } from '../utils/workbookCompare';
import {
  type CollapseExpansionState,
  expandCollapseBlock,
  getExpandedHiddenCount,
} from '../utils/collapseState';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '../utils/workbookMeta';
import SplitCell from './SplitCell';
import CollapseBar from './CollapseBar';
import WorkbookMiniMap, { type WorkbookMiniMapSegment, type WorkbookMiniMapTone } from './WorkbookMiniMap';
import WorkbookSheetTabs from './WorkbookSheetTabs';

const CONTEXT_LINES = 3;

type SplitItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; count: number; blockId: string; fromIdx: number; toIdx: number };

function splitRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function splitRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function getWorkbookRowText(line: DiffLine | null): string {
  return line?.base ?? line?.mine ?? '';
}

function getSplitRowWorkbookRowNumber(row: SplitRow): number | null {
  const parsedLeft = parseWorkbookDisplayLine(getWorkbookRowText(row.left));
  if (parsedLeft?.kind === 'row') return parsedLeft.rowNumber;
  const parsedRight = parseWorkbookDisplayLine(getWorkbookRowText(row.right));
  return parsedRight?.kind === 'row' ? parsedRight.rowNumber : null;
}

function getWorkbookMiniMapTone(
  row: SplitRow,
  visibleColumns: number[],
): WorkbookMiniMapTone {
  const compareCells = buildWorkbookCompareCells(row.left, row.right, visibleColumns);
  let changedCount = 0;
  compareCells.forEach((cell) => {
    if (cell.changed) changedCount += 1;
  });
  if (changedCount === 0) return 'equal';

  const hasAdd = row.left?.type === 'add' || row.right?.type === 'add';
  const hasDelete = row.left?.type === 'delete' || row.right?.type === 'delete';
  if (hasAdd && hasDelete) return 'mixed';
  if (hasAdd) return 'add';
  if (hasDelete) return 'delete';
  return 'equal';
}

function isEqualSplitRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function buildSplitItems(
  splitRows: SplitRow[],
  collapseCtx: boolean,
  expandedBlocks: CollapseExpansionState,
): SplitItem[] {
  if (!collapseCtx) {
    return splitRows.map(row => ({ kind: 'split-line' as const, row, lineIdx: row.lineIdx }));
  }

  const result: SplitItem[] = [];
  let i = 0;

  while (i < splitRows.length) {
    const row = splitRows[i]!;
    const isEqual = isEqualSplitRow(row);

    if (!isEqual) {
      result.push({ kind: 'split-line', row, lineIdx: row.lineIdx });
      i += 1;
      continue;
    }

    const eqStart = i;
    while (i < splitRows.length && isEqualSplitRow(splitRows[i]!)) i += 1;
    const count = i - eqStart;

    if (count <= CONTEXT_LINES * 2) {
      for (let k = eqStart; k < i; k += 1) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
      continue;
    }

    const blockId = `wh-${eqStart}-${i}`;
    const hiddenCount = count - (CONTEXT_LINES * 2);
    const expandedHiddenCount = Math.min(hiddenCount, getExpandedHiddenCount(expandedBlocks, blockId));
    if (expandedHiddenCount >= hiddenCount) {
      for (let k = eqStart; k < i; k += 1) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
      continue;
    }

    for (let k = eqStart; k < eqStart + CONTEXT_LINES; k += 1) {
      result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
    }
    for (let k = eqStart + CONTEXT_LINES; k < eqStart + CONTEXT_LINES + expandedHiddenCount; k += 1) {
      result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
    }

    result.push({
      kind: 'split-collapse',
      count: hiddenCount - expandedHiddenCount,
      blockId,
      fromIdx: splitRows[eqStart + CONTEXT_LINES + expandedHiddenCount]!.lineIdx,
      toIdx: splitRows[i - CONTEXT_LINES - 1]!.lineIdx,
    });

    for (let k = i - CONTEXT_LINES; k < i; k += 1) {
      result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
    }
  }

  return result;
}

interface WorkbookHorizontalPanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  hunkPositions: number[];
  showWhitespace: boolean;
  fontSize: number;
  onScrollerReady: (scrollToIndex: (idx: number, align?: 'start' | 'center') => void) => void;
  baseName: string;
  mineName: string;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
}

const WorkbookHorizontalPanel = memo(({
  diffLines,
  collapseCtx,
  activeHunkIdx,
  searchMatches,
  activeSearchIdx,
  hunkPositions,
  showWhitespace,
  fontSize,
  onScrollerReady,
  baseName,
  mineName,
  selectedCell,
  onSelectCell,
  onWorkbookNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  freezeStateBySheet,
}: WorkbookHorizontalPanelProps) => {
  const T = useTheme();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(-1);
  const baseVersion = useMemo(() => extractVersionLabel(baseName) || baseName, [baseName]);
  const mineVersion = useMemo(() => extractVersionLabel(mineName) || mineName, [mineName]);

  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const sectionRowIndex = useMemo(
    () => buildWorkbookSectionRowIndex(diffLines, workbookSections),
    [diffLines, workbookSections],
  );
  const searchMatchSet = useMemo(() => new Set(searchMatches.map(match => match.lineIdx)), [searchMatches]);
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
  const preferredWorkbookSectionIdx = useMemo(() => {
    if (selectedCell) {
      return findWorkbookSectionIndexByName(workbookSections, selectedCell.sheetName);
    }
    if (activeSearchLineIdx >= 0) {
      return findWorkbookSectionIndex(workbookSections, activeSearchLineIdx);
    }
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx !== undefined) {
      return findWorkbookSectionIndex(workbookSections, targetLineIdx);
    }
    return 0;
  }, [activeHunkIdx, activeSearchLineIdx, hunkPositions, selectedCell, workbookSections]);
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSectionIdx >= 0
    ? activeWorkbookSectionIdx
    : preferredWorkbookSectionIdx;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const hiddenLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
    next.add(activeWorkbookSection.startLineIdx);
    if (activeWorkbookSection.firstDataLineIdx != null) next.add(activeWorkbookSection.firstDataLineIdx);
    return next;
  }, [activeWorkbookSection]);
  const sectionRows = useMemo(
    () => (activeWorkbookSection ? (sectionRowIndex.get(activeWorkbookSection.name)?.rows ?? []) : []),
    [activeWorkbookSection, sectionRowIndex],
  );

  const visibleSplitRows = useMemo(() => {
    return sectionRows.filter((row) => {
      if (row.lineIdxs.some(idx => hiddenLineIdxSet.has(idx))) return false;
      const rowNumber = getSplitRowWorkbookRowNumber(row);
      if (rowNumber != null && rowNumber <= Math.max(activeWorkbookSection?.firstDataRowNumber ?? 0, (freezeStateBySheet[activeWorkbookSection?.name ?? '']?.rowNumber ?? 0))) {
        return false;
      }
      return true;
    });
  }, [activeWorkbookSection?.firstDataRowNumber, activeWorkbookSection?.name, freezeStateBySheet, hiddenLineIdxSet, sectionRows]);

  const activeFreezeState = useMemo(() => {
    if (!activeWorkbookSection) return null;
    return freezeStateBySheet[activeWorkbookSection.name] ?? null;
  }, [activeWorkbookSection, freezeStateBySheet]);
  const freezeRowNumber = useMemo(
    () => Math.max(activeWorkbookSection?.firstDataRowNumber ?? 0, activeFreezeState?.rowNumber ?? 0),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState?.rowNumber],
  );
  const freezeColumnCount = useMemo(
    () => Math.max(1, activeFreezeState?.colCount ?? 1),
    [activeFreezeState?.colCount],
  );
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getSplitRowWorkbookRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  const items = useMemo(
    () => buildSplitItems(visibleSplitRows, collapseCtx, expandedBlocks),
    [visibleSplitRows, collapseCtx, expandedBlocks],
  );

  const { totalH, startIdx, endIdx, scrollToIndex } = useVirtual(
    items.length,
    leftScrollRef as RefObject<HTMLDivElement>,
    ROW_H,
  );
  const sheetPresentation = useMemo(
    () => buildWorkbookSheetPresentation(
      sectionRows,
      activeWorkbookSection?.name ?? '',
      baseWorkbookMetadata,
      mineWorkbookMetadata,
      activeWorkbookSection?.maxColumns ?? 1,
    ),
    [activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, mineWorkbookMetadata, sectionRows],
  );
  const singleGridWidth = (LN_W + 3) + (sheetPresentation.visibleColumns.length * WORKBOOK_CELL_WIDTH);
  const virtualColumns = useHorizontalVirtualColumns({
    scrollRef: leftScrollRef as RefObject<HTMLDivElement>,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    mergedRanges: [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges],
  });
  const stickyHeaderHeight = ROW_H + (frozenRows.length * ROW_H);
  const contentHeight = totalH + stickyHeaderHeight;

  const workbookNavigationRows = useMemo(() => {
    if (!activeWorkbookSection || !selectedCell) return [];
    const sourceRows = [
      ...frozenRows,
      ...items.flatMap(item => item.kind === 'split-line' ? [item.row] : []),
    ];

    return sourceRows.flatMap(row => {
      const entries: Array<NonNullable<ReturnType<typeof buildWorkbookRowEntry>>> = [];
      const baseEntry = buildWorkbookRowEntry(row, 'base', activeWorkbookSection.name, baseVersion, sheetPresentation.visibleColumns);
      const mineEntry = buildWorkbookRowEntry(row, 'mine', activeWorkbookSection.name, mineVersion, sheetPresentation.visibleColumns);
      if (baseEntry) entries.push(baseEntry);
      if (mineEntry) entries.push(mineEntry);
      return entries;
    });
  }, [activeWorkbookSection, baseVersion, frozenRows, items, mineVersion, sheetPresentation.visibleColumns]);

  const syncScrollPosition = useCallback((source: 'left' | 'right') => {
    const from = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const to = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (!from || !to) return;
    if (syncOwnerRef.current && syncOwnerRef.current !== source) return;
    syncOwnerRef.current = source;
    if (Math.abs(to.scrollTop - from.scrollTop) > 1) {
      to.scrollTop = from.scrollTop;
    }
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) {
      to.scrollLeft = from.scrollLeft;
    }
    requestAnimationFrame(() => {
      syncOwnerRef.current = null;
    });
  }, []);

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      const itemIndex = items.findIndex(item => item.kind === 'split-line' && splitRowTouchesOrAfter(item.row, lineIdx));
      if (itemIndex < 0) return;
      scrollToIndex(itemIndex, align);
      requestAnimationFrame(() => syncScrollPosition('left'));
    });
  }, [items, onScrollerReady, scrollToIndex, syncScrollPosition]);

  useEffect(() => {
    if (workbookSections.length === 0) return;
    setActiveWorkbookSectionIdx(prev => Math.min(prev, workbookSections.length - 1));
  }, [workbookSections.length]);

  useEffect(() => {
    setActiveWorkbookSectionIdx(-1);
  }, [diffLines]);

  useEffect(() => {
    if (!selectedCell || workbookSections.length === 0) return;
    const nextSectionIdx = findWorkbookSectionIndexByName(workbookSections, selectedCell.sheetName);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [selectedCell, workbookSections]);

  useEffect(() => {
    if (activeSearchLineIdx < 0) return;
    const nextSectionIdx = findWorkbookSectionIndex(workbookSections, activeSearchLineIdx);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [activeSearchLineIdx, workbookSections]);

  useEffect(() => {
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx === undefined) return;
    const nextSectionIdx = findWorkbookSectionIndex(workbookSections, targetLineIdx);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [activeHunkIdx, hunkPositions, workbookSections]);

  useEffect(() => {
    if (activeSearchLineIdx < 0) return;
    const idx = items.findIndex(item => item.kind === 'split-line' && splitRowHasLineIdx(item.row, activeSearchLineIdx));
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeSearchLineIdx, items, scrollToIndex]);

  useEffect(() => {
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx === undefined) return;
    const idx = items.findIndex(item => item.kind === 'split-line' && splitRowTouchesOrAfter(item.row, targetLineIdx));
    if (idx >= 0) scrollToIndex(idx);
  }, [activeHunkIdx, hunkPositions, items, scrollToIndex]);

  const handleWorkbookMove = useCallback((direction: WorkbookMoveDirection) => {
    const nextSelection = moveWorkbookSelection(workbookNavigationRows, selectedCell, direction);
    if (nextSelection) onSelectCell(nextSelection);
  }, [onSelectCell, selectedCell, workbookNavigationRows]);

  useEffect(() => {
    onWorkbookNavigationReady?.(handleWorkbookMove);
    return () => onWorkbookNavigationReady?.(null);
  }, [handleWorkbookMove, onWorkbookNavigationReady]);

  useEffect(() => {
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    const idx = items.findIndex(item => {
      if (item.kind !== 'split-line') return false;
      const entry = buildWorkbookRowEntry(
        item.row,
        selectedCell.side,
        activeWorkbookSection.name,
        selectedCell.side === 'base' ? baseVersion : mineVersion,
        sheetPresentation.visibleColumns,
      );
      return entry?.rowNumber === selectedCell.rowNumber;
    });
    if (idx >= 0) {
      scrollToIndex(idx, 'center');
      requestAnimationFrame(() => syncScrollPosition('left'));
    }
  }, [activeWorkbookSection, baseVersion, items, mineVersion, scrollToIndex, selectedCell, syncScrollPosition, sheetPresentation.visibleColumns]);

  useEffect(() => {
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;

    const source = selectedCell.side === 'base' ? leftScrollRef.current : rightScrollRef.current;
    const target = selectedCell.side === 'base' ? rightScrollRef.current : leftScrollRef.current;
    const selector = buildWorkbookSelectionSelector(selectedCell);
    if (!source || !selector) return;

    const rafId = requestAnimationFrame(() => {
      const el = source.querySelector<HTMLElement>(selector);
      if (!el) return;

      const frozenWidth = LN_W + 3 + (freezeColumnCount * WORKBOOK_CELL_WIDTH);
      const didScroll = ensureElementVisibleHorizontally(source, el, frozenWidth);
      if (didScroll && target) {
        target.scrollLeft = source.scrollLeft;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeWorkbookSection, freezeColumnCount, selectedCell]);

  const miniMapSegments = useMemo<WorkbookMiniMapSegment[]>(() => {
    const segments: WorkbookMiniMapSegment[] = [{ tone: 'equal', height: ROW_H }];

    frozenRows.forEach((row) => {
      segments.push({
        tone: getWorkbookMiniMapTone(row, sheetPresentation.visibleColumns),
        height: ROW_H,
        searchHit: row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    items.forEach((item) => {
      if (item.kind === 'split-collapse') {
        segments.push({ tone: 'equal', height: ROW_H });
        return;
      }

      segments.push({
        tone: getWorkbookMiniMapTone(item.row, sheetPresentation.visibleColumns),
        height: ROW_H,
        searchHit: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    return segments;
  }, [frozenRows, items, searchMatchSet, sheetPresentation.visibleColumns]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectCell(null);
    setActiveWorkbookSectionIdx(index);
    leftScrollRef.current?.scrollTo({ top: 0, left: 0 });
    rightScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [onSelectCell]);
  const handleSelectColumn = useCallback((column: number, side: 'base' | 'mine') => {
    if (!activeWorkbookSection) return;
    const label = getWorkbookColumnLabel(column);
    onSelectCell({
      kind: 'column',
      sheetName: activeWorkbookSection.name,
      side,
      versionLabel: side === 'base' ? baseVersion : mineVersion,
      rowNumber: 0,
      colIndex: column,
      colLabel: label,
      address: label,
      value: '',
      formula: '',
    });
  }, [activeWorkbookSection, baseVersion, mineVersion, onSelectCell]);

  const renderWorkbookColumns = (accent: string, side: 'base' | 'mine') => (
    <div style={{
      display: 'flex',
      height: ROW_H,
      minWidth: singleGridWidth,
      background: T.bg1,
    }}>
      <div style={{
        width: LN_W + 3,
        minWidth: LN_W + 3,
        borderBottom: `1px solid ${T.border}`,
        background: T.bg2,
        position: 'sticky',
        left: 0,
        zIndex: 7,
      }} />
      {virtualColumns.leadingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: virtualColumns.leadingSpacerWidth, minWidth: virtualColumns.leadingSpacerWidth, maxWidth: virtualColumns.leadingSpacerWidth, flexShrink: 0 }}
        />
      )}
      {virtualColumns.columnEntries.map(({ column, position: index }) => (
        <button
          type="button"
          onClick={() => handleSelectColumn(column, side)}
          key={`${accent}-${column}`}
          data-workbook-role="column-header"
          data-workbook-side={side}
          data-workbook-col={column}
          style={{
            width: WORKBOOK_CELL_WIDTH,
            minWidth: WORKBOOK_CELL_WIDTH,
            maxWidth: WORKBOOK_CELL_WIDTH,
            borderLeft: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            background: selectedCell?.kind !== 'row'
              && selectedCell?.sheetName === activeWorkbookSection?.name
              && selectedCell?.colIndex === column
              && selectedCell?.side === side
              ? `linear-gradient(180deg, ${accent}28 0%, ${accent}16 100%)`
              : selectedCell?.kind !== 'row'
              && selectedCell?.sheetName === activeWorkbookSection?.name
              && selectedCell?.colIndex === column
              ? `linear-gradient(180deg, ${accent}14 0%, ${accent}0d 100%)`
              : T.bg1,
            fontSize: sizes.header,
            fontWeight: 700,
            position: index < freezeColumnCount ? 'sticky' : 'relative',
            left: index < freezeColumnCount ? LN_W + 3 + (index * WORKBOOK_CELL_WIDTH) : undefined,
            zIndex: index < freezeColumnCount ? 6 : 1,
            boxShadow: index === freezeColumnCount - 1 ? `10px 0 14px -14px ${T.border2}` : undefined,
            cursor: 'pointer',
            appearance: 'none',
            outline: 'none',
            borderRight: 'none',
            borderTop: 'none',
            boxSizing: 'border-box',
          }}>
          {getWorkbookColumnLabel(column)}
        </button>
      ))}
      {virtualColumns.trailingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: virtualColumns.trailingSpacerWidth, minWidth: virtualColumns.trailingSpacerWidth, maxWidth: virtualColumns.trailingSpacerWidth, flexShrink: 0 }}
        />
      )}
    </div>
  );

  const renderPaneRow = (
    row: SplitRow,
    side: 'left' | 'right',
    isSearchMatch: boolean,
    isActiveSearch: boolean,
    maskEqualCells = true,
  ) => {
    const rowNumber = getSplitRowWorkbookRowNumber(row);
    const scopedSelection = getWorkbookRowScopedSelection(
      selectedCell,
      activeWorkbookSection?.name ?? '',
      rowNumber,
      sheetPresentation.visibleColumns,
    );

    return (
      <div style={{ height: ROW_H, width: 'max-content', minWidth: '100%' }}>
      <SplitCell
        line={side === 'left' ? row.left : row.right}
        pairedLine={side === 'left' ? row.right : row.left}
        side={side}
        isSearchMatch={isSearchMatch}
        isActiveSearch={isActiveSearch}
        showWhitespace={showWhitespace}
        fontSize={fontSize}
        sheetName={activeWorkbookSection?.name ?? ''}
        versionLabel={side === 'left' ? baseVersion : mineVersion}
        selectedCell={scopedSelection}
        onSelectCell={onSelectCell}
        stickyLeftBase={0}
        freezeColumnCount={freezeColumnCount}
        columnCount={activeWorkbookSection?.maxColumns ?? 0}
        visibleColumns={sheetPresentation.visibleColumns}
        renderColumns={virtualColumns.columnEntries}
        leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
        trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
        mergedRanges={side === 'left' ? sheetPresentation.baseMergeRanges : sheetPresentation.mineMergeRanges}
        maskEqualCells={maskEqualCells}
      />
    </div>
    );
  };

  const renderPane = (
    ref: RefObject<HTMLDivElement>,
    side: 'left' | 'right',
    accent: string,
    onSync: () => void,
  ) => (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={ref}
        onScroll={onSync}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          minWidth: 0,
          minHeight: 0,
        }}>
        <div style={{ position: 'relative', minWidth: singleGridWidth, height: totalH + stickyHeaderHeight }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              isolation: 'isolate',
              background: T.bg1,
              boxShadow: `0 1px 0 ${T.border}`,
              minWidth: singleGridWidth,
            }}>
            {renderWorkbookColumns(accent, side === 'left' ? 'base' : 'mine')}
            {frozenRows.map((row, index) => (
              <div key={`frozen-${side}-${row.lineIdx}-${index}`}>
                {renderPaneRow(row, side, false, false, false)}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', top: stickyHeaderHeight + (startIdx * ROW_H), left: 0, minWidth: '100%' }}>
            {items.slice(startIdx, endIdx).map((item) => {
              const key = item.kind === 'split-collapse'
                ? `${side}-${item.blockId}`
                : `${side}-row-${item.lineIdx}`;
              if (item.kind === 'split-collapse') {
                return (
                  <CollapseBar
                    key={key}
                    count={item.count}
                    onExpand={() => startTransition(() => {
                      setExpandedBlocks(prev => expandCollapseBlock(
                        prev,
                        item.blockId,
                        item.count + getExpandedHiddenCount(prev, item.blockId),
                      ));
                    })}
                  />
                );
              }

              return (
                <div key={key}>
                  {renderPaneRow(
                    item.row,
                    side,
                    item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
                    item.row.lineIdxs.includes(activeSearchLineIdx),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
            {renderPane(leftScrollRef, 'left', T.acc2, () => syncScrollPosition('left'))}
            <div style={{ width: 1, background: T.border, boxShadow: `0 0 0 1px ${T.border}` }} />
            {renderPane(rightScrollRef, 'right', T.acc, () => syncScrollPosition('right'))}
          </div>
        </div>

        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={leftScrollRef as RefObject<HTMLDivElement>}
          contentHeight={contentHeight}
        />
      </div>
      <WorkbookSheetTabs
        sections={workbookSections}
        activeIndex={resolvedActiveWorkbookSectionIdx}
        onSelect={handleSelectSheet}
        fontSize={fontSize}
      />
    </div>
  );
});

export default WorkbookHorizontalPanel;
