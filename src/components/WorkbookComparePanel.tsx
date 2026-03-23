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
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { useHorizontalVirtualColumns } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { extractVersionLabel } from '../utils/diffMeta';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import {
  findWorkbookSectionIndex,
  getWorkbookColumnLabel,
  getWorkbookSections,
} from '../utils/workbookSections';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '../utils/workbookMeta';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
} from '../utils/workbookNavigation';
import { buildWorkbookSectionRowIndex } from '../utils/workbookSheetIndex';
import { buildWorkbookCompareCells } from '../utils/workbookCompare';
import {
  buildWorkbookSelectionSelector,
  ensureElementVisibleHorizontally,
  getWorkbookRowScopedSelection,
} from '../utils/workbookSelection';
import {
  type CollapseExpansionState,
  expandCollapseBlock,
  getExpandedHiddenCount,
} from '../utils/collapseState';
import CollapseBar from './CollapseBar';
import SplitCell from './SplitCell';
import WorkbookMiniMap, { type WorkbookMiniMapSegment, type WorkbookMiniMapTone } from './WorkbookMiniMap';
import WorkbookColumnCompareRow, { WorkbookColumnCompareHeader } from './WorkbookColumnCompareRow';
import WorkbookSheetTabs from './WorkbookSheetTabs';

const CONTEXT_LINES = 3;

type CompareMode = 'stacked' | 'columns';

type CompareItem =
  | { kind: 'row'; row: SplitRow; lineIdx: number }
  | { kind: 'collapse'; count: number; blockId: string; fromIdx: number; toIdx: number };

function compareRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function compareRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function isEqualCompareRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function buildCompareItems(
  rows: SplitRow[],
  collapseCtx: boolean,
  expandedBlocks: CollapseExpansionState,
): CompareItem[] {
  if (!collapseCtx) {
    return rows.map(row => ({ kind: 'row' as const, row, lineIdx: row.lineIdx }));
  }

  const result: CompareItem[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i]!;
    if (!isEqualCompareRow(row)) {
      result.push({ kind: 'row', row, lineIdx: row.lineIdx });
      i += 1;
      continue;
    }

    const eqStart = i;
    while (i < rows.length && isEqualCompareRow(rows[i]!)) i += 1;
    const count = i - eqStart;

    if (count <= CONTEXT_LINES * 2) {
      for (let k = eqStart; k < i; k += 1) {
        result.push({ kind: 'row', row: rows[k]!, lineIdx: rows[k]!.lineIdx });
      }
      continue;
    }

    const blockId = `wc-${rows[eqStart]!.lineIdx}-${rows[i - 1]!.lineIdx}`;
    const hiddenCount = count - (CONTEXT_LINES * 2);
    const expandedHiddenCount = Math.min(hiddenCount, getExpandedHiddenCount(expandedBlocks, blockId));
    if (expandedHiddenCount >= hiddenCount) {
      for (let k = eqStart; k < i; k += 1) {
        result.push({ kind: 'row', row: rows[k]!, lineIdx: rows[k]!.lineIdx });
      }
      continue;
    }

    for (let k = eqStart; k < eqStart + CONTEXT_LINES; k += 1) {
      result.push({ kind: 'row', row: rows[k]!, lineIdx: rows[k]!.lineIdx });
    }
    for (let k = eqStart + CONTEXT_LINES; k < eqStart + CONTEXT_LINES + expandedHiddenCount; k += 1) {
      result.push({ kind: 'row', row: rows[k]!, lineIdx: rows[k]!.lineIdx });
    }

    result.push({
      kind: 'collapse',
      count: hiddenCount - expandedHiddenCount,
      blockId,
      fromIdx: rows[eqStart + CONTEXT_LINES + expandedHiddenCount]!.lineIdx,
      toIdx: rows[i - CONTEXT_LINES - 1]!.lineIdx,
    });

    for (let k = i - CONTEXT_LINES; k < i; k += 1) {
      result.push({ kind: 'row', row: rows[k]!, lineIdx: rows[k]!.lineIdx });
    }
  }

  return result;
}

function resolveWorkbookRowWidth(maxColumns: number, mode: CompareMode): number {
  const gridWidth = (LN_W + 3) + (maxColumns * WORKBOOK_CELL_WIDTH);
  if (mode === 'stacked') return gridWidth;
  return (LN_W + 3) + (maxColumns * WORKBOOK_CELL_WIDTH * 2);
}

function getRowWorkbookContent(line: DiffLine | null): string {
  return line?.base ?? line?.mine ?? '';
}

function getCompareRowWorkbookRowNumber(row: SplitRow): number | null {
  const parsedLeft = parseWorkbookDisplayLine(getRowWorkbookContent(row.left));
  if (parsedLeft?.kind === 'row') return parsedLeft.rowNumber;
  const parsedRight = parseWorkbookDisplayLine(getRowWorkbookContent(row.right));
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

interface WorkbookComparePanelProps {
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
  mode: CompareMode;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
}

const WorkbookComparePanel = memo(({
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
  mode,
  selectedCell,
  onSelectCell,
  onWorkbookNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  freezeStateBySheet,
}: WorkbookComparePanelProps) => {
  const T = useTheme();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(-1);

  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const sectionRowIndex = useMemo(
    () => buildWorkbookSectionRowIndex(diffLines, workbookSections),
    [diffLines, workbookSections],
  );
  const baseVersion = useMemo(() => extractVersionLabel(baseName) || baseName, [baseName]);
  const mineVersion = useMemo(() => extractVersionLabel(mineName) || mineName, [mineName]);
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
  const sectionRows = useMemo(
    () => (activeWorkbookSection ? (sectionRowIndex.get(activeWorkbookSection.name)?.rows ?? []) : []),
    [activeWorkbookSection, sectionRowIndex],
  );
  const hiddenLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
    next.add(activeWorkbookSection.startLineIdx);
    if (activeWorkbookSection.firstDataLineIdx != null) next.add(activeWorkbookSection.firstDataLineIdx);
    return next;
  }, [activeWorkbookSection]);

  const activeFreezeState = useMemo(() => {
    if (!activeWorkbookSection) return null;
    return freezeStateBySheet[activeWorkbookSection.name] ?? null;
  }, [activeWorkbookSection, freezeStateBySheet]);
  const freezeRowNumber = useMemo(() => {
    return Math.max(activeWorkbookSection?.firstDataRowNumber ?? 0, activeFreezeState?.rowNumber ?? 0);
  }, [activeWorkbookSection?.firstDataRowNumber, activeFreezeState?.rowNumber]);
  const freezeColumnCount = useMemo(
    () => Math.max(1, activeFreezeState?.colCount ?? 1),
    [activeFreezeState?.colCount],
  );
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getCompareRowWorkbookRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  const visibleSectionRows = useMemo(() => (
    sectionRows.filter((row) => {
      if (row.lineIdxs.some(idx => hiddenLineIdxSet.has(idx))) return false;
      const rowNumber = getCompareRowWorkbookRowNumber(row);
      if (rowNumber != null && rowNumber <= freezeRowNumber) {
        return false;
      }
      return true;
    })
  ), [freezeRowNumber, hiddenLineIdxSet, sectionRows]);

  const items = useMemo(
    () => buildCompareItems(visibleSectionRows, collapseCtx, expandedBlocks),
    [visibleSectionRows, collapseCtx, expandedBlocks],
  );

  const rowHeight = mode === 'stacked' ? (ROW_H * 2) + 1 : ROW_H;
  const { totalH, startIdx, endIdx, scrollToIndex } = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
    rowHeight,
  );

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      const itemIndex = items.findIndex(item => item.kind === 'row' && compareRowTouchesOrAfter(item.row, lineIdx));
      if (itemIndex >= 0) {
        scrollToIndex(itemIndex, align);
      }
    });
  }, [items, onScrollerReady, scrollToIndex]);

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
    const idx = items.findIndex(item => item.kind === 'row' && compareRowHasLineIdx(item.row, activeSearchLineIdx));
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeSearchLineIdx, items, scrollToIndex]);

  useEffect(() => {
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx === undefined) return;
    const idx = items.findIndex(item => item.kind === 'row' && compareRowTouchesOrAfter(item.row, targetLineIdx));
    if (idx >= 0) scrollToIndex(idx);
  }, [activeHunkIdx, hunkPositions, items, scrollToIndex]);

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
    scrollRef,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    widthMultiplier: mode === 'columns' ? 2 : 1,
    mergedRanges: mode === 'stacked'
      ? [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges]
      : [],
  });
  const showColumnHeader = mode === 'columns' || frozenRows.length === 0;
  const stickyHeaderHeight = (showColumnHeader ? ROW_H : 0) + (frozenRows.length * rowHeight);
  const minBodyWidth = resolveWorkbookRowWidth(sheetPresentation.visibleColumns.length, mode);
  const contentHeight = totalH + stickyHeaderHeight;
  const workbookNavigationRows = useMemo(() => {
    if (!activeWorkbookSection || !selectedCell) return [];
    const sourceRows = [
      ...frozenRows,
      ...items.flatMap(item => item.kind === 'row' ? [item.row] : []),
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
      if (item.kind !== 'row') return false;
      const entry = buildWorkbookRowEntry(
        item.row,
        selectedCell.side,
        activeWorkbookSection.name,
        selectedCell.side === 'base' ? baseVersion : mineVersion,
        sheetPresentation.visibleColumns,
      );
      return entry?.rowNumber === selectedCell.rowNumber;
    });
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeWorkbookSection, baseVersion, items, mineVersion, scrollToIndex, selectedCell, sheetPresentation.visibleColumns]);

  useEffect(() => {
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;

    const selector = buildWorkbookSelectionSelector(selectedCell);
    const container = scrollRef.current;
    if (!selector || !container) return;

    const rafId = requestAnimationFrame(() => {
      const target = container.querySelector<HTMLElement>(selector);
      if (!target) return;

      const frozenWidth = mode === 'columns'
        ? LN_W + 3 + (freezeColumnCount * WORKBOOK_CELL_WIDTH * 2)
        : LN_W + 3 + (freezeColumnCount * WORKBOOK_CELL_WIDTH);
      ensureElementVisibleHorizontally(container, target, frozenWidth);
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    activeWorkbookSection,
    freezeColumnCount,
    mode,
    selectedCell,
  ]);

  const miniMapSegments = useMemo<WorkbookMiniMapSegment[]>(() => {
    const segments: WorkbookMiniMapSegment[] = [];

    if (showColumnHeader) {
      segments.push({ tone: 'equal', height: ROW_H });
    }

    frozenRows.forEach((row) => {
      segments.push({
        tone: getWorkbookMiniMapTone(row, sheetPresentation.visibleColumns),
        height: rowHeight,
        searchHit: row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    items.forEach((item) => {
      if (item.kind === 'collapse') {
        segments.push({ tone: 'equal', height: rowHeight });
        return;
      }

      segments.push({
        tone: getWorkbookMiniMapTone(item.row, sheetPresentation.visibleColumns),
        height: rowHeight,
        searchHit: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    return segments;
  }, [frozenRows, items, rowHeight, searchMatchSet, sheetPresentation.visibleColumns, showColumnHeader]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectCell(null);
    setActiveWorkbookSectionIdx(index);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
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

  const renderSingleColumnHeader = (accent: string, stickyLeftBase = 0) => (
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
        left: stickyLeftBase,
        zIndex: 7,
        boxShadow: `10px 0 14px -14px ${T.border2}`,
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
          onClick={() => handleSelectColumn(column, 'base')}
          key={`${accent}-${column}`}
          data-workbook-role="column-header"
          data-workbook-side="base"
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
              ? `linear-gradient(180deg, ${accent}28 0%, ${accent}16 100%)`
              : T.bg1,
            fontSize: sizes.header,
            fontWeight: 700,
            fontFamily: FONT_UI,
            position: index < freezeColumnCount ? 'sticky' : 'relative',
            left: index < freezeColumnCount ? stickyLeftBase + LN_W + 3 + (index * WORKBOOK_CELL_WIDTH) : undefined,
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

  const renderColumnHeaders = () => {
    if (mode === 'stacked') {
      return renderSingleColumnHeader(T.acc2, 0);
    }

      return (
        <WorkbookColumnCompareHeader
          visibleColumns={sheetPresentation.visibleColumns}
          renderColumns={virtualColumns.columnEntries}
          leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
          trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
          fontSize={fontSize}
          selectedCell={selectedCell}
          sheetName={activeWorkbookSection?.name ?? ''}
          freezeColumnCount={freezeColumnCount}
          onSelectColumn={handleSelectColumn}
        />
      );
  };

  const renderCompareRow = (
    row: SplitRow,
    isSearchMatch: boolean,
    isActiveSearch: boolean,
    sticky = false,
  ) => {
    const rowNumber = getCompareRowWorkbookRowNumber(row);
    const scopedSelection = getWorkbookRowScopedSelection(
      selectedCell,
      activeWorkbookSection?.name ?? '',
      rowNumber,
      sheetPresentation.visibleColumns,
    );

    if (mode === 'stacked') {
      return (
        <div
          style={{
            height: rowHeight,
            display: 'flex',
            flexDirection: 'column',
            width: 'max-content',
            minWidth: minBodyWidth,
            background: sticky ? T.bg1 : undefined,
          }}>
          <SplitCell
            line={row.left}
            pairedLine={row.right}
            side="left"
            isSearchMatch={isSearchMatch}
            isActiveSearch={isActiveSearch}
            showWhitespace={showWhitespace}
            fontSize={fontSize}
            sheetName={activeWorkbookSection?.name ?? ''}
            versionLabel={baseVersion}
            selectedCell={scopedSelection}
            onSelectCell={onSelectCell}
            stickyLeftBase={0}
            freezeColumnCount={freezeColumnCount}
            columnCount={activeWorkbookSection?.maxColumns ?? 0}
            visibleColumns={sheetPresentation.visibleColumns}
            renderColumns={virtualColumns.columnEntries}
            leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
            trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
            mergedRanges={sheetPresentation.baseMergeRanges}
            maskEqualCells={!sticky}
          />
          <div style={{ height: 1, background: T.border, width: '100%', flexShrink: 0 }} />
          <SplitCell
            line={row.right}
            pairedLine={row.left}
            side="right"
            isSearchMatch={isSearchMatch}
            isActiveSearch={isActiveSearch}
            showWhitespace={showWhitespace}
            fontSize={fontSize}
            sheetName={activeWorkbookSection?.name ?? ''}
            versionLabel={mineVersion}
            selectedCell={scopedSelection}
            onSelectCell={onSelectCell}
            stickyLeftBase={0}
            freezeColumnCount={freezeColumnCount}
            columnCount={activeWorkbookSection?.maxColumns ?? 0}
            visibleColumns={sheetPresentation.visibleColumns}
            renderColumns={virtualColumns.columnEntries}
            leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
            trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
            mergedRanges={sheetPresentation.mineMergeRanges}
            maskEqualCells={!sticky}
          />
        </div>
      );
    }

    return (
      <WorkbookColumnCompareRow
        row={row}
        visibleColumns={sheetPresentation.visibleColumns}
        renderColumns={virtualColumns.columnEntries}
        leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
        trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
        active={isActiveSearch}
        sheetName={activeWorkbookSection?.name ?? ''}
        baseVersion={baseVersion}
        mineVersion={mineVersion}
        fontSize={fontSize}
        selectedCell={scopedSelection}
        onSelectCell={onSelectCell}
        rowHighlightBg={isActiveSearch ? T.searchActiveBg : isSearchMatch ? `${T.searchHl}28` : undefined}
        maskEqualCells={!sticky}
        freezeColumnCount={freezeColumnCount}
      />
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              position: 'relative',
              minWidth: 0,
              minHeight: 0,
              background: T.bg0,
            }}>
            <div style={{ position: 'relative', minWidth: minBodyWidth, height: contentHeight }}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 30,
                  isolation: 'isolate',
                  background: T.bg1,
                  boxShadow: `0 1px 0 ${T.border}`,
                  minWidth: minBodyWidth,
                }}>
                {showColumnHeader && renderColumnHeaders()}
                {frozenRows.map((row, index) => (
                  <div key={`frozen-${row.lineIdx}-${index}`}>
                    {renderCompareRow(row, false, false, true)}
                  </div>
                ))}
              </div>

              <div style={{ position: 'absolute', top: stickyHeaderHeight + (startIdx * rowHeight), left: 0, minWidth: minBodyWidth }}>
                {items.slice(startIdx, endIdx).map((item) => {
                  const key = item.kind === 'collapse'
                    ? item.blockId
                    : `row-${item.lineIdx}`;
                  if (item.kind === 'collapse') {
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
                      {renderCompareRow(
                        item.row,
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
        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={scrollRef as RefObject<HTMLDivElement>}
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

export default WorkbookComparePanel;
