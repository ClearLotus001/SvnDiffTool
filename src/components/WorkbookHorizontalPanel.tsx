import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import type {
    DiffLine,
    Hunk,
    SearchMatch,
    SplitRow,
    WorkbookCompareMode,
    WorkbookDiffRegion,
    WorkbookFreezeState,
    WorkbookHiddenStateBySheet,
    WorkbookHorizontalLayoutSnapshot,
    WorkbookMoveDirection,
    WorkbookSelectionMode,
    WorkbookSelectedCell,
    WorkbookSelectionRequest,
    WorkbookSelectionState,
  } from '../types';
import { useTheme } from '../context/theme';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { useHorizontalVirtualColumns } from '../hooks/useHorizontalVirtualColumns';
import { useWorkbookExpandedBlocksState } from '../hooks/useWorkbookExpandedBlocksState';
import { LN_W } from '../constants/layout';
import { WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '../utils/workbookSections';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
  moveWorkbookSelection,
  type WorkbookRowEntry,
} from '../utils/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '../utils/workbookSheetIndex';
import {
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
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
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
  type CollapseExpansionState,
} from '../utils/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  describeCollapsedRowBlocks,
  findCollapsedRowTarget,
} from '../utils/collapsibleRows';
import { overlayHiddenWorkbookRowsOnItems } from '../utils/workbookManualVisibility';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '../utils/workbookMeta';
import { buildWorkbookCollapseBlockPrefix } from '../utils/workbookCollapse';
import {
  applyWorkbookFreezeToExpandedBlocks,
  getResolvedWorkbookFreezeColCount,
  getResolvedWorkbookFreezeRowNumber,
} from '../utils/workbookFreeze';
import {
  buildWorkbookHorizontalLayoutSnapshot,
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
import WorkbookPaneCanvasStrip, { type WorkbookPaneCanvasRow } from './WorkbookPaneCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from './WorkbookPerfDebugPanel';
import WorkbookSheetTabs from './WorkbookSheetTabs';
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
  type WorkbookDiffRegionOverlayBox,
} from './WorkbookDiffRegionOverlay';
import WorkbookHiddenRowsBar from './WorkbookHiddenRowsBar';

const CONTEXT_LINES = 3;

function splitRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function splitRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
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

function getWorkbookHorizontalRowKey(row: SplitRow): string {
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

type WorkbookHorizontalRenderItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[]; count: number };

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
  activeDiffRegion: WorkbookDiffRegion | null;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  onCollapseNavigationReady?: ((navigate: ((direction: 'prev' | 'next') => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  workbookHiddenStateBySheet: WorkbookHiddenStateBySheet;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
  columnWidthBySheet: WorkbookColumnWidthBySheet;
  onColumnWidthChange: (sheetName: string, column: number, width: number) => void;
  onRevealHiddenRows: (sheetName: string, rowNumbers: number[]) => void;
  onRevealHiddenColumns: (sheetName: string, columns: number[]) => void;
  workbookSections: WorkbookSection[];
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>;
  activeWorkbookSheetName: string | null;
  onActiveWorkbookSheetChange: (sheetName: string | null) => void;
  compareMode: WorkbookCompareMode;
  sharedExpandedBlocks?: CollapseExpansionState | null;
  onExpandedBlocksChange?: ((sheetName: string | null, activeRegionId: string | null, expandedBlocks: CollapseExpansionState) => void) | undefined;
  active?: boolean;
  showPerfDebug?: boolean;
  showHiddenColumns?: boolean;
  tooltipDisabled?: boolean;
  layoutSnapshot?: WorkbookHorizontalLayoutSnapshot | null;
  onLayoutSnapshotChange?: ((snapshot: WorkbookHorizontalLayoutSnapshot) => void) | undefined;
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
  activeDiffRegion,
  selection,
  onSelectionRequest,
  onWorkbookNavigationReady,
  onCollapseNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  workbookHiddenStateBySheet,
  freezeStateBySheet,
  columnWidthBySheet,
  onColumnWidthChange,
  onRevealHiddenRows,
  onRevealHiddenColumns,
  workbookSections,
  workbookSectionRowIndex,
  activeWorkbookSheetName,
  onActiveWorkbookSheetChange,
  compareMode,
  sharedExpandedBlocks = null,
  onExpandedBlocksChange,
  active = true,
  showPerfDebug = false,
  showHiddenColumns = false,
  tooltipDisabled = false,
  layoutSnapshot = null,
  onLayoutSnapshotChange,
}: WorkbookHorizontalPanelProps) => {
  const T = useTheme();
  const selectedCell = selection.primary;
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustRef = useRef(0);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const scrollSyncCountRef = useRef(0);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const snapshotEmitRafRef = useRef(0);
  const restoreRafRef = useRef(0);
  const lastRestoredSnapshotKeyRef = useRef('');
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const itemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: WorkbookHorizontalRenderItem[]; duration: number }>>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const suppressAutoScrollUntilRef = useRef(0);
  const lastFreezeSignatureRef = useRef<string | null>(null);
  const {
    expandedBlocks,
    setExpandedBlocks,
    isContextSettled: isExpandedBlocksContextSettled,
  } = useWorkbookExpandedBlocksState({
    sheetName: activeWorkbookSection?.name ?? null,
    activeRegionId: activeDiffRegion?.id ?? null,
    layoutSnapshot,
    sharedExpandedBlocks,
  });
  const baseVersion = useMemo(() => baseVersionLabel.trim(), [baseVersionLabel]);
  const mineVersion = useMemo(() => mineVersionLabel.trim(), [mineVersionLabel]);

  const searchMatchSet = useMemo(() => new Set(searchMatches.map(match => match.lineIdx)), [searchMatches]);
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
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
  const activeHiddenState = useMemo(() => {
    if (!activeWorkbookSection) {
      return {
        hiddenRows: [],
        hiddenColumns: [],
      };
    }
    return workbookHiddenStateBySheet[activeWorkbookSection.name] ?? {
      hiddenRows: [],
      hiddenColumns: [],
    };
  }, [activeWorkbookSection, workbookHiddenStateBySheet]);
  const freezeRowNumber = useMemo(
    () => getResolvedWorkbookFreezeRowNumber(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    }),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
  );
  const activeSheetCacheKey = activeWorkbookSection?.name ?? '';

  useEffect(() => {
    visibleRowsCacheRef.current.clear();
    itemsCacheRef.current = new WeakMap();
  }, [diffLines]);

  const collapseSourceRows = useMemo(() => {
    const cached = visibleRowsCacheRef.current.get(activeSheetCacheKey);
    if (cached) return cached;

    const nextRows = sectionRows.filter(
      (row) => !row.lineIdxs.some((lineIdx) => hiddenLineIdxSet.has(lineIdx)),
    );
    visibleRowsCacheRef.current.set(activeSheetCacheKey, nextRows);
    return nextRows;
  }, [activeSheetCacheKey, hiddenLineIdxSet, sectionRows]);
  const hiddenRowNumberSet = useMemo(
    () => new Set(activeHiddenState.hiddenRows),
    [activeHiddenState.hiddenRows],
  );
  const collapseBlockPrefix = buildWorkbookCollapseBlockPrefix(activeSheetCacheKey);
  const rowBlocks = useMemo(
    () => buildCollapsibleRowBlocks(collapseSourceRows, isEqualSplitRow),
    [collapseSourceRows],
  );
  const collapsedRowDescriptors = useMemo(
    () => describeCollapsedRowBlocks(rowBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
    }),
    [collapseBlockPrefix, rowBlocks],
  );
  const effectiveExpandedBlocks = useMemo(
    () => applyWorkbookFreezeToExpandedBlocks(
      expandedBlocks,
      collapsedRowDescriptors,
      freezeRowNumber,
      getWorkbookSplitRowNumber,
    ),
    [collapsedRowDescriptors, expandedBlocks, freezeRowNumber],
  );

  const freezeColumnCount = useMemo(
    () => getResolvedWorkbookFreezeColCount(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    }),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
  );
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  const collapsedItemsMeasured = useMemo(() => {
    let expandedCache = itemsCacheRef.current.get(effectiveExpandedBlocks);
    if (!expandedCache) {
      expandedCache = new Map();
      itemsCacheRef.current.set(effectiveExpandedBlocks, expandedCache);
    }
    const itemsCacheKey = `${activeSheetCacheKey}::${freezeRowNumber}::${collapseCtx ? '1' : '0'}`;
    const cached = expandedCache.get(itemsCacheKey);
    if (cached) return cached;

    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, effectiveExpandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      buildRowItem: (row) => ({ kind: 'split-line' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep }) => ({
        kind: 'split-collapse' as const,
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
  }, [activeSheetCacheKey, collapseBlockPrefix, collapseCtx, effectiveExpandedBlocks, freezeRowNumber, rowBlocks]);
  const renderItemsMeasured = useMemo(() => {
    if (hiddenRowNumberSet.size === 0) {
      return {
        value: collapsedItemsMeasured.value as WorkbookHorizontalRenderItem[],
        duration: collapsedItemsMeasured.duration,
      };
    }

    const start = getNow();
    const value = overlayHiddenWorkbookRowsOnItems<WorkbookHorizontalRenderItem, SplitRow>(
      collapsedItemsMeasured.value,
      hiddenRowNumberSet,
      (item) => item.kind === 'split-line' ? item.row : null,
      getWorkbookSplitRowNumber,
      (rows, rowNumbers) => ({
        kind: 'hidden-rows',
        rows,
        rowNumbers,
        count: rowNumbers.length,
      }),
    );
    return {
      value,
      duration: getNow() - start,
    };
  }, [collapsedItemsMeasured.duration, collapsedItemsMeasured.value, hiddenRowNumberSet]);
  const itemsMeasured = useMemo(() => {
    const start = getNow();
    const value = renderItemsMeasured.value.filter((item) => {
      if (item.kind === 'split-collapse') return true;
      if (item.kind === 'hidden-rows') {
        return item.rowNumbers.some((rowNumber) => rowNumber > freezeRowNumber);
      }
      const rowNumber = getWorkbookSplitRowNumber(item.row);
      return rowNumber == null || rowNumber > freezeRowNumber;
    });
    return {
      value,
      duration: getNow() - start,
    };
  }, [freezeRowNumber, renderItemsMeasured.value]);
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
      activeHiddenState.hiddenColumns,
    ),
    [activeHiddenState.hiddenColumns, activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, compareMode, mineWorkbookMetadata, sectionRows, showHiddenColumns],
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
  const rowItemIndexBySide = useMemo(() => {
    const next = {
      base: new Map<number, number>(),
      mine: new Map<number, number>(),
    };

    items.forEach((item, index) => {
      if (item.kind !== 'split-line') return;

      const baseRowNumber = getWorkbookSideRowNumber(item.row, 'base');
      if (baseRowNumber != null && !next.base.has(baseRowNumber)) {
        next.base.set(baseRowNumber, index);
      }

      const mineRowNumber = getWorkbookSideRowNumber(item.row, 'mine');
      if (mineRowNumber != null && !next.mine.has(mineRowNumber)) {
        next.mine.set(mineRowNumber, index);
      }
    });

    return next;
  }, [items]);
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
      | { kind: 'hidden-rows'; item: Extract<typeof slice[number], { kind: 'hidden-rows' }>; top: number; height: number }
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
      if (item.kind === 'hidden-rows') {
        flushRows();
        segments.push({
          kind: 'hidden-rows',
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
  const sectionRowIndexByKey = useMemo(
    () => new Map(sectionRows.map((row, index) => [getWorkbookHorizontalRowKey(row), index])),
    [sectionRows],
  );
  const activeRegionOverlayBoxesBySide = useMemo<Record<'left' | 'right', WorkbookDiffRegionOverlayBox[]>>(() => {
    const empty = { left: [] as WorkbookDiffRegionOverlayBox[], right: [] as WorkbookDiffRegionOverlayBox[] };
    if (!activeDiffRegion || activeDiffRegion.sheetName !== activeWorkbookSection?.name) return empty;

    const visibleRowFrames = new Map<number, { top: number; height: number }>();
    let frozenCursorTop = ROW_H;
    frozenRows.forEach((row) => {
      const rowIndex = sectionRowIndexByKey.get(getWorkbookHorizontalRowKey(row));
      if (rowIndex == null) return;
      visibleRowFrames.set(rowIndex, { top: frozenCursorTop, height: ROW_H });
      frozenCursorTop += ROW_H;
    });
    bodySegments.forEach((segment) => {
      if (segment.kind !== 'rows') return;
      let cursorTop = stickyHeaderHeight + segment.top;
      segment.rows.forEach((renderRow) => {
        const rowIndex = sectionRowIndexByKey.get(getWorkbookHorizontalRowKey(renderRow.row));
        if (rowIndex == null) {
          cursorTop += ROW_H;
          return;
        }
        visibleRowFrames.set(rowIndex, { top: cursorTop, height: ROW_H });
        cursorTop += ROW_H;
      });
    });

    const contentLeft = LN_W + 3;
    const buildSideBoxes = (side: 'left' | 'right', regionSide: 'base' | 'mine') => {
      const boxes = activeDiffRegion.patches.flatMap((patch, patchIndex) => {
        const hasSide = regionSide === 'base' ? patch.hasBaseSide : patch.hasMineSide;
        if (!hasSide) return [];

        const visibleRows = Array.from(visibleRowFrames.entries())
          .filter(([rowIndex]) => rowIndex >= patch.startRowIndex && rowIndex <= patch.endRowIndex)
          .sort((left, right) => left[0] - right[0]);
        if (visibleRows.length === 0) return [];

        const top = Math.min(...visibleRows.map(([, frame]) => frame.top));
        const bottom = Math.max(...visibleRows.map(([, frame]) => frame.top + frame.height));
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
        if (!geometry) return [];

        return [{
          key: `${activeDiffRegion.id}:${side}:${patchIndex}`,
          top: Math.max(0, top - 2),
          left: Math.max(0, geometry.left - 2),
          width: Math.max(0, geometry.right - geometry.left + 4),
          height: Math.max(0, bottom - top + 4),
        }];
      });

      return mergeWorkbookDiffRegionOverlayBoxes(boxes)
        .filter((box) => box.width > 6 && box.height > 6);
    };

    return {
      left: buildSideBoxes('left', 'base'),
      right: buildSideBoxes('right', 'mine'),
    };
  }, [
    activeDiffRegion,
    activeWorkbookSection?.name,
    bodySegments,
    freezeColumnCount,
    frozenRows,
    scrollLeft,
    sectionRowIndexByKey,
    stickyHeaderHeight,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);

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
  const isAutoScrollSuppressed = useCallback(
    () => getNow() < suppressAutoScrollUntilRef.current,
    [],
  );
  const emitLayoutSnapshot = useCallback(() => {
    if (!active || !onLayoutSnapshotChange) return;
    onLayoutSnapshotChange(buildWorkbookHorizontalLayoutSnapshot(
      activeWorkbookSection?.name ?? null,
      activeDiffRegion?.id ?? null,
      leftScrollRef.current?.scrollTop ?? 0,
      leftScrollRef.current?.scrollLeft ?? 0,
      rightScrollRef.current?.scrollTop ?? 0,
      rightScrollRef.current?.scrollLeft ?? 0,
      expandedBlocks,
    ));
  }, [active, activeDiffRegion?.id, activeWorkbookSection?.name, expandedBlocks, onLayoutSnapshotChange]);
  const scheduleLayoutSnapshot = useCallback(() => {
    if (!active || !onLayoutSnapshotChange) return;
    if (snapshotEmitRafRef.current) cancelAnimationFrame(snapshotEmitRafRef.current);
    snapshotEmitRafRef.current = requestAnimationFrame(() => {
      snapshotEmitRafRef.current = 0;
      emitLayoutSnapshot();
    });
  }, [active, emitLayoutSnapshot, onLayoutSnapshotChange]);
  const handlePaneScroll = useCallback((source: 'left' | 'right') => {
    const nextScrollLeft = source === 'left'
      ? (leftScrollRef.current?.scrollLeft ?? 0)
      : (rightScrollRef.current?.scrollLeft ?? 0);
    setScrollLeft((prev) => (Math.abs(prev - nextScrollLeft) < 0.5 ? prev : nextScrollLeft));
    scheduleLayoutSnapshot();
    const now = getNow();
    if (now >= programmaticScrollUntilRef.current[source]) {
      userScrollPauseUntilRef.current = now + 260;
    }
    syncScrollPosition(source);
  }, [scheduleLayoutSnapshot, syncScrollPosition]);

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const hiddenRowItem = items.find((item): item is Extract<WorkbookHorizontalRenderItem, { kind: 'hidden-rows' }> => (
      item.kind === 'hidden-rows'
      && item.rows.some(row => splitRowHasLineIdx(row, lineIdx))
    ));
    if (hiddenRowItem && activeWorkbookSection) {
      onRevealHiddenRows(activeWorkbookSection.name, hiddenRowItem.rowNumbers);
      return true;
    }

    const target = findCollapsedRowTarget(rowBlocks, effectiveExpandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      rowHasLineIdx: splitRowHasLineIdx,
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
  }, [activeWorkbookSection, collapseBlockPrefix, effectiveExpandedBlocks, items, onRevealHiddenRows, rowBlocks]);

  const scrollToResolvedLine = useCallback((lineIdx: number, align: 'start' | 'center' = 'center') => {
    const exactIndex = items.findIndex((item) => item.kind === 'split-line' && splitRowHasLineIdx(item.row, lineIdx));
    if (exactIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(exactIndex, align);
      requestAnimationFrame(() => syncScrollPosition('left'));
      setPendingScrollTarget((prev) => (
        prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
      ));
      return true;
    }
    if (revealLineIfCollapsed(lineIdx)) {
      setPendingScrollTarget({ lineIdx, align });
      return false;
    }
    const nearestIndex = items.findIndex((item) => item.kind === 'split-line' && splitRowTouchesOrAfter(item.row, lineIdx));
    if (nearestIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(nearestIndex, align);
      requestAnimationFrame(() => syncScrollPosition('left'));
      return true;
    }
    return false;
  }, [items, markProgrammaticScroll, revealLineIfCollapsed, scrollToIndex, syncScrollPosition]);

  useEffect(() => {
    if (!active) return;
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
    return () => {
      onScrollerReady(() => {});
    };
  }, [active, onScrollerReady, scrollToResolvedLine]);

  useEffect(() => {
    if (!tooltipDisabled) return;
    setHoveredCanvasCell(null);
  }, [tooltipDisabled]);

  useEffect(() => {
    if (!isExpandedBlocksContextSettled) return;
    scheduleLayoutSnapshot();
  }, [activeDiffRegion?.id, activeWorkbookSection?.name, expandedBlocks, isExpandedBlocksContextSettled, scheduleLayoutSnapshot]);

  useEffect(() => {
    if (!active || !onExpandedBlocksChange) return;
    if (!isExpandedBlocksContextSettled) return;
    onExpandedBlocksChange(
      activeWorkbookSection?.name ?? null,
      activeDiffRegion?.id ?? null,
      expandedBlocks,
    );
  }, [active, activeDiffRegion?.id, activeWorkbookSection?.name, expandedBlocks, isExpandedBlocksContextSettled, onExpandedBlocksChange]);

  useEffect(() => {
    if (!active) return;
    if (!layoutSnapshot || !shouldRestoreWorkbookLayoutSnapshot(
      layoutSnapshot,
      activeDiffRegion?.id ?? null,
      activeWorkbookSection?.name ?? null,
    )) {
      lastRestoredSnapshotKeyRef.current = '';
      return;
    }

    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    const snapshot = layoutSnapshot;

    const restoreKey = [
      snapshot.layout,
      snapshot.activeRegionId,
      snapshot.sheetName,
      snapshot.leftScrollTop,
      snapshot.leftScrollLeft,
      snapshot.rightScrollTop,
      snapshot.rightScrollLeft,
    ].join(':');
    if (lastRestoredSnapshotKeyRef.current === restoreKey) return;
    lastRestoredSnapshotKeyRef.current = restoreKey;
    suppressAutoScrollUntilRef.current = getNow() + 520;
    if (selectedCell && selectedCell.sheetName === activeWorkbookSection?.name) {
      const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
      if (selectedCell.kind !== 'column') lastAutoRowKeyRef.current = selectionKey;
      if (selectedCell.kind !== 'row') lastAutoCellKeyRef.current = selectionKey;
    }
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        markProgrammaticScroll('left', 420);
        markProgrammaticScroll('right', 420);
        left.scrollTop = snapshot.leftScrollTop;
        left.scrollLeft = snapshot.leftScrollLeft;
        right.scrollTop = snapshot.rightScrollTop;
        right.scrollLeft = snapshot.rightScrollLeft;
        setScrollLeft(snapshot.leftScrollLeft);
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
    selectedCell,
  ]);

  useEffect(() => () => {
    if (snapshotEmitRafRef.current) cancelAnimationFrame(snapshotEmitRafRef.current);
    if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
  }, []);

  useEffect(() => {
    setHoveredCanvasCell(null);
  }, [selectedCell?.kind, selectedCell?.sheetName, selectedCell?.side, selectedCell?.rowNumber, selectedCell?.colIndex]);

  useEffect(() => {
    const freezeSignature = `${activeWorkbookSection?.name ?? ''}:${freezeRowNumber}:${freezeColumnCount}`;
    if (lastFreezeSignatureRef.current == null) {
      lastFreezeSignatureRef.current = freezeSignature;
      return;
    }
    if (lastFreezeSignatureRef.current === freezeSignature) return;
    lastFreezeSignatureRef.current = freezeSignature;
    suppressAutoScrollUntilRef.current = Math.max(suppressAutoScrollUntilRef.current, getNow() + 420);
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 420);
    if (!selectedCell || selectedCell.sheetName !== activeWorkbookSection?.name) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (selectedCell.kind !== 'column') lastAutoRowKeyRef.current = selectionKey;
    if (selectedCell.kind !== 'row') lastAutoCellKeyRef.current = selectionKey;
  }, [
    activeWorkbookSection?.name,
    freezeColumnCount,
    freezeRowNumber,
    selectedCell?.colIndex,
    selectedCell?.kind,
    selectedCell?.rowNumber,
    selectedCell?.sheetName,
    selectedCell?.side,
  ]);

  useEffect(() => {
    lastAutoRowKeyRef.current = '';
    lastAutoCellKeyRef.current = '';
    lastCollapseJumpIndexRef.current = null;
  }, [activeWorkbookSection?.name, diffLines]);

  useEffect(() => {
    if (!active) return;
    if (activeSearchLineIdx < 0) return;
    if (isAutoScrollSuppressed()) return;
    scrollToResolvedLine(activeSearchLineIdx, 'center');
  }, [active, activeSearchLineIdx, isAutoScrollSuppressed, scrollToResolvedLine]);

  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (scrollToResolvedLine(pendingScrollTarget.lineIdx, pendingScrollTarget.align)) {
      setPendingScrollTarget(null);
    }
  }, [items, pendingScrollTarget, scrollToResolvedLine]);

  useEffect(() => {
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    const nextTop = Math.max(0, left.scrollTop + scrollAdjust);
    markProgrammaticScroll('left', 180);
    markProgrammaticScroll('right', 180);
    left.scrollTop = nextTop;
    right.scrollTop = nextTop;
  }, [items, markProgrammaticScroll]);

  const handleWorkbookMove = useCallback((direction: WorkbookMoveDirection) => {
    const nextSelection = moveWorkbookSelection(workbookNavigationRows, selectedCell, direction, {
      base: sheetPresentation.baseMergeRanges,
      mine: sheetPresentation.mineMergeRanges,
    });
    if (nextSelection) {
      onSelectionRequest({
        target: nextSelection,
        reason: 'keyboard',
      });
    }
  }, [onSelectionRequest, selectedCell, sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges, workbookNavigationRows]);

  useEffect(() => {
    if (!active) return;
    onWorkbookNavigationReady?.(handleWorkbookMove);
    return () => onWorkbookNavigationReady?.(null);
  }, [active, handleWorkbookMove, onWorkbookNavigationReady]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    if (isAutoScrollSuppressed()) return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoRowKeyRef.current === selectionKey) return;
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (idx >= 0) {
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll('left', 360);
      scrollToIndex(idx, 'center');
      requestAnimationFrame(() => syncScrollPosition('left'));
    }
  }, [active, activeWorkbookSection, isAutoScrollSuppressed, isUserScrollPaused, markProgrammaticScroll, rowItemIndexBySide, scrollToIndex, selectedCell, syncScrollPosition]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (isAutoScrollSuppressed()) return;
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
  }, [active, activeWorkbookSection, isAutoScrollSuppressed, isUserScrollPaused, markProgrammaticScroll, selectedCell, sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges, virtualColumns.columnLayoutByColumn, virtualColumns.frozenWidth]);

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
      if (item.kind !== 'split-line') {
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
  const collapseIndexes = useMemo(
    () => getCollapseIndexes(items, (item) => item.kind === 'split-collapse'),
    [items],
  );
  const totalCollapseCount = useMemo(
    () => countRemainingCollapses(items, 0, (item) => item.kind === 'split-collapse'),
    [items],
  );
  const activeCollapsePosition = useMemo(
    () => resolveActiveCollapsePosition(collapseIndexes, lastCollapseJumpIndexRef.current, startIdx),
    [collapseIndexes, startIdx],
  );
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
    buildItemsMs: collapsedItemsMeasured.duration
      + (hiddenRowNumberSet.size > 0 ? renderItemsMeasured.duration : 0)
      + itemsMeasured.duration,
    collapseBuildMs: collapsedItemsMeasured.duration,
    hiddenOverlayMs: hiddenRowNumberSet.size > 0 ? renderItemsMeasured.duration : 0,
    hiddenRows: activeHiddenState.hiddenRows.length,
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
    activeHiddenState.hiddenRows.length,
    collapsedItemsMeasured.duration,
    endIdx,
    freezeColumnCount,
    frozenRows.length,
    hiddenRowNumberSet.size,
    items,
    itemsMeasured.duration,
    renderItemsMeasured.duration,
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
  const handleExpandCollapseBlock = useCallback((
    blockId: string,
    hiddenStart: number,
    hiddenEnd: number,
    revealCount: number,
    mode: 'partial' | 'full' = 'partial',
  ) => {
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 900);
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
  }, []);
  const handleJumpToNextCollapse = useCallback(() => {
    const nextCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      endIdx,
      'next',
    );
    if (nextCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = nextCollapseIndex;
    markProgrammaticScroll('left', 360);
    scrollToIndex(nextCollapseIndex, 'start');
    requestAnimationFrame(() => syncScrollPosition('left'));
  }, [collapseIndexes, endIdx, markProgrammaticScroll, scrollToIndex, syncScrollPosition]);
  const handleJumpToPreviousCollapse = useCallback(() => {
    const previousCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      startIdx,
      'prev',
    );
    if (previousCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = previousCollapseIndex;
    markProgrammaticScroll('left', 360);
    scrollToIndex(previousCollapseIndex, 'start');
    requestAnimationFrame(() => syncScrollPosition('left'));
  }, [collapseIndexes, markProgrammaticScroll, scrollToIndex, startIdx, syncScrollPosition]);
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
    onSelectionRequest({
      target: null,
      reason: 'programmatic',
    });
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    leftScrollRef.current?.scrollTo({ top: 0, left: 0 });
    rightScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [onActiveWorkbookSheetChange, onSelectionRequest, workbookSections]);
  const handleSelectColumn = useCallback((column: number, side: 'base' | 'mine', meta?: {
    mode?: WorkbookSelectionMode;
    reason?: WorkbookSelectionRequest['reason'];
    clientPoint?: WorkbookSelectionRequest['clientPoint'];
    preserveExistingIfTargetSelected?: boolean;
  }) => {
    if (!activeWorkbookSection) return;
    const label = getWorkbookColumnLabel(column);
    onSelectionRequest({
      target: {
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
      },
      mode: meta?.mode,
      reason: meta?.reason,
      clientPoint: meta?.clientPoint,
      preserveExistingIfTargetSelected: meta?.preserveExistingIfTargetSelected,
    });
  }, [activeWorkbookSection, baseVersion, mineVersion, onSelectionRequest]);

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
                selection={selection}
                fontSize={fontSize}
                renderColumns={virtualColumns.columnEntries}
                columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                fixedSide={side === 'left' ? 'base' : 'mine'}
                onSelectColumn={handleSelectColumn}
                hiddenColumnSegments={sheetPresentation.hiddenColumnSegments}
                onRevealHiddenColumns={(columns) => {
                  if (!activeWorkbookSection) return;
                  onRevealHiddenColumns(activeWorkbookSection.name, columns);
                }}
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
                  selection={selection}
                  onSelectionRequest={onSelectionRequest}
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
                    <div key={`${side}-collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: '100%' }}>
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
                if (segment.kind === 'hidden-rows') {
                  return (
                    <div key={`${side}-hidden-${segment.item.rowNumbers.join('-') || segment.top}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: '100%' }}>
                      <div
                        style={{
                          position: 'sticky',
                          left: 0,
                          width: pinnedCollapseWidth,
                          minWidth: pinnedCollapseWidth,
                          overflow: 'hidden',
                          zIndex: 5,
                        }}>
                        <WorkbookHiddenRowsBar
                          count={segment.item.count}
                          onReveal={() => {
                            if (!activeWorkbookSection) return;
                            onRevealHiddenRows(activeWorkbookSection.name, segment.item.rowNumbers);
                          }}
                        />
                      </div>
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
                        selection={selection}
                        onSelectionRequest={onSelectionRequest}
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
            {activeRegionOverlayBoxesBySide[side].length > 0 && (
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
                    boxes={activeRegionOverlayBoxesBySide[side].map((box) => ({
                      ...box,
                      key: `${guidedPulseNonce}:${box.key}`,
                    }))}
                  />
                </div>
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
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
            {renderPane(leftScrollRef, 'left', () => handlePaneScroll('left'))}
            <div style={{ width: 1, background: T.border, boxShadow: `0 0 0 1px ${T.border}` }} />
            {renderPane(rightScrollRef, 'right', () => handlePaneScroll('right'))}
          </div>
          <CollapseJumpButton
            onPrev={handleJumpToPreviousCollapse}
            onNext={handleJumpToNextCollapse}
            currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
            totalCount={totalCollapseCount}
            storageKey="workbook-split-h"
          />
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
