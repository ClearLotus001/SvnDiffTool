import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import type {
    DiffLine,
    Hunk,
    SearchMatch,
    SplitRow,
    WorkbookCompareMode,
    WorkbookCompareLayoutSnapshot,
    WorkbookDiffRegion,
    WorkbookFreezeState,
    WorkbookMoveDirection,
    WorkbookSelectedCell,
  } from '../types';
import { useTheme } from '../context/theme';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { useHorizontalVirtualColumns } from '../hooks/useHorizontalVirtualColumns';
import { useVariableVirtual } from '../hooks/useVariableVirtual';
import { LN_W } from '../constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '../utils/workbookSections';
import {
  buildWorkbookSheetPresentation,
  type WorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '../utils/workbookMeta';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
  type WorkbookRowEntry,
} from '../utils/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '../utils/workbookSheetIndex';
import { buildWorkbookSplitRowCompareState } from '../utils/workbookCompare';
import {
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
  getWorkbookSelectionSpanForSelection,
} from '../utils/workbookMergeLayout';
import {
  getWorkbookColumnWidth,
  measureWorkbookAutoFitColumnWidth,
  type WorkbookColumnWidthBySheet,
} from '../utils/workbookColumnWidths';
import {
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
  type CollapseExpansionState,
} from '../utils/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  findCollapsedRowTarget,
} from '../utils/collapsibleRows';
import {
  getStackedWorkbookRowRenderHeight,
  shouldRenderSingleBaseStackedRow,
  shouldRenderSingleEqualStackedRow,
  shouldRenderSingleMineStackedRow,
} from '../utils/workbookRowBehavior';
import {
  buildWorkbookCompareLayoutSnapshot,
  cloneCollapseExpansionState,
  shouldRestoreWorkbookLayoutSnapshot,
} from '../utils/workbookLayoutSnapshot';
import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '../utils/collapseNavigation';
import CollapseBar from './CollapseBar';
import CollapseJumpButton from './CollapseJumpButton';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
  type WorkbookMiniMapSegment,
  type WorkbookMiniMapTone,
} from './WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';
import WorkbookCanvasHeaderStrip from './WorkbookCanvasHeaderStrip';
import WorkbookColumnsCanvasStrip, { type WorkbookColumnsCanvasRow } from './WorkbookColumnsCanvasStrip';
import WorkbookStackedCanvasStrip, { type WorkbookCanvasRenderRow } from './WorkbookStackedCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from './WorkbookPerfDebugPanel';
import WorkbookSheetTabs from './WorkbookSheetTabs';
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
  type WorkbookDiffRegionOverlayBox,
} from './WorkbookDiffRegionOverlay';

const CONTEXT_LINES = 3;

type CompareMode = 'stacked' | 'columns';
type WorkbookCompareRenderItem =
  | { kind: 'row'; row: SplitRow; lineIdx: number }
  | { kind: 'collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number };

interface SelectionAutoScrollLock {
  sheetName: string;
  hunkIdx: number;
  rowKey: string;
  cellKey: string;
}

function compareRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function compareRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function isEqualCompareRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function rowTouchesGuidedHunk(row: SplitRow, guidedHunkRange: Hunk | null): boolean {
  if (!guidedHunkRange) return false;
  return row.lineIdxs.some(idx => idx >= guidedHunkRange.startIdx && idx <= guidedHunkRange.endIdx);
}

function getWorkbookCompareRowKey(row: SplitRow): string {
  return row.lineIdxs.length > 0 ? row.lineIdxs.join(':') : String(row.lineIdx);
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
  compareMode: WorkbookCompareMode,
): WorkbookMiniMapTone {
  return buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode).tone;
}

interface WorkbookComparePanelProps {
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
  mode: CompareMode;
  activeDiffRegion: WorkbookDiffRegion | null;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  onCollapseNavigationReady?: ((navigate: ((direction: 'prev' | 'next') => void) | null) => void) | undefined;
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
  layoutSnapshot?: WorkbookCompareLayoutSnapshot | null;
  onLayoutSnapshotChange?: ((snapshot: WorkbookCompareLayoutSnapshot) => void) | undefined;
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
  guidedHunkRange,
  guidedPulseNonce,
  showWhitespace: _showWhitespace,
  fontSize,
  onScrollerReady,
  baseVersionLabel,
  mineVersionLabel,
  mode,
  activeDiffRegion,
  selectedCell,
  onSelectCell,
  onWorkbookNavigationReady,
  onCollapseNavigationReady,
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
  layoutSnapshot = null,
  onLayoutSnapshotChange,
}: WorkbookComparePanelProps) => {
  const T = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const pendingScrollAdjustRef = useRef(0);
  const selectionAutoScrollLockRef = useRef<SelectionAutoScrollLock | null>(null);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const snapshotEmitRafRef = useRef(0);
  const restoreRafRef = useRef(0);
  const lastRestoredSnapshotKeyRef = useRef('');
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const rowBlocksCacheRef = useRef(new Map<string, ReturnType<typeof buildCollapsibleRowBlocks<SplitRow>>>());
  const itemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: WorkbookCompareRenderItem[]; duration: number }>>());
  const sheetPresentationCacheRef = useRef(new Map<string, WorkbookSheetPresentation>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const lastForcedRevealHunkIdxRef = useRef(-1);

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
  const sectionRows = useMemo(
    () => (activeWorkbookSection ? (workbookSectionRowIndex.get(activeWorkbookSection.name)?.rows ?? []) : []),
    [activeWorkbookSection, workbookSectionRowIndex],
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
  const activeSheetCacheKey = `${activeWorkbookSection?.name ?? ''}::${freezeRowNumber}`;
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getCompareRowWorkbookRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  useEffect(() => {
    visibleRowsCacheRef.current.clear();
    rowBlocksCacheRef.current.clear();
    itemsCacheRef.current = new WeakMap();
    sheetPresentationCacheRef.current.clear();
  }, [diffLines, baseWorkbookMetadata, mineWorkbookMetadata]);

  const visibleSectionRows = useMemo(() => {
    const cached = visibleRowsCacheRef.current.get(activeSheetCacheKey);
    if (cached) return cached;

    const nextRows = sectionRows.filter((row) => {
      if (row.lineIdxs.some(idx => hiddenLineIdxSet.has(idx))) return false;
      const rowNumber = getCompareRowWorkbookRowNumber(row);
      if (rowNumber != null && rowNumber <= freezeRowNumber) {
        return false;
      }
      return true;
    });

    visibleRowsCacheRef.current.set(activeSheetCacheKey, nextRows);
    return nextRows;
  }, [activeSheetCacheKey, freezeRowNumber, hiddenLineIdxSet, sectionRows]);
  const rowBlocks = useMemo(() => {
    const cached = rowBlocksCacheRef.current.get(activeSheetCacheKey);
    if (cached) return cached;
    const nextBlocks = buildCollapsibleRowBlocks(visibleSectionRows, isEqualCompareRow);
    rowBlocksCacheRef.current.set(activeSheetCacheKey, nextBlocks);
    return nextBlocks;
  }, [activeSheetCacheKey, visibleSectionRows]);

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
      blockPrefix: `wc-${activeSheetCacheKey}`,
      buildRowItem: (row) => ({ kind: 'row' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep }) => ({
        kind: 'collapse' as const,
        blockId,
        count,
        fromIdx,
        toIdx,
        hiddenStart,
        hiddenEnd,
        expandStep,
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

  const rowHeight = mode === 'stacked' ? (ROW_H * 2) : ROW_H;
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
  const markProgrammaticScroll = useCallback((duration = 320) => {
    programmaticScrollUntilRef.current = Math.max(programmaticScrollUntilRef.current, getNow() + duration);
  }, []);
  const isUserScrollPaused = useCallback(
    () => getNow() < userScrollPauseUntilRef.current,
    [],
  );
  const emitLayoutSnapshot = useCallback(() => {
    if (!active || !onLayoutSnapshotChange) return;
    const container = scrollRef.current;
    onLayoutSnapshotChange(buildWorkbookCompareLayoutSnapshot(
      mode === 'stacked' ? 'unified' : 'split-v',
      activeWorkbookSection?.name ?? null,
      activeDiffRegion?.id ?? null,
      container?.scrollTop ?? 0,
      container?.scrollLeft ?? 0,
      expandedBlocks,
    ));
  }, [active, activeDiffRegion?.id, activeWorkbookSection?.name, expandedBlocks, mode, onLayoutSnapshotChange]);
  const scheduleLayoutSnapshot = useCallback(() => {
    if (!active || !onLayoutSnapshotChange) return;
    if (snapshotEmitRafRef.current) cancelAnimationFrame(snapshotEmitRafRef.current);
    snapshotEmitRafRef.current = requestAnimationFrame(() => {
      snapshotEmitRafRef.current = 0;
      emitLayoutSnapshot();
    });
  }, [active, emitLayoutSnapshot, onLayoutSnapshotChange]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollLeft((prev) => {
        const next = el.scrollLeft;
        return Math.abs(prev - next) < 0.5 ? prev : next;
      });
      scheduleLayoutSnapshot();
      const now = getNow();
      if (now < programmaticScrollUntilRef.current) return;
      userScrollPauseUntilRef.current = now + 260;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    setScrollLeft(el.scrollLeft);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (snapshotEmitRafRef.current) cancelAnimationFrame(snapshotEmitRafRef.current);
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
    };
  }, [scheduleLayoutSnapshot]);

  useEffect(() => {
    scheduleLayoutSnapshot();
  }, [expandedBlocks, scheduleLayoutSnapshot]);

  useEffect(() => {
    scheduleLayoutSnapshot();
  }, [activeDiffRegion?.id, activeWorkbookSection?.name, scheduleLayoutSnapshot]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!active || !container) return;
    if (!layoutSnapshot || !shouldRestoreWorkbookLayoutSnapshot(
      layoutSnapshot,
      activeDiffRegion?.id ?? null,
      activeWorkbookSection?.name ?? null,
    )) {
      lastRestoredSnapshotKeyRef.current = '';
      return;
    }
    const snapshot = layoutSnapshot;

    const restoreKey = [
      snapshot.layout,
      snapshot.activeRegionId,
      snapshot.sheetName,
      snapshot.scrollTop,
      snapshot.scrollLeft,
    ].join(':');
    if (lastRestoredSnapshotKeyRef.current === restoreKey) return;
    lastRestoredSnapshotKeyRef.current = restoreKey;
    setExpandedBlocks(cloneCollapseExpansionState(snapshot.expandedBlocks));
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        markProgrammaticScroll(420);
        container.scrollTop = snapshot.scrollTop;
        container.scrollLeft = snapshot.scrollLeft;
        setScrollLeft(snapshot.scrollLeft);
      });
      restoreRafRef.current = raf2;
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
    };
  }, [
    active,
    activeDiffRegion?.id,
    activeWorkbookSection?.name,
    layoutSnapshot,
    markProgrammaticScroll,
  ]);

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
    lastForcedRevealHunkIdxRef.current = -1;
    selectionAutoScrollLockRef.current = null;
    lastCollapseJumpIndexRef.current = null;
  }, [activeWorkbookSection?.name, diffLines]);

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const target = findCollapsedRowTarget(rowBlocks, expandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix: `wc-${activeSheetCacheKey}`,
      rowHasLineIdx: compareRowHasLineIdx,
    });
    if (!target) return false;
    startTransition(() => {
      setExpandedBlocks((prev) => revealCollapsedLine(
        prev,
        target.blockId,
        target.hiddenStart,
        target.hiddenEnd,
        target.targetIndex,
      ));
    });
    return true;
  }, [activeSheetCacheKey, expandedBlocks, rowBlocks]);

  const scrollToResolvedLine = useCallback((lineIdx: number, align: 'start' | 'center' = 'center') => {
    const exactIndex = items.findIndex((item) => item.kind === 'row' && compareRowHasLineIdx(item.row, lineIdx));
    if (exactIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(exactIndex, align);
      setPendingScrollTarget((prev) => (
        prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
      ));
      return true;
    }
    if (revealLineIfCollapsed(lineIdx)) {
      setPendingScrollTarget({ lineIdx, align });
      return false;
    }
    const nearestIndex = items.findIndex((item) => item.kind === 'row' && compareRowTouchesOrAfter(item.row, lineIdx));
    if (nearestIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(nearestIndex, align);
      return true;
    }
    return false;
  }, [items, markProgrammaticScroll, revealLineIfCollapsed, scrollToIndex]);

  useEffect(() => {
    if (!active) return;
    if (activeSearchLineIdx < 0) return;
    scrollToResolvedLine(activeSearchLineIdx, 'center');
  }, [active, activeSearchLineIdx, scrollToResolvedLine]);

  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (scrollToResolvedLine(pendingScrollTarget.lineIdx, pendingScrollTarget.align)) {
      setPendingScrollTarget(null);
    }
  }, [items, pendingScrollTarget, scrollToResolvedLine]);

  useEffect(() => {
    if (mode !== 'columns') {
      pendingScrollAdjustRef.current = 0;
      return;
    }
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    markProgrammaticScroll(180);
    el.scrollTop = Math.max(0, el.scrollTop + scrollAdjust);
  }, [items, markProgrammaticScroll, mode]);

  useEffect(() => {
    if (!active) return;
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
    return () => {
      onScrollerReady(() => {});
    };
  }, [active, onScrollerReady, scrollToResolvedLine]);

  const sheetPresentation = useMemo(() => {
    const sheetPresentationKey = `${compareMode}::${activeWorkbookSection?.name ?? ''}::${activeWorkbookSection?.maxColumns ?? 1}::${showHiddenColumns ? '1' : '0'}`;
    const cached = sheetPresentationCacheRef.current.get(sheetPresentationKey);
    if (cached) return cached;

    const nextPresentation = buildWorkbookSheetPresentation(
      sectionRows,
      activeWorkbookSection?.name ?? '',
      baseWorkbookMetadata,
      mineWorkbookMetadata,
      activeWorkbookSection?.maxColumns ?? 1,
      showHiddenColumns,
      compareMode,
    );
    sheetPresentationCacheRef.current.set(sheetPresentationKey, nextPresentation);
    return nextPresentation;
  }, [activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, compareMode, mineWorkbookMetadata, sectionRows, showHiddenColumns]);
  const activeSheetName = activeWorkbookSection?.name ?? '';
  const resolveColumnWidth = useCallback(
    (column: number) => getWorkbookColumnWidth(columnWidthBySheet, activeSheetName, column),
    [activeSheetName, columnWidthBySheet],
  );
  const virtualColumns = useHorizontalVirtualColumns({
    scrollRef,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    widthMultiplier: mode === 'columns' ? 2 : 1,
    getColumnWidth: resolveColumnWidth,
    mergedRanges: mode === 'stacked'
      ? [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges]
      : [],
    overscanMin: 6,
    overscanFactor: 1.5,
  });
  const showColumnHeader = true;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
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
  const frozenRowsHeight = useMemo(
    () => frozenRows.reduce((sum, row) => sum + (
      mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight
    ), 0),
    [frozenRows, mode, rowHeight],
  );
  const stickyHeaderHeight = (showColumnHeader ? ROW_H : 0) + frozenRowsHeight;
  const minBodyWidth = (LN_W + 3) + virtualColumns.totalWidth;
  const contentHeight = totalH + stickyHeaderHeight;
  const stackedFrozenCanvasRows = useMemo<WorkbookCanvasRenderRow[]>(
    () => frozenRows.map((row) => ({
      row,
      renderMode: shouldRenderSingleMineStackedRow(row)
        ? 'single-mine'
        : shouldRenderSingleBaseStackedRow(row)
        ? 'single-base'
        : shouldRenderSingleEqualStackedRow(row)
        ? 'single-equal'
        : 'double',
      height: mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight,
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [frozenRows, mode, rowHeight],
  );
  const columnsFrozenCanvasRows = useMemo<WorkbookColumnsCanvasRow[]>(
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
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = itemIndex > 0
        && items[itemIndex - 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex - 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      const nextGuided = itemIndex + 1 < items.length
        && items[itemIndex + 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex + 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      currentRows.push({
        row: item.row,
        renderMode,
        height: itemHeight,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
        isGuided,
        isGuidedStart: isGuided && !prevGuided,
        isGuidedEnd: isGuided && !nextGuided,
      });
      cursorTop += itemHeight;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, itemHeights, items, rowHeight, searchMatchSet, startIdx]);
  const columnsBodySegments = useMemo(() => {
    if (mode !== 'columns') return null;

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

    slice.forEach((item, localIndex) => {
      const itemIndex = startIdx + localIndex;
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
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = itemIndex > 0
        && items[itemIndex - 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex - 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      const nextGuided = itemIndex + 1 < items.length
        && items[itemIndex + 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex + 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
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
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, items, mode, searchMatchSet, startIdx]);
  const sectionRowIndexByKey = useMemo(
    () => new Map(sectionRows.map((row, index) => [getWorkbookCompareRowKey(row), index])),
    [sectionRows],
  );
  const activeRegionOverlayBoxes = useMemo<WorkbookDiffRegionOverlayBox[]>(() => {
    if (!activeDiffRegion || activeDiffRegion.sheetName !== activeWorkbookSection?.name) return [];

    const visibleRowFrames = new Map<number, { top: number; height: number }>();
    let frozenCursorTop = showColumnHeader ? ROW_H : 0;
    frozenRows.forEach((row) => {
      const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(row));
      if (rowIndex == null) return;
      const height = mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight;
      visibleRowFrames.set(rowIndex, { top: frozenCursorTop, height });
      frozenCursorTop += height;
    });

    if (mode === 'stacked') {
      bodySegments.forEach((segment) => {
        if (segment.kind !== 'rows') return;
        let cursorTop = stickyHeaderHeight + segment.top;
        segment.rows.forEach((renderRow) => {
          const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
          if (rowIndex == null) {
            cursorTop += renderRow.height;
            return;
          }
          visibleRowFrames.set(rowIndex, { top: cursorTop, height: renderRow.height });
          cursorTop += renderRow.height;
        });
      });
    } else {
      (columnsBodySegments ?? []).forEach((segment) => {
        if (segment.kind !== 'rows') return;
        let cursorTop = stickyHeaderHeight + segment.top;
        segment.rows.forEach((renderRow) => {
          const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
          if (rowIndex == null) {
            cursorTop += ROW_H;
            return;
          }
          visibleRowFrames.set(rowIndex, { top: cursorTop, height: ROW_H });
          cursorTop += ROW_H;
        });
      });
    }

    const contentLeft = LN_W + 3;
    const boxes = activeDiffRegion.patches.flatMap((patch, patchIndex) => {
      const visibleRows = Array.from(visibleRowFrames.entries())
        .filter(([rowIndex]) => rowIndex >= patch.startRowIndex && rowIndex <= patch.endRowIndex)
        .sort((left, right) => left[0] - right[0]);
      if (visibleRows.length === 0) return [];

      const top = Math.min(...visibleRows.map(([, frame]) => frame.top));
      const bottom = Math.max(...visibleRows.map(([, frame]) => frame.top + frame.height));
      const geometries = [];

      if (mode === 'stacked') {
        const bounds = getWorkbookColumnSpanBounds(
          patch.startCol,
          patch.endCol,
          virtualColumns.columnLayoutByColumn,
          'single',
          freezeColumnCount,
        );
        const geometry = bounds
          ? getWorkbookCanvasSpanGeometry(bounds, contentLeft, scrollLeft, virtualColumns.frozenWidth)
          : null;
        if (geometry) geometries.push({ geometry, sideKey: 'stacked' });
      } else {
        if (patch.hasBaseSide) {
          const bounds = getWorkbookColumnSpanBounds(
            patch.startCol,
            patch.endCol,
            virtualColumns.columnLayoutByColumn,
            'paired-base',
            freezeColumnCount,
          );
          const geometry = bounds
            ? getWorkbookCanvasSpanGeometry(bounds, contentLeft, scrollLeft, virtualColumns.frozenWidth)
            : null;
          if (geometry) geometries.push({ geometry, sideKey: 'base' });
        }
        if (patch.hasMineSide) {
          const bounds = getWorkbookColumnSpanBounds(
            patch.startCol,
            patch.endCol,
            virtualColumns.columnLayoutByColumn,
            'paired-mine',
            freezeColumnCount,
          );
          const geometry = bounds
            ? getWorkbookCanvasSpanGeometry(bounds, contentLeft, scrollLeft, virtualColumns.frozenWidth)
            : null;
          if (geometry) geometries.push({ geometry, sideKey: 'mine' });
        }
      }

      return geometries.map(({ geometry, sideKey }) => ({
        key: `${activeDiffRegion.id}:${patchIndex}:${sideKey}`,
        top: Math.max(0, top - 2),
        left: Math.max(0, geometry.left - 2),
        width: Math.max(0, geometry.right - geometry.left + 4),
        height: Math.max(0, bottom - top + 4),
      }));
    });

    return mergeWorkbookDiffRegionOverlayBoxes(boxes)
      .filter((box) => box.width > 6 && box.height > 6);
  }, [
    activeDiffRegion,
    activeWorkbookSection?.name,
    bodySegments,
    columnsBodySegments,
    freezeColumnCount,
    frozenRows,
    mode,
    rowHeight,
    scrollLeft,
    sectionRowIndexByKey,
    showColumnHeader,
    stickyHeaderHeight,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);
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

  const isSelectionAutoScrollLocked = useCallback((selectionKey: string, target: 'row' | 'cell') => {
    const lock = selectionAutoScrollLockRef.current;
    if (!lock) return false;
    if (lock.sheetName !== (activeWorkbookSection?.name ?? '')) return false;
    if (lock.hunkIdx !== activeHunkIdx) return false;
    return target === 'row' ? lock.rowKey === selectionKey : lock.cellKey === selectionKey;
  }, [activeHunkIdx, activeWorkbookSection?.name]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'row')) return;
    if (!shouldForceReveal && lastAutoRowKeyRef.current === selectionKey) return;
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
    if (idx >= 0) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll(360);
      scrollToIndex(idx, 'center');
    }
  }, [active, activeHunkIdx, activeWorkbookSection, baseVersion, isUserScrollPaused, items, markProgrammaticScroll, mineVersion, scrollToIndex, selectedCell, sheetPresentation.visibleColumns]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'cell')) return;
    if (!shouldForceReveal && lastAutoCellKeyRef.current === selectionKey) return;

    const container = scrollRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
      const mergedRanges = selectedCell.side === 'base'
        ? sheetPresentation.baseMergeRanges
        : sheetPresentation.mineMergeRanges;
      const span = getWorkbookSelectionSpanForSelection(selectedCell, mergedRanges);
      const targetColumn = virtualColumns.columnLayoutByColumn.get(span.startCol);
      const endColumn = virtualColumns.columnLayoutByColumn.get(span.endCol);
      if (!targetColumn || !endColumn) return;

      const contentOrigin = LN_W + 3;
      const sideOffset = mode === 'columns' && selectedCell.side === 'mine'
        ? targetColumn.width
        : 0;
      const targetLeft = contentOrigin + targetColumn.offset + sideOffset;
      const targetRight = contentOrigin + endColumn.offset + (
        mode === 'columns'
          ? selectedCell.side === 'mine'
            ? endColumn.displayWidth
            : endColumn.width
          : endColumn.width
      );
      const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
      const leftBoundary = container.scrollLeft + frozenWidth + 12;
      const rightBoundary = container.scrollLeft + container.clientWidth - 12;

      if (targetLeft < leftBoundary || targetLeft + targetWidth > rightBoundary) {
        if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
        lastAutoCellKeyRef.current = selectionKey;
        markProgrammaticScroll(260);
        if (targetLeft < leftBoundary) {
          container.scrollLeft = Math.max(0, targetLeft - frozenWidth - 12);
        } else {
          container.scrollLeft = Math.max(0, targetLeft + targetWidth - container.clientWidth + 12);
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeHunkIdx,
    activeWorkbookSection,
    freezeColumnCount,
    isUserScrollPaused,
    markProgrammaticScroll,
    mode,
    selectedCell,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);

  const miniMapMeasured = useMemo(() => {
    const start = getNow();
    const segments: WorkbookMiniMapSegment[] = [];
    const resolveDisplayHeight = (row: SplitRow) => (
      mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight
    );

    if (showColumnHeader) {
      segments.push({ tone: 'equal', height: ROW_H });
    }

    frozenRows.forEach((row) => {
      segments.push({
        tone: getWorkbookMiniMapTone(row, sheetPresentation.visibleColumns, compareMode),
        height: resolveDisplayHeight(row),
        searchHit: row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    items.forEach((item, index) => {
      if (item.kind === 'collapse') {
        segments.push({ tone: 'equal', height: itemHeights[index] ?? rowHeight });
        return;
      }

      segments.push({
        tone: getWorkbookMiniMapTone(item.row, sheetPresentation.visibleColumns, compareMode),
        height: resolveDisplayHeight(item.row),
        searchHit: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
      });
    });

    return {
      value: segments,
      duration: getNow() - start,
    };
  }, [compareMode, frozenRows, itemHeights, items, mode, rowHeight, searchMatchSet, sheetPresentation.visibleColumns, showColumnHeader]);
  const miniMapSegments = miniMapMeasured.value;
  const collapseIndexes = useMemo(
    () => getCollapseIndexes(items, (item) => item.kind === 'collapse'),
    [items],
  );
  const totalCollapseCount = useMemo(
    () => countRemainingCollapses(items, 0, (item) => item.kind === 'collapse'),
    [items],
  );
  const activeCollapsePosition = useMemo(
    () => resolveActiveCollapsePosition(collapseIndexes, lastCollapseJumpIndexRef.current, startIdx),
    [collapseIndexes, startIdx],
  );
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
  const pinnedCollapseWidth = virtualColumns.debug.viewportWidth > 0
    ? virtualColumns.debug.viewportWidth
    : '100%';
  const handleExpandCollapseBlock = useCallback((
    blockId: string,
    hiddenStart: number,
    hiddenEnd: number,
    revealCount: number,
    mode: 'partial' | 'full' = 'partial',
  ) => {
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 900);
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    if (selectedCell && activeWorkbookSection && selectedCell.sheetName === activeWorkbookSection.name) {
      const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
      selectionAutoScrollLockRef.current = {
        sheetName: activeWorkbookSection.name,
        hunkIdx: activeHunkIdx,
        rowKey: selectedCell.kind !== 'column' ? selectionKey : '',
        cellKey: selectedCell.kind !== 'row' ? selectionKey : '',
      };
      if (selectedCell.kind !== 'column') lastAutoRowKeyRef.current = selectionKey;
      if (selectedCell.kind !== 'row') lastAutoCellKeyRef.current = selectionKey;
    }
    if (mode === 'partial' && revealCount > 0) {
      const segmentLength = hiddenEnd - hiddenStart + 1;
      pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(segmentLength, revealCount) * ROW_H;
    }
    startTransition(() => {
      setExpandedBlocks((prev) => (
        mode === 'full'
          ? expandCollapseBlockFully(prev, blockId, hiddenStart, hiddenEnd)
          : expandCollapseBlock(prev, blockId, hiddenStart, hiddenEnd, revealCount)
      ));
    });
  }, [activeHunkIdx, activeWorkbookSection, selectedCell]);
  const handleJumpToNextCollapse = useCallback(() => {
    const nextCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      endIdx,
      'next',
    );
    if (nextCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = nextCollapseIndex;
    markProgrammaticScroll(360);
    scrollToIndex(nextCollapseIndex, 'start');
  }, [collapseIndexes, endIdx, markProgrammaticScroll, scrollToIndex]);
  const handleJumpToPreviousCollapse = useCallback(() => {
    const previousCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      startIdx,
      'prev',
    );
    if (previousCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = previousCollapseIndex;
    markProgrammaticScroll(360);
    scrollToIndex(previousCollapseIndex, 'start');
  }, [collapseIndexes, markProgrammaticScroll, scrollToIndex, startIdx]);
  const renderPinnedCollapseBar = useCallback((count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void) => (
    <div
      style={{
        position: 'sticky',
        left: 0,
        width: pinnedCollapseWidth,
        minWidth: pinnedCollapseWidth,
        overflow: 'hidden',
        zIndex: 5,
      }}>
      <CollapseBar count={count} expandCount={expandCount} onExpand={onExpand} onExpandAll={onExpandAll} />
    </div>
  ), [pinnedCollapseWidth]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectCell(null);
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
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

  const stackedHeaderSide = selectedCell && selectedCell.sheetName === activeWorkbookSection?.name
    ? selectedCell.side
    : 'base';

  useEffect(() => {
    if (!active) return;
    onCollapseNavigationReady?.((direction) => {
      if (direction === 'prev') {
        handleJumpToPreviousCollapse();
        return;
      }
      handleJumpToNextCollapse();
    });
    return () => onCollapseNavigationReady?.(null);
  }, [active, handleJumpToNextCollapse, handleJumpToPreviousCollapse, onCollapseNavigationReady]);

  const renderStickyCanvas = () => {
    if (mode === 'stacked') {
      return (
        <>
          {showColumnHeader && (
            <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
              <WorkbookCanvasHeaderStrip
                mode="single"
                viewportWidth={virtualColumns.debug.viewportWidth}
                scrollRef={scrollRef as RefObject<HTMLDivElement>}
                freezeColumnCount={freezeColumnCount}
                contentWidth={minBodyWidth}
                sheetName={activeWorkbookSection?.name ?? ''}
                selectedCell={selectedCell}
                fontSize={fontSize}
                renderColumns={virtualColumns.columnEntries}
                fixedSide={stackedHeaderSide}
                showFixedSideAccent={false}
                onSelectColumn={handleSelectColumn}
                onColumnWidthChange={handleResizeColumn}
                onAutoFitColumn={handleAutoFitColumn}
              />
            </div>
          )}
          {stackedFrozenCanvasRows.length > 0 && (
            <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
              <WorkbookStackedCanvasStrip
                rows={stackedFrozenCanvasRows}
                viewportWidth={virtualColumns.debug.viewportWidth}
                scrollRef={scrollRef as RefObject<HTMLDivElement>}
                freezeColumnCount={freezeColumnCount}
                contentWidth={minBodyWidth}
                sheetName={activeWorkbookSection?.name ?? ''}
                baseVersion={baseVersion}
                mineVersion={mineVersion}
                headerRowNumber={headerRowNumber}
                selectedCell={selectedCell}
                onSelectCell={onSelectCell}
                onHoverChange={setHoveredCanvasCell}
                fontSize={fontSize}
                visibleColumns={sheetPresentation.visibleColumns}
                renderColumns={virtualColumns.columnEntries}
                columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                baseMergedRanges={sheetPresentation.baseMergeRanges}
                mineMergedRanges={sheetPresentation.mineMergeRanges}
                baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                compareMode={compareMode}
              />
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {showColumnHeader && (
          <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
            <WorkbookCanvasHeaderStrip
              mode="paired-wide"
              viewportWidth={virtualColumns.debug.viewportWidth}
              scrollRef={scrollRef as RefObject<HTMLDivElement>}
              freezeColumnCount={freezeColumnCount}
              contentWidth={minBodyWidth}
              sheetName={activeWorkbookSection?.name ?? ''}
              selectedCell={selectedCell}
              fontSize={fontSize}
              renderColumns={virtualColumns.columnEntries}
              onSelectColumn={handleSelectColumn}
              onColumnWidthChange={handleResizeColumn}
              onAutoFitColumn={handleAutoFitColumn}
            />
          </div>
        )}
        {columnsFrozenCanvasRows.length > 0 && (
          <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
            <WorkbookColumnsCanvasStrip
              rows={columnsFrozenCanvasRows}
              viewportWidth={virtualColumns.debug.viewportWidth}
              scrollRef={scrollRef as RefObject<HTMLDivElement>}
              freezeColumnCount={freezeColumnCount}
              contentWidth={minBodyWidth}
              sheetName={activeWorkbookSection?.name ?? ''}
              baseVersion={baseVersion}
              mineVersion={mineVersion}
              headerRowNumber={headerRowNumber}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              onHoverChange={setHoveredCanvasCell}
              fontSize={fontSize}
              visibleColumns={sheetPresentation.visibleColumns}
              renderColumns={virtualColumns.columnEntries}
              columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
              baseMergedRanges={sheetPresentation.baseMergeRanges}
              mineMergedRanges={sheetPresentation.mineMergeRanges}
              baseRowEntryByRowNumber={rowEntryByRowNumber.base}
              mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
              compareMode={compareMode}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              overflowAnchor: 'none',
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
                {renderStickyCanvas()}
              </div>

              <div style={{ position: 'absolute', top: stickyHeaderHeight + rowWindowOffsetTop, left: 0, minWidth: minBodyWidth }}>
                {mode === 'stacked' ? (
                  bodySegments.map((segment) => {
                    if (segment.kind === 'collapse') {
                      return (
                        <div key={`collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                          {renderPinnedCollapseBar(
                            segment.item.count,
                            Math.min(segment.item.count, segment.item.expandStep),
                            () => handleExpandCollapseBlock(
                              segment.item.blockId,
                              segment.item.hiddenStart,
                              segment.item.hiddenEnd,
                              Math.min(segment.item.count, segment.item.expandStep),
                            ),
                            () => handleExpandCollapseBlock(
                              segment.item.blockId,
                              segment.item.hiddenStart,
                              segment.item.hiddenEnd,
                              segment.item.count,
                              'full',
                            ),
                          )}
                        </div>
                      );
                    }

                    return (
                  <div
                        key={`canvas-rows-${segment.rows[0]?.row.lineIdx ?? segment.top}-${segment.rows[segment.rows.length - 1]?.row.lineIdx ?? segment.height}`}
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
                        contentWidth={minBodyWidth}
                        sheetName={activeWorkbookSection?.name ?? ''}
                        baseVersion={baseVersion}
                        mineVersion={mineVersion}
                        headerRowNumber={headerRowNumber}
                        selectedCell={selectedCell}
                        onSelectCell={onSelectCell}
                        onHoverChange={setHoveredCanvasCell}
                        fontSize={fontSize}
                        visibleColumns={sheetPresentation.visibleColumns}
                        renderColumns={virtualColumns.columnEntries}
                        columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                        baseMergedRanges={sheetPresentation.baseMergeRanges}
                        mineMergedRanges={sheetPresentation.mineMergeRanges}
                        baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                        mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                        compareMode={compareMode}
                      />
                    </div>
                  </div>
                );
                  })
                ) : (
                  (columnsBodySegments ?? []).map((segment) => {
                    if (segment.kind === 'collapse') {
                      return (
                        <div key={`collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                          {renderPinnedCollapseBar(
                            segment.item.count,
                            Math.min(segment.item.count, segment.item.expandStep),
                            () => handleExpandCollapseBlock(
                              segment.item.blockId,
                              segment.item.hiddenStart,
                              segment.item.hiddenEnd,
                              Math.min(segment.item.count, segment.item.expandStep),
                            ),
                            () => handleExpandCollapseBlock(
                              segment.item.blockId,
                              segment.item.hiddenStart,
                              segment.item.hiddenEnd,
                              segment.item.count,
                              'full',
                            ),
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`columns-canvas-${segment.rows[0]?.row.lineIdx ?? segment.top}-${segment.rows[segment.rows.length - 1]?.row.lineIdx ?? segment.height}`}
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
                            contentWidth={minBodyWidth}
                            sheetName={activeWorkbookSection?.name ?? ''}
                            baseVersion={baseVersion}
                            mineVersion={mineVersion}
                            headerRowNumber={headerRowNumber}
                            selectedCell={selectedCell}
                            onSelectCell={onSelectCell}
                            onHoverChange={setHoveredCanvasCell}
                            fontSize={fontSize}
                            visibleColumns={sheetPresentation.visibleColumns}
                            renderColumns={virtualColumns.columnEntries}
                            columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                            baseMergedRanges={sheetPresentation.baseMergeRanges}
                            mineMergedRanges={sheetPresentation.mineMergeRanges}
                            baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                            mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                            compareMode={compareMode}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {activeRegionOverlayBoxes.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 6,
                  }}>
                  <div
                    style={{
                      position: 'sticky',
                      left: 0,
                      width: virtualColumns.debug.viewportWidth,
                      overflow: 'hidden',
                      pointerEvents: 'none',
                    }}>
                    <WorkbookDiffRegionOverlay
                      boxes={activeRegionOverlayBoxes.map((box) => ({
                        ...box,
                        key: `${guidedPulseNonce}:${box.key}`,
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <CollapseJumpButton
            onPrev={handleJumpToPreviousCollapse}
            onNext={handleJumpToNextCollapse}
            currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
            totalCount={totalCollapseCount}
            storageKey={`workbook-${mode}`}
          />
        </div>
        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={scrollRef as RefObject<HTMLDivElement>}
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

export default WorkbookComparePanel;
