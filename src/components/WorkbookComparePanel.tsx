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
import { useVariableVirtual } from '../hooks/useVariableVirtual';
import { LN_W } from '../constants/layout';
import { FONT_UI, getWorkbookFontScale } from '../constants/typography';
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
import { buildWorkbookCompareCells, parseWorkbookRowLine } from '../utils/workbookCompare';
import {
  buildWorkbookSelectionSelector,
  ensureElementVisibleHorizontally,
  getWorkbookPairScopedSelection,
  getWorkbookRowScopedSelection,
} from '../utils/workbookSelection';
import {
  expandCollapseBlock,
  getExpandedHiddenCount,
  type CollapseExpansionState,
} from '../utils/collapseState';
import { buildCollapsedItems, buildCollapsibleRowBlocks } from '../utils/collapsibleRows';
import {
  getStackedWorkbookRowRenderHeight,
  shouldRenderSingleBaseStackedRow,
  shouldRenderSingleEqualStackedRow,
  shouldRenderSingleMineStackedRow,
} from '../utils/workbookRowBehavior';
import CollapseBar from './CollapseBar';
import SplitCell from './SplitCell';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
  type WorkbookMiniMapSegment,
  type WorkbookMiniMapTone,
} from './WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';
import WorkbookColumnCompareRow, { WorkbookColumnCompareHeader } from './WorkbookColumnCompareRow';
import WorkbookColumnsCanvasStrip, { type WorkbookColumnsCanvasRow } from './WorkbookColumnsCanvasStrip';
import WorkbookStackedCanvasStrip, { type WorkbookCanvasRenderRow } from './WorkbookStackedCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from './WorkbookPerfDebugPanel';
import WorkbookSheetTabs from './WorkbookSheetTabs';
import WorkbookVersionBar from './WorkbookVersionBar';

const CONTEXT_LINES = 3;

type CompareMode = 'stacked' | 'columns';

function compareRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function compareRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function isEqualCompareRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
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
  baseVersionLabel: string;
  mineVersionLabel: string;
  mode: CompareMode;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
  showPerfDebug?: boolean;
  showHiddenColumns?: boolean;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
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
  baseVersionLabel,
  mineVersionLabel,
  mode,
  selectedCell,
  onSelectCell,
  onWorkbookNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  freezeStateBySheet,
  showPerfDebug = false,
  showHiddenColumns = false,
}: WorkbookComparePanelProps) => {
  const T = useTheme();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(-1);

  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const sectionRowIndex = useMemo(
    () => buildWorkbookSectionRowIndex(diffLines, workbookSections),
    [diffLines, workbookSections],
  );
  const baseVersion = useMemo(() => baseVersionLabel.trim(), [baseVersionLabel]);
  const mineVersion = useMemo(() => mineVersionLabel.trim(), [mineVersionLabel]);
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
  const rowBlocks = useMemo(
    () => buildCollapsibleRowBlocks(visibleSectionRows, isEqualCompareRow),
    [visibleSectionRows],
  );

  const itemsMeasured = useMemo(() => {
    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, expandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: 'wc',
      buildRowItem: (row) => ({ kind: 'row' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx }) => ({
        kind: 'collapse' as const,
        blockId,
        count,
        fromIdx,
        toIdx,
      }),
    });
    return {
      value,
      duration: getNow() - start,
    };
  }, [rowBlocks, collapseCtx, expandedBlocks]);
  const items = itemsMeasured.value;

  const rowHeight = mode === 'stacked' ? (ROW_H * 2) + 1 : ROW_H;
  const itemHeights = useMemo(
    () => items.map((item) => {
      if (item.kind === 'collapse') return ROW_H;
      return mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(item.row, rowHeight, ROW_H)
        : rowHeight;
    }),
    [items, mode, rowHeight],
  );
  const constantVirtual = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
    rowHeight,
    { overscanMin: 12, overscanFactor: 1.5 },
  );
  const variableVirtual = useVariableVirtual(
    itemHeights,
    scrollRef as RefObject<HTMLDivElement>,
    { overscanMin: 12, overscanFactor: 1.5 },
  );
  const activeVirtual = mode === 'stacked' ? variableVirtual : constantVirtual;
  const {
    totalH,
    startIdx,
    endIdx,
    scrollToIndex,
    debug: rowVirtualDebug,
  } = activeVirtual;
  const rowWindowOffsetTop = mode === 'stacked' ? variableVirtual.offsetTop : startIdx * rowHeight;
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
      showHiddenColumns,
    ),
    [activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, mineWorkbookMetadata, sectionRows, showHiddenColumns],
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
    overscanMin: 6,
    overscanFactor: 1.5,
  });
  const showColumnHeader = mode === 'columns' || frozenRows.length === 0;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
  const rowSelectionColumn = sheetPresentation.visibleColumns[0] ?? 0;
  const useCanvasBody = (mode === 'stacked' || mode === 'columns')
    && sheetPresentation.baseMergeRanges.length === 0
    && sheetPresentation.mineMergeRanges.length === 0;
  const frozenRowsHeight = useMemo(
    () => frozenRows.reduce((sum, row) => sum + (
      mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight
    ), 0),
    [frozenRows, mode, rowHeight],
  );
  const stickyHeaderHeight = (showColumnHeader ? ROW_H : 0) + frozenRowsHeight;
  const minBodyWidth = resolveWorkbookRowWidth(sheetPresentation.visibleColumns.length, mode);
  const contentHeight = totalH + stickyHeaderHeight;
  const bodySegments = useMemo(() => {
    if (!useCanvasBody) return null;

    const slice = items.slice(startIdx, endIdx);
    const segments: Array<
      | { kind: 'rows'; rows: WorkbookCanvasRenderRow[]; top: number; height: number }
      | { kind: 'collapse'; item: Extract<typeof slice[number], { kind: 'collapse' }>; top: number; height: number }
    > = [];
    let currentRows: WorkbookCanvasRenderRow[] = [];
    let cursorTop = 0;
    let currentRowsTop = 0;

    const flushRows = () => {
      if (currentRows.length === 0) return;
      const height = currentRows.reduce((sum, row) => sum + row.height, 0);
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
      const itemHeight = itemHeights[itemIndex] ?? rowHeight;
      if (item.kind === 'collapse') {
        flushRows();
        segments.push({
          kind: 'collapse',
          item,
          top: cursorTop,
          height: itemHeight,
        });
        cursorTop += itemHeight;
        currentRowsTop = cursorTop;
        return;
      }

      if (currentRows.length === 0) currentRowsTop = cursorTop;
      const renderMode = shouldRenderSingleMineStackedRow(item.row)
        ? 'single-mine'
        : shouldRenderSingleBaseStackedRow(item.row)
        ? 'single-base'
        : shouldRenderSingleEqualStackedRow(item.row)
        ? 'single-equal'
        : 'double';
      currentRows.push({
        row: item.row,
        renderMode,
        height: itemHeight,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
      });
      cursorTop += itemHeight;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, itemHeights, items, rowHeight, searchMatchSet, startIdx, useCanvasBody]);
  const columnsBodySegments = useMemo(() => {
    if (!useCanvasBody || mode !== 'columns') return null;

    const slice = items.slice(startIdx, endIdx);
    const segments: Array<
      | { kind: 'rows'; rows: WorkbookColumnsCanvasRow[]; top: number; height: number }
      | { kind: 'collapse'; item: Extract<typeof slice[number], { kind: 'collapse' }>; top: number; height: number }
    > = [];
    let currentRows: WorkbookColumnsCanvasRow[] = [];
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

    slice.forEach((item) => {
      if (item.kind === 'collapse') {
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
      currentRows.push({
        row: item.row,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
      });
      cursorTop += ROW_H;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, items, mode, searchMatchSet, startIdx, useCanvasBody]);
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

    const container = scrollRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      const frozenWidth = mode === 'columns'
        ? LN_W + 3 + (freezeColumnCount * WORKBOOK_CELL_WIDTH * 2)
        : LN_W + 3 + (freezeColumnCount * WORKBOOK_CELL_WIDTH);
      if (useCanvasBody && selectedCell.kind === 'cell') {
        const frozenColumns = freezeColumnCount;
        const targetPosition = sheetPresentation.visibleColumns.findIndex(column => column === selectedCell.colIndex);
        if (targetPosition < 0) return;
        if (targetPosition < frozenColumns) return;
        const contentOrigin = LN_W + 3;
        const targetLeft = contentOrigin + (frozenColumns * WORKBOOK_CELL_WIDTH) + ((targetPosition - frozenColumns) * WORKBOOK_CELL_WIDTH);
        const leftBoundary = container.scrollLeft + frozenWidth + 12;
        const rightBoundary = container.scrollLeft + container.clientWidth - 12;
        if (targetLeft < leftBoundary) {
          container.scrollLeft = Math.max(0, targetLeft - frozenWidth - 12);
        } else if (targetLeft + WORKBOOK_CELL_WIDTH > rightBoundary) {
          container.scrollLeft = Math.max(0, targetLeft + WORKBOOK_CELL_WIDTH - container.clientWidth + 12);
        }
        return;
      }

      const selector = buildWorkbookSelectionSelector(selectedCell);
      if (!selector) return;
      const target = container.querySelector<HTMLElement>(selector);
      if (!target) return;
      ensureElementVisibleHorizontally(container, target, frozenWidth);
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    activeWorkbookSection,
    freezeColumnCount,
    mode,
    selectedCell,
    sheetPresentation.visibleColumns,
    useCanvasBody,
  ]);

  const miniMapMeasured = useMemo(() => {
    const start = getNow();
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

    return {
      value: segments,
      duration: getNow() - start,
    };
  }, [frozenRows, items, rowHeight, searchMatchSet, sheetPresentation.visibleColumns, showColumnHeader]);
  const miniMapSegments = miniMapMeasured.value;
  const perfStats = useMemo<WorkbookPerfDebugStats>(() => ({
    panel: mode,
    sheetName: activeWorkbookSection?.name ?? '',
    totalRows: items.length,
    renderedRows: Math.max(0, endIdx - startIdx),
    collapseBlocks: items.filter(item => item.kind === 'collapse').length,
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
    scrollSyncCount: 0,
  }), [
    activeWorkbookSection?.name,
    endIdx,
    freezeColumnCount,
    frozenRows.length,
    items,
    itemsMeasured.duration,
    miniMapMeasured.duration,
    mode,
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
    const baseRowNumber = parseWorkbookRowLine(row.left)?.rowNumber ?? null;
    const mineRowNumber = parseWorkbookRowLine(row.right)?.rowNumber ?? null;
    const scopedSelection = mode === 'columns'
      ? getWorkbookPairScopedSelection(
          selectedCell,
          activeWorkbookSection?.name ?? '',
          baseRowNumber,
          mineRowNumber,
          sheetPresentation.visibleColumns,
        )
      : getWorkbookRowScopedSelection(
          selectedCell,
          activeWorkbookSection?.name ?? '',
          rowNumber,
          sheetPresentation.visibleColumns,
        );

    if (mode === 'stacked') {
      if (shouldRenderSingleEqualStackedRow(row)) {
        return (
          <div
            style={{
              height: ROW_H,
              display: 'flex',
              width: 'max-content',
              minWidth: minBodyWidth,
              background: T.bg1,
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
              headerRowNumber={headerRowNumber}
              rowSelectionColumn={rowSelectionColumn}
              stickyLeftBase={0}
              freezeColumnCount={freezeColumnCount}
              columnCount={activeWorkbookSection?.maxColumns ?? 0}
              visibleColumns={sheetPresentation.visibleColumns}
              renderColumns={virtualColumns.columnEntries}
              leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
              trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
              mergedRanges={sheetPresentation.baseMergeRanges}
              maskEqualCells={!sticky}
              rowHeightOverride={ROW_H}
            />
          </div>
        );
      }

      if (shouldRenderSingleMineStackedRow(row)) {
        return (
          <div
            style={{
              height: ROW_H,
              display: 'flex',
              width: 'max-content',
              minWidth: minBodyWidth,
              background: sticky ? T.bg1 : undefined,
            }}>
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
              headerRowNumber={headerRowNumber}
              rowSelectionColumn={rowSelectionColumn}
              stickyLeftBase={0}
              freezeColumnCount={freezeColumnCount}
              columnCount={activeWorkbookSection?.maxColumns ?? 0}
              visibleColumns={sheetPresentation.visibleColumns}
              renderColumns={virtualColumns.columnEntries}
              leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
              trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
              mergedRanges={sheetPresentation.mineMergeRanges}
              maskEqualCells={!sticky}
              rowHeightOverride={ROW_H}
            />
          </div>
        );
      }

      if (shouldRenderSingleBaseStackedRow(row)) {
        return (
          <div
            style={{
              height: ROW_H,
              display: 'flex',
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
              headerRowNumber={headerRowNumber}
              rowSelectionColumn={rowSelectionColumn}
              stickyLeftBase={0}
              freezeColumnCount={freezeColumnCount}
              columnCount={activeWorkbookSection?.maxColumns ?? 0}
              visibleColumns={sheetPresentation.visibleColumns}
              renderColumns={virtualColumns.columnEntries}
              leadingSpacerWidth={virtualColumns.leadingSpacerWidth}
              trailingSpacerWidth={virtualColumns.trailingSpacerWidth}
              mergedRanges={sheetPresentation.baseMergeRanges}
              maskEqualCells={!sticky}
              rowHeightOverride={ROW_H}
            />
          </div>
        );
      }

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
            headerRowNumber={headerRowNumber}
            rowSelectionColumn={rowSelectionColumn}
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
            headerRowNumber={headerRowNumber}
            rowSelectionColumn={rowSelectionColumn}
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
      <WorkbookVersionBar
        baseVersion={baseVersion}
        mineVersion={mineVersion}
      />
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
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

              <div style={{ position: 'absolute', top: stickyHeaderHeight + rowWindowOffsetTop, left: 0, minWidth: minBodyWidth }}>
                {mode === 'stacked' && useCanvasBody && bodySegments ? (
                  bodySegments.map((segment, index) => {
                    if (segment.kind === 'collapse') {
                      return (
                        <div key={`collapse-${segment.item.blockId}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                          <CollapseBar
                            count={segment.item.count}
                            onExpand={() => startTransition(() => {
                              setExpandedBlocks(prev => expandCollapseBlock(
                                prev,
                                segment.item.blockId,
                                segment.item.count + getExpandedHiddenCount(prev, segment.item.blockId),
                              ));
                            })}
                          />
                        </div>
                      );
                    }

                    return (
                  <div
                    key={`canvas-rows-${index}`}
                    style={{
                      position: 'absolute',
                      top: segment.top,
                      left: 0,
                      right: 0,
                      minWidth: minBodyWidth,
                      height: segment.height,
                    }}>
                    <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
                      <WorkbookStackedCanvasStrip
                        rows={segment.rows}
                        viewportWidth={virtualColumns.debug.viewportWidth}
                        scrollRef={scrollRef as RefObject<HTMLDivElement>}
                        freezeColumnCount={freezeColumnCount}
                        sheetName={activeWorkbookSection?.name ?? ''}
                        baseVersion={baseVersion}
                        mineVersion={mineVersion}
                        headerRowNumber={headerRowNumber}
                        rowSelectionColumn={rowSelectionColumn}
                        selectedCell={selectedCell}
                        onSelectCell={onSelectCell}
                        onHoverChange={setHoveredCanvasCell}
                        fontSize={fontSize}
                        visibleColumns={sheetPresentation.visibleColumns}
                        renderColumns={virtualColumns.columnEntries}
                      />
                    </div>
                  </div>
                );
                  })
                ) : mode === 'columns' && useCanvasBody && columnsBodySegments ? (
                  columnsBodySegments.map((segment, index) => {
                    if (segment.kind === 'collapse') {
                      return (
                        <div key={`collapse-${segment.item.blockId}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                          <CollapseBar
                            count={segment.item.count}
                            onExpand={() => startTransition(() => {
                              setExpandedBlocks(prev => expandCollapseBlock(
                                prev,
                                segment.item.blockId,
                                segment.item.count + getExpandedHiddenCount(prev, segment.item.blockId),
                              ));
                            })}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`columns-canvas-${index}`}
                        style={{
                          position: 'absolute',
                          top: segment.top,
                          left: 0,
                          right: 0,
                          minWidth: minBodyWidth,
                          height: segment.height,
                        }}>
                        <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
                          <WorkbookColumnsCanvasStrip
                            rows={segment.rows}
                            viewportWidth={virtualColumns.debug.viewportWidth}
                            scrollRef={scrollRef as RefObject<HTMLDivElement>}
                            freezeColumnCount={freezeColumnCount}
                            sheetName={activeWorkbookSection?.name ?? ''}
                            baseVersion={baseVersion}
                            mineVersion={mineVersion}
                            headerRowNumber={headerRowNumber}
                            rowSelectionColumn={rowSelectionColumn}
                            selectedCell={selectedCell}
                            onSelectCell={onSelectCell}
                            onHoverChange={setHoveredCanvasCell}
                            fontSize={fontSize}
                            visibleColumns={sheetPresentation.visibleColumns}
                            renderColumns={virtualColumns.columnEntries}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  items.slice(startIdx, endIdx).map((item) => {
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
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={scrollRef as RefObject<HTMLDivElement>}
          contentHeight={contentHeight}
          debugRef={miniMapDebugRef}
        />
      </div>
      <WorkbookCanvasHoverTooltip hover={hoveredCanvasCell} />
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
