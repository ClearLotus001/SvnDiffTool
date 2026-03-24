import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import type {
  DiffLine,
  Hunk,
  SearchMatch,
  SplitRow,
  WorkbookCompareMode,
  WorkbookFreezeState,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from '../types';
import { useTheme } from '../context/theme';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { useHorizontalVirtualColumns } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '../utils/workbookSections';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
  type WorkbookRowEntry,
} from '../utils/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '../utils/workbookSheetIndex';
import {
  getWorkbookSelectionSpanForSelection,
} from '../utils/workbookMergeLayout';
import { buildWorkbookSplitRowCompareState } from '../utils/workbookCompare';
import {
  getWorkbookColumnWidth,
  measureWorkbookAutoFitColumnWidth,
  type WorkbookColumnWidthBySheet,
} from '../utils/workbookColumnWidths';
import {
  expandCollapseBlock,
  getExpandedHiddenCount,
  type CollapseExpansionState,
} from '../utils/collapseState';
import { buildCollapsedItems, buildCollapsibleRowBlocks } from '../utils/collapsibleRows';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '../utils/workbookMeta';
import CollapseBar from './CollapseBar';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
  type WorkbookMiniMapSegment,
  type WorkbookMiniMapTone,
} from './WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';
import WorkbookCanvasHeaderStrip from './WorkbookCanvasHeaderStrip';
import WorkbookPaneCanvasStrip, { type WorkbookPaneCanvasRow } from './WorkbookPaneCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from './WorkbookPerfDebugPanel';
import WorkbookSheetTabs from './WorkbookSheetTabs';

const CONTEXT_LINES = 3;

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
  compareMode: WorkbookCompareMode,
): WorkbookMiniMapTone {
  return buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode).tone;
}

function isEqualSplitRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function rowTouchesGuidedHunk(row: SplitRow, guidedHunkRange: Hunk | null): boolean {
  if (!guidedHunkRange) return false;
  return row.lineIdxs.some(idx => idx >= guidedHunkRange.startIdx && idx <= guidedHunkRange.endIdx);
}

function buildSelectionAutoScrollKey(
  sheetName: string,
  selection: WorkbookSelectedCell | null,
): string {
  if (!selection) return '';
  return [
    sheetName,
    selection.kind,
    selection.side,
    selection.rowNumber,
    selection.colIndex,
  ].join(':');
}

type WorkbookHorizontalRenderItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; blockId: string; count: number; fromIdx: number; toIdx: number };

interface WorkbookHorizontalPanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  guidedHunkRange: Hunk | null;
  guidedPulseNonce: number;
  hunkPositions: number[];
  showWhitespace: boolean;
  fontSize: number;
  onScrollerReady: (scrollToIndex: (idx: number, align?: 'start' | 'center') => void) => void;
  baseVersionLabel: string;
  mineVersionLabel: string;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
  columnWidthBySheet: WorkbookColumnWidthBySheet;
  onColumnWidthChange: (sheetName: string, column: number, width: number) => void;
  workbookSections: WorkbookSection[];
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>;
  activeWorkbookSheetName: string | null;
  onActiveWorkbookSheetChange: (sheetName: string | null) => void;
  compareMode: WorkbookCompareMode;
  active?: boolean;
  showPerfDebug?: boolean;
  showHiddenColumns?: boolean;
  tooltipDisabled?: boolean;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const WorkbookHorizontalPanel = memo(({
  diffLines,
  collapseCtx,
  searchMatches,
  activeSearchIdx,
  guidedHunkRange,
  guidedPulseNonce,
  showWhitespace: _showWhitespace,
  fontSize,
  onScrollerReady,
  baseVersionLabel,
  mineVersionLabel,
  selectedCell,
  onSelectCell,
  onWorkbookNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  freezeStateBySheet,
  columnWidthBySheet,
  onColumnWidthChange,
  workbookSections,
  workbookSectionRowIndex,
  activeWorkbookSheetName,
  onActiveWorkbookSheetChange,
  compareMode,
  active = true,
  showPerfDebug = false,
  showHiddenColumns = false,
  tooltipDisabled = false,
}: WorkbookHorizontalPanelProps) => {
  const T = useTheme();
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const scrollSyncCountRef = useRef(0);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const rowBlocksCacheRef = useRef(new Map<string, ReturnType<typeof buildCollapsibleRowBlocks<SplitRow>>>());
  const itemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: WorkbookHorizontalRenderItem[]; duration: number }>>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const baseVersion = useMemo(() => baseVersionLabel.trim(), [baseVersionLabel]);
  const mineVersion = useMemo(() => mineVersionLabel.trim(), [mineVersionLabel]);

  const searchMatchSet = useMemo(() => new Set(searchMatches.map(match => match.lineIdx)), [searchMatches]);
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const hiddenLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
    next.add(activeWorkbookSection.startLineIdx);
    if (activeWorkbookSection.firstDataLineIdx != null) next.add(activeWorkbookSection.firstDataLineIdx);
    return next;
  }, [activeWorkbookSection]);
  const sectionRows = useMemo(
    () => (activeWorkbookSection ? (workbookSectionRowIndex.get(activeWorkbookSection.name)?.rows ?? []) : []),
    [activeWorkbookSection, workbookSectionRowIndex],
  );
  const activeFreezeState = useMemo(() => {
    if (!activeWorkbookSection) return null;
    return freezeStateBySheet[activeWorkbookSection.name] ?? null;
  }, [activeWorkbookSection, freezeStateBySheet]);
  const freezeRowNumber = useMemo(
    () => Math.max(activeWorkbookSection?.firstDataRowNumber ?? 0, activeFreezeState?.rowNumber ?? 0),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState?.rowNumber],
  );
  const activeSheetCacheKey = `${activeWorkbookSection?.name ?? ''}::${freezeRowNumber}`;

  useEffect(() => {
    visibleRowsCacheRef.current.clear();
    rowBlocksCacheRef.current.clear();
    itemsCacheRef.current = new WeakMap();
  }, [diffLines]);

  const visibleSplitRows = useMemo(() => {
    const cached = visibleRowsCacheRef.current.get(activeSheetCacheKey);
    if (cached) return cached;

    const nextRows = sectionRows.filter((row) => {
      if (row.lineIdxs.some(idx => hiddenLineIdxSet.has(idx))) return false;
      const rowNumber = getSplitRowWorkbookRowNumber(row);
      if (rowNumber != null && rowNumber <= Math.max(activeWorkbookSection?.firstDataRowNumber ?? 0, (freezeStateBySheet[activeWorkbookSection?.name ?? '']?.rowNumber ?? 0))) {
        return false;
      }
      return true;
    });
    visibleRowsCacheRef.current.set(activeSheetCacheKey, nextRows);
    return nextRows;
  }, [activeSheetCacheKey, activeWorkbookSection?.firstDataRowNumber, activeWorkbookSection?.name, freezeStateBySheet, hiddenLineIdxSet, sectionRows]);

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
  const rowBlocks = useMemo(() => {
    const cached = rowBlocksCacheRef.current.get(activeSheetCacheKey);
    if (cached) return cached;
    const nextBlocks = buildCollapsibleRowBlocks(visibleSplitRows, isEqualSplitRow);
    rowBlocksCacheRef.current.set(activeSheetCacheKey, nextBlocks);
    return nextBlocks;
  }, [activeSheetCacheKey, visibleSplitRows]);

  const itemsMeasured = useMemo(() => {
    let expandedCache = itemsCacheRef.current.get(expandedBlocks);
    if (!expandedCache) {
      expandedCache = new Map();
      itemsCacheRef.current.set(expandedBlocks, expandedCache);
    }
    const itemsCacheKey = `${activeSheetCacheKey}::${collapseCtx ? '1' : '0'}`;
    const cached = expandedCache.get(itemsCacheKey);
    if (cached) return cached;

    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, expandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: 'wh',
      buildRowItem: (row) => ({ kind: 'split-line' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx }) => ({
        kind: 'split-collapse' as const,
        blockId,
        count,
        fromIdx,
        toIdx,
      }),
    });
    const nextResult = {
      value,
      duration: getNow() - start,
    };
    expandedCache.set(itemsCacheKey, nextResult);
    return nextResult;
  }, [activeSheetCacheKey, collapseCtx, expandedBlocks, rowBlocks]);
  const items = itemsMeasured.value;

  const { totalH, startIdx, endIdx, scrollToIndex, debug: rowVirtualDebug } = useVirtual(
    items.length,
    leftScrollRef as RefObject<HTMLDivElement>,
    ROW_H,
    { overscanMin: 12, overscanFactor: 1.5 },
  );
  const sheetPresentation = useMemo(
    () => buildWorkbookSheetPresentation(
      sectionRows,
      activeWorkbookSection?.name ?? '',
      baseWorkbookMetadata,
      mineWorkbookMetadata,
      activeWorkbookSection?.maxColumns ?? 1,
      showHiddenColumns,
      compareMode,
    ),
    [activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, compareMode, mineWorkbookMetadata, sectionRows, showHiddenColumns],
  );
  const activeSheetName = activeWorkbookSection?.name ?? '';
  const resolveColumnWidth = useCallback(
    (column: number) => getWorkbookColumnWidth(columnWidthBySheet, activeSheetName, column),
    [activeSheetName, columnWidthBySheet],
  );
  const virtualColumns = useHorizontalVirtualColumns({
    scrollRef: leftScrollRef as RefObject<HTMLDivElement>,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    getColumnWidth: resolveColumnWidth,
    mergedRanges: [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges],
    overscanMin: 6,
    overscanFactor: 1.5,
  });
  const rowEntryByRowNumber = useMemo(() => {
    const next = {
      base: new Map<number, WorkbookRowEntry>(),
      mine: new Map<number, WorkbookRowEntry>(),
    };

    sectionRows.forEach((row) => {
      const baseEntry = buildWorkbookRowEntry(row, 'base', activeSheetName, baseVersion, sheetPresentation.visibleColumns);
      const mineEntry = buildWorkbookRowEntry(row, 'mine', activeSheetName, mineVersion, sheetPresentation.visibleColumns);
      if (baseEntry) next.base.set(baseEntry.rowNumber, baseEntry);
      if (mineEntry) next.mine.set(mineEntry.rowNumber, mineEntry);
    });

    return next;
  }, [activeSheetName, baseVersion, mineVersion, sectionRows, sheetPresentation.visibleColumns]);
  const singleGridWidth = (LN_W + 3) + virtualColumns.totalWidth;
  const stickyHeaderHeight = ROW_H + (frozenRows.length * ROW_H);
  const contentHeight = totalH + stickyHeaderHeight;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
  const frozenCanvasRows = useMemo<WorkbookPaneCanvasRow[]>(
    () => frozenRows.map((row) => ({
      row,
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [frozenRows],
  );
  const bodySegments = useMemo(() => {
    const slice = items.slice(startIdx, endIdx);
    const segments: Array<
      | { kind: 'rows'; rows: WorkbookPaneCanvasRow[]; top: number; height: number }
      | { kind: 'collapse'; item: Extract<typeof slice[number], { kind: 'split-collapse' }>; top: number; height: number }
    > = [];
    let currentRows: WorkbookPaneCanvasRow[] = [];
    let cursorTop = 0;
    let currentRowsTop = 0;

    const flushRows = () => {
      if (currentRows.length === 0) return;
      const height = currentRows.length * ROW_H;
      segments.push({
        kind: 'rows',
        rows: currentRows,
        top: currentRowsTop,
        height,
      });
      currentRows = [];
    };

    slice.forEach((item, localIndex) => {
      const itemIndex = startIdx + localIndex;
      if (item.kind === 'split-collapse') {
        flushRows();
        segments.push({
          kind: 'collapse',
          item,
          top: cursorTop,
          height: ROW_H,
        });
        cursorTop += ROW_H;
        currentRowsTop = cursorTop;
        return;
      }

      if (currentRows.length === 0) currentRowsTop = cursorTop;
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = itemIndex > 0
        && items[itemIndex - 1]?.kind === 'split-line'
        && rowTouchesGuidedHunk((items[itemIndex - 1] as Extract<typeof items[number], { kind: 'split-line' }>).row, guidedHunkRange);
      const nextGuided = itemIndex + 1 < items.length
        && items[itemIndex + 1]?.kind === 'split-line'
        && rowTouchesGuidedHunk((items[itemIndex + 1] as Extract<typeof items[number], { kind: 'split-line' }>).row, guidedHunkRange);
      currentRows.push({
        row: item.row,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
        isGuided,
        isGuidedStart: isGuided && !prevGuided,
        isGuidedEnd: isGuided && !nextGuided,
      });
      cursorTop += ROW_H;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, items, searchMatchSet, startIdx]);
  const guidedBlocks = useMemo(() => {
    const slice = items.slice(startIdx, endIdx);
    const blocks: Array<{ top: number; height: number }> = [];
    let cursorTop = 0;
    let blockStart: number | null = null;

    slice.forEach((item) => {
      const isGuided = item.kind === 'split-line' && rowTouchesGuidedHunk(item.row, guidedHunkRange);
      if (isGuided) {
        if (blockStart == null) {
          blockStart = cursorTop;
        }
      } else if (blockStart != null) {
        blocks.push({ top: blockStart, height: cursorTop - blockStart });
        blockStart = null;
      }
      cursorTop += ROW_H;
    });

    if (blockStart != null) {
      blocks.push({ top: blockStart, height: cursorTop - blockStart });
    }
    return blocks;
  }, [endIdx, guidedHunkRange, items, startIdx]);

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
    const targetSide = source === 'left' ? 'right' : 'left';
    if (!from || !to) return;
    if (syncOwnerRef.current && syncOwnerRef.current !== source) return;
    syncOwnerRef.current = source;
    let didSync = false;
    if (Math.abs(to.scrollTop - from.scrollTop) > 1) {
      programmaticScrollUntilRef.current[targetSide] = getNow() + 180;
      to.scrollTop = from.scrollTop;
      didSync = true;
    }
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) {
      programmaticScrollUntilRef.current[targetSide] = getNow() + 180;
      to.scrollLeft = from.scrollLeft;
      didSync = true;
    }
    if (didSync) scrollSyncCountRef.current += 1;
    requestAnimationFrame(() => {
      syncOwnerRef.current = null;
    });
  }, []);
  const markProgrammaticScroll = useCallback((side: 'left' | 'right', duration = 320) => {
    programmaticScrollUntilRef.current[side] = Math.max(programmaticScrollUntilRef.current[side], getNow() + duration);
  }, []);
  const isUserScrollPaused = useCallback(
    () => getNow() < userScrollPauseUntilRef.current,
    [],
  );
  const handlePaneScroll = useCallback((source: 'left' | 'right') => {
    const now = getNow();
    if (now >= programmaticScrollUntilRef.current[source]) {
      userScrollPauseUntilRef.current = now + 260;
    }
    syncScrollPosition(source);
  }, [syncScrollPosition]);

  useEffect(() => {
    if (!active) return;
    onScrollerReady((lineIdx, align) => {
      const itemIndex = items.findIndex(item => item.kind === 'split-line' && splitRowTouchesOrAfter(item.row, lineIdx));
      if (itemIndex < 0) return;
      markProgrammaticScroll('left', 420);
      scrollToIndex(itemIndex, align);
      requestAnimationFrame(() => syncScrollPosition('left'));
    });
    return () => {
      onScrollerReady(() => {});
    };
  }, [active, items, markProgrammaticScroll, onScrollerReady, scrollToIndex, syncScrollPosition]);

  useEffect(() => {
    if (!tooltipDisabled) return;
    setHoveredCanvasCell(null);
  }, [tooltipDisabled]);

  useEffect(() => {
    setHoveredCanvasCell(null);
  }, [selectedCell?.kind, selectedCell?.sheetName, selectedCell?.side, selectedCell?.rowNumber, selectedCell?.colIndex]);

  useEffect(() => {
    lastAutoRowKeyRef.current = '';
    lastAutoCellKeyRef.current = '';
  }, [activeWorkbookSection?.name, diffLines]);

  useEffect(() => {
    if (!active) return;
    if (activeSearchLineIdx < 0) return;
    const idx = items.findIndex(item => item.kind === 'split-line' && splitRowHasLineIdx(item.row, activeSearchLineIdx));
    if (idx >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(idx, 'center');
    }
  }, [active, activeSearchLineIdx, items, markProgrammaticScroll, scrollToIndex]);

  const handleWorkbookMove = useCallback((direction: WorkbookMoveDirection) => {
    const nextSelection = moveWorkbookSelection(workbookNavigationRows, selectedCell, direction, {
      base: sheetPresentation.baseMergeRanges,
      mine: sheetPresentation.mineMergeRanges,
    });
    if (nextSelection) onSelectCell(nextSelection);
  }, [onSelectCell, selectedCell, sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges, workbookNavigationRows]);

  useEffect(() => {
    if (!active) return;
    onWorkbookNavigationReady?.(handleWorkbookMove);
    return () => onWorkbookNavigationReady?.(null);
  }, [active, handleWorkbookMove, onWorkbookNavigationReady]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoRowKeyRef.current === selectionKey) return;
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
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll('left', 360);
      scrollToIndex(idx, 'center');
      requestAnimationFrame(() => syncScrollPosition('left'));
    }
  }, [active, activeWorkbookSection, baseVersion, isUserScrollPaused, items, markProgrammaticScroll, mineVersion, scrollToIndex, selectedCell, syncScrollPosition, sheetPresentation.visibleColumns]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoCellKeyRef.current === selectionKey) return;

    const source = selectedCell.side === 'base' ? leftScrollRef.current : rightScrollRef.current;
    const target = selectedCell.side === 'base' ? rightScrollRef.current : leftScrollRef.current;
    const sourceSide = selectedCell.side === 'base' ? 'left' : 'right';
    if (!source) return;

    const rafId = requestAnimationFrame(() => {
      const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
      const mergedRanges = selectedCell.side === 'base'
        ? sheetPresentation.baseMergeRanges
        : sheetPresentation.mineMergeRanges;
      const span = getWorkbookSelectionSpanForSelection(selectedCell, mergedRanges);
      const targetColumn = virtualColumns.columnLayoutByColumn.get(span.startCol);
      const endColumn = virtualColumns.columnLayoutByColumn.get(span.endCol);
      if (!targetColumn || !endColumn) return;

      const targetLeft = LN_W + 3 + targetColumn.offset;
      const targetRight = LN_W + 3 + endColumn.offset + endColumn.width;
      const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
      const leftBoundary = source.scrollLeft + frozenWidth + 12;
      const rightBoundary = source.scrollLeft + source.clientWidth - 12;

      if (targetLeft < leftBoundary || targetLeft + targetWidth > rightBoundary) {
        lastAutoCellKeyRef.current = selectionKey;
        markProgrammaticScroll(sourceSide, 260);
        if (targetLeft < leftBoundary) {
          source.scrollLeft = Math.max(0, targetLeft - frozenWidth - 12);
        } else {
          source.scrollLeft = Math.max(0, targetLeft + targetWidth - source.clientWidth + 12);
        }
        if (target) target.scrollLeft = source.scrollLeft;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [active, activeWorkbookSection, isUserScrollPaused, markProgrammaticScroll, selectedCell, sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges, virtualColumns.columnLayoutByColumn, virtualColumns.frozenWidth]);

  const miniMapMeasured = useMemo(() => {
    const start = getNow();
    const segments: WorkbookMiniMapSegment[] = [{ tone: 'equal', height: ROW_H }];

    frozenRows.forEach((row) => {
      segments.push({
        tone: getWorkbookMiniMapTone(row, sheetPresentation.visibleColumns, compareMode),
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
        tone: getWorkbookMiniMapTone(item.row, sheetPresentation.visibleColumns, compareMode),
        height: ROW_H,
        searchHit: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    return {
      value: segments,
      duration: getNow() - start,
    };
  }, [compareMode, frozenRows, items, searchMatchSet, sheetPresentation.visibleColumns]);
  const miniMapSegments = miniMapMeasured.value;
  const perfStats = useMemo<WorkbookPerfDebugStats>(() => ({
    panel: 'horizontal',
    sheetName: activeWorkbookSection?.name ?? '',
    totalRows: items.length,
    renderedRows: Math.max(0, endIdx - startIdx),
    collapseBlocks: items.filter(item => item.kind === 'split-collapse').length,
    totalColumns: sheetPresentation.visibleColumns.length,
    renderedColumns: virtualColumns.columnEntries.length,
    frozenRows: frozenRows.length,
    frozenColumns: freezeColumnCount,
    buildItemsMs: itemsMeasured.duration,
    miniMapMs: miniMapMeasured.duration,
    rowWindowMs: rowVirtualDebug.lastCalcMs,
    rowWindowUpdates: rowVirtualDebug.rangeUpdates,
    rowOverscan: rowVirtualDebug.overscan,
    rowViewport: rowVirtualDebug.viewportHeight,
    columnWindowMs: virtualColumns.debug.lastCalcMs,
    columnWindowUpdates: virtualColumns.debug.rangeUpdates,
    columnOverscan: virtualColumns.debug.overscan,
    columnViewport: virtualColumns.debug.viewportWidth,
    miniMapClickMs: miniMapDebugRef.current?.lastClickMs ?? 0,
    miniMapClickCount: miniMapDebugRef.current?.clickCount ?? 0,
    scrollSyncCount: scrollSyncCountRef.current,
  }), [
    activeWorkbookSection?.name,
    endIdx,
    freezeColumnCount,
    frozenRows.length,
    items,
    itemsMeasured.duration,
    miniMapMeasured.duration,
    rowVirtualDebug.lastCalcMs,
    rowVirtualDebug.overscan,
    rowVirtualDebug.rangeUpdates,
    rowVirtualDebug.viewportHeight,
    sheetPresentation.visibleColumns.length,
    startIdx,
    virtualColumns.columnEntries.length,
    virtualColumns.debug.lastCalcMs,
    virtualColumns.debug.overscan,
    virtualColumns.debug.rangeUpdates,
    virtualColumns.debug.viewportWidth,
  ]);
  const pinnedCollapseWidth = virtualColumns.debug.viewportWidth > 0
    ? virtualColumns.debug.viewportWidth
    : '100%';
  const handleExpandCollapseBlock = useCallback((blockId: string, remainingCount: number) => {
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 900);
    startTransition(() => {
      setExpandedBlocks(prev => expandCollapseBlock(
        prev,
        blockId,
        remainingCount + getExpandedHiddenCount(prev, blockId),
      ));
    });
  }, []);
  const renderPinnedCollapseBar = useCallback((count: number, onExpand: () => void) => (
    <div
      style={{
        position: 'sticky',
        left: 0,
        width: pinnedCollapseWidth,
        minWidth: pinnedCollapseWidth,
        overflow: 'hidden',
        zIndex: 5,
      }}>
      <CollapseBar count={count} onExpand={onExpand} />
    </div>
  ), [pinnedCollapseWidth]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectCell(null);
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    leftScrollRef.current?.scrollTo({ top: 0, left: 0 });
    rightScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [onActiveWorkbookSheetChange, onSelectCell, workbookSections]);
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

  const handleResizeColumn = useCallback((column: number, width: number) => {
    if (!activeWorkbookSection) return;
    onColumnWidthChange(activeWorkbookSection.name, column, width);
  }, [activeWorkbookSection, onColumnWidthChange]);

  const handleAutoFitColumn = useCallback((column: number) => {
    if (!activeWorkbookSection) return;
    const width = measureWorkbookAutoFitColumnWidth(sectionRows, column, fontSize);
    onColumnWidthChange(activeWorkbookSection.name, column, width);
  }, [activeWorkbookSection, fontSize, onColumnWidthChange, sectionRows]);

  const renderPane = (
    ref: RefObject<HTMLDivElement>,
    side: 'left' | 'right',
    onSync: () => void,
  ) => (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={ref}
        onScroll={onSync}
        style={{
          flex: 1,
          overflow: 'auto',
          overflowAnchor: 'none',
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
            <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
              <WorkbookCanvasHeaderStrip
                mode="single"
                viewportWidth={virtualColumns.debug.viewportWidth}
                scrollRef={ref}
                freezeColumnCount={freezeColumnCount}
                contentWidth={singleGridWidth}
                sheetName={activeWorkbookSection?.name ?? ''}
                selectedCell={selectedCell}
                fontSize={fontSize}
                renderColumns={virtualColumns.columnEntries}
                fixedSide={side === 'left' ? 'base' : 'mine'}
                onSelectColumn={handleSelectColumn}
                onColumnWidthChange={handleResizeColumn}
                onAutoFitColumn={handleAutoFitColumn}
              />
            </div>
            {frozenCanvasRows.length > 0 && (
              <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
                <WorkbookPaneCanvasStrip
                  rows={frozenCanvasRows}
                  side={side === 'left' ? 'base' : 'mine'}
                  viewportWidth={virtualColumns.debug.viewportWidth}
                  scrollRef={ref}
                  freezeColumnCount={freezeColumnCount}
                  contentWidth={singleGridWidth}
                  sheetName={activeWorkbookSection?.name ?? ''}
                  versionLabel={side === 'left' ? baseVersion : mineVersion}
                  headerRowNumber={headerRowNumber}
                  selectedCell={selectedCell}
                  onSelectCell={onSelectCell}
                  onHoverChange={setHoveredCanvasCell}
                  fontSize={fontSize}
                  visibleColumns={sheetPresentation.visibleColumns}
                  renderColumns={virtualColumns.columnEntries}
                  columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                  mergedRanges={side === 'left' ? sheetPresentation.baseMergeRanges : sheetPresentation.mineMergeRanges}
                  rowEntryByRowNumber={side === 'left' ? rowEntryByRowNumber.base : rowEntryByRowNumber.mine}
                  compareMode={compareMode}
                />
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', top: stickyHeaderHeight + (startIdx * ROW_H), left: 0, minWidth: '100%' }}>
            {bodySegments.map((segment) => {
                if (segment.kind === 'collapse') {
                  return (
                    <div key={`${side}-collapse-${segment.item.blockId}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: '100%' }}>
                      {renderPinnedCollapseBar(
                        segment.item.count,
                        () => handleExpandCollapseBlock(segment.item.blockId, segment.item.count),
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={`${side}-canvas-${segment.rows[0]?.row.lineIdx ?? segment.top}-${segment.rows[segment.rows.length - 1]?.row.lineIdx ?? segment.height}`}
                    style={{
                      position: 'absolute',
                      top: segment.top,
                      left: 0,
                      right: 0,
                      minWidth: '100%',
                      height: segment.height,
                    }}>
                    <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
                      <WorkbookPaneCanvasStrip
                        rows={segment.rows}
                        side={side === 'left' ? 'base' : 'mine'}
                        viewportWidth={virtualColumns.debug.viewportWidth}
                        scrollRef={ref}
                        freezeColumnCount={freezeColumnCount}
                        contentWidth={singleGridWidth}
                        sheetName={activeWorkbookSection?.name ?? ''}
                        versionLabel={side === 'left' ? baseVersion : mineVersion}
                        headerRowNumber={headerRowNumber}
                        selectedCell={selectedCell}
                        onSelectCell={onSelectCell}
                        onHoverChange={setHoveredCanvasCell}
                        fontSize={fontSize}
                        visibleColumns={sheetPresentation.visibleColumns}
                        renderColumns={virtualColumns.columnEntries}
                        columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                        mergedRanges={side === 'left' ? sheetPresentation.baseMergeRanges : sheetPresentation.mineMergeRanges}
                        rowEntryByRowNumber={side === 'left' ? rowEntryByRowNumber.base : rowEntryByRowNumber.mine}
                        compareMode={compareMode}
                      />
                    </div>
                  </div>
                );
              })}
            {guidedBlocks.length > 0 && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: singleGridWidth,
                  minWidth: singleGridWidth,
                  pointerEvents: 'none',
                  zIndex: 6,
                }}>
                {guidedBlocks.map((block, index) => (
                  <div
                    key={`${side}-guided-block-${guidedPulseNonce}-${block.top}-${block.height}-${index}`}
                    style={{
                      position: 'absolute',
                      top: block.top,
                      left: 0,
                      width: singleGridWidth,
                      height: block.height,
                      boxSizing: 'border-box',
                      border: `2px solid ${T.acc2}`,
                      borderRadius: 8,
                      background: `${T.acc2}08`,
                      boxShadow: `0 0 0 1px ${T.acc2}1c`,
                      animation: 'guidedPulse 0.8s ease-out 1',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
            {renderPane(leftScrollRef, 'left', () => handlePaneScroll('left'))}
            <div style={{ width: 1, background: T.border, boxShadow: `0 0 0 1px ${T.border}` }} />
            {renderPane(rightScrollRef, 'right', () => handlePaneScroll('right'))}
          </div>
        </div>

        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={leftScrollRef as RefObject<HTMLDivElement>}
          contentHeight={contentHeight}
          debugRef={miniMapDebugRef}
        />
      </div>
      {!tooltipDisabled && <WorkbookCanvasHoverTooltip hover={hoveredCanvasCell} />}
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
