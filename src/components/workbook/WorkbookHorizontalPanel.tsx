import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  startTransition,
} from 'react';
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
  } from '@/types';
import { useThemeTokens } from '@/context/theme';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { useVirtual, ROW_H } from '@/hooks/virtualization/useVirtual';
import { useHorizontalVirtualColumns } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { useWorkbookExpandedBlocksState } from '@/hooks/workbook/useWorkbookExpandedBlocksState';
import { LN_W } from '@/constants/layout';
import { WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '@/utils/workbook/workbookSections';
import {
  formatWorkbookDiffRegionSummary,
  workbookDiffRegionContainsSelection,
} from '@/utils/workbook/workbookDiffRegion';
import {
  buildWorkbookSearchSelectionFromTarget,
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
  moveWorkbookSelection,
} from '@/utils/workbook/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '@/utils/workbook/workbookSheetIndex';
import {
  getWorkbookSelectionSpanForSelection,
} from '@/utils/workbook/workbookMergeLayout';
import {
  parseWorkbookRowLine,
} from '@/utils/workbook/workbookCompare';
import { resolveWorkbookRegionHorizontalBounds } from '@/utils/workbook/workbookRegionOverlay';
import { workbookDebugLog } from '@/utils/workbook/workbookDebug';
import {
  getWorkbookColumnWidth,
  measureWorkbookAutoFitColumnWidth,
  type WorkbookColumnWidthBySheet,
} from '@/utils/workbook/workbookColumnWidths';
import {
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  describeCollapsedRowBlocks,
  findCollapsedRowTarget,
} from '@/utils/collapse/collapsibleRows';
import { overlayHiddenWorkbookRowsOnItems } from '@/utils/workbook/workbookManualVisibility';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
} from '@/utils/workbook/workbookMeta';
import { buildWorkbookCollapseBlockPrefix } from '@/utils/workbook/workbookCollapse';
import {
  applyWorkbookFreezeToExpandedBlocks,
  extendWorkbookFreezeRowNumberForMergedCells,
  getResolvedWorkbookFreezeColCount,
  getResolvedWorkbookFreezeRowNumber,
} from '@/utils/workbook/workbookFreeze';
import {
  buildWorkbookHorizontalLayoutSnapshot,
  shouldRestoreWorkbookLayoutSnapshot,
} from '@/utils/workbook/workbookLayoutSnapshot';
import { resolveWorkbookAuxBarPalette } from '@/utils/workbook/workbookRowVisuals';
import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '@/utils/collapse/collapseNavigation';
import CollapseBar from '@/components/diff/CollapseBar';
import CollapseJumpButton from '@/components/diff/CollapseJumpButton';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
  type WorkbookMiniMapSegment,
} from '@/components/workbook/WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookCanvasHeaderStrip from '@/components/workbook/WorkbookCanvasHeaderStrip';
import WorkbookPaneCanvasStrip, { type WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from '@/components/workbook/WorkbookPerfDebugPanel';
import WorkbookSheetTabs from '@/components/workbook/WorkbookSheetTabs';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import WorkbookHiddenRowsBar from '@/components/workbook/WorkbookHiddenRowsBar';
import { useAppStore } from '@/store/appStore';
import {
  WORKBOOK_CONTEXT_LINES as CONTEXT_LINES,
  workbookRowHasLineIdx as splitRowHasLineIdx,
  workbookRowTouchesOrAfter as splitRowTouchesOrAfter,
  isEqualWorkbookRow as isEqualSplitRow,
  rowTouchesGuidedHunk,
  getWorkbookRowKey as getWorkbookHorizontalRowKey,
  buildSelectionAutoScrollKey,
  getWorkbookMiniMapTone,
  buildWorkbookRowEntryMaps,
  buildWorkbookCompareCellsMaps,
} from '@/utils/workbook/workbookPanelHelpers';

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
  baseTitle: string;
  mineTitle: string;
  baseVersionLabel: string;
  mineVersionLabel: string;
  activeDiffRegion: WorkbookDiffRegion | null;
  navigationTargetCell: WorkbookSelectedCell | null;
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

const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;
const SPLIT_DIVIDER_WIDTH = 12;

function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, value));
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
  baseTitle,
  mineTitle,
  baseVersionLabel,
  mineVersionLabel,
  activeDiffRegion,
  navigationTargetCell,
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
  const T = useThemeTokens();
  const searchJumpNonce = useAppStore((s) => s.searchJumpNonce);
  const selectedCell = selection.primary;
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const splitterCleanupRef = useRef<(() => void) | null>(null);
  const splitRatioRef = useRef(clampSplitRatio(layoutSnapshot?.splitRatio ?? DEFAULT_SPLIT_RATIO));
  const splitRatioFrameRef = useRef(0);
  const pendingSplitRatioRef = useRef(splitRatioRef.current);
  const pendingScrollAdjustRef = useRef(0);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const scrollSyncCountRef = useRef(0);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const snapshotEmitRafRef = useRef(0);
  const restoreRafRef = useRef(0);
  const lastRestoredSnapshotKeyRef = useRef('');
  const lastViewportSheetNameRef = useRef<string | null>(activeWorkbookSection?.name ?? null);
  const [splitRatio, setSplitRatio] = useState(() => clampSplitRatio(layoutSnapshot?.splitRatio ?? DEFAULT_SPLIT_RATIO));
  const [isResizingSplitter, setIsResizingSplitter] = useState(false);
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const itemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: WorkbookHorizontalRenderItem[]; duration: number }>>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const lastGuidedNavigationKeyRef = useRef('');
  const lastAppliedSearchKeyRef = useRef('');
  const suppressGuidedNavigationUntilRef = useRef(0);
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
  const activeSearchMatch = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx] ?? null)
    : null;
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
  const activeSheetMergeRanges = useMemo(
    () => activeWorkbookSection
      ? [
          ...(baseWorkbookMetadata?.sheets[activeWorkbookSection.name]?.mergeRanges ?? []),
          ...(mineWorkbookMetadata?.sheets[activeWorkbookSection.name]?.mergeRanges ?? []),
        ]
      : [],
    [activeWorkbookSection, baseWorkbookMetadata, mineWorkbookMetadata],
  );
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
    () => extendWorkbookFreezeRowNumberForMergedCells(
      getResolvedWorkbookFreezeRowNumber(activeFreezeState, {
        rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
        colCount: 1,
      }),
      activeSheetMergeRanges,
    ),
    [activeSheetMergeRanges, activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
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
    const value = overlayHiddenWorkbookRowsOnItems<
      WorkbookHorizontalRenderItem,
      Extract<WorkbookHorizontalRenderItem, { kind: 'hidden-rows' }>,
      SplitRow
    >(
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
    { overscanMin: 12, overscanFactor: 1.5, syncKey: activeWorkbookSection?.name ?? '' },
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
  const mergedRangesForVirtualColumns = useMemo(
    () => [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges],
    [sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges],
  );
  const leftVirtualColumns = useHorizontalVirtualColumns({
    scrollRef: leftScrollRef as RefObject<HTMLDivElement>,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    getColumnWidth: resolveColumnWidth,
    mergedRanges: mergedRangesForVirtualColumns,
    overscanMin: 6,
    overscanFactor: 1.5,
    syncKey: activeWorkbookSection?.name ?? '',
  });
  const rightVirtualColumns = useHorizontalVirtualColumns({
    scrollRef: rightScrollRef as RefObject<HTMLDivElement>,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    getColumnWidth: resolveColumnWidth,
    mergedRanges: mergedRangesForVirtualColumns,
    overscanMin: 6,
    overscanFactor: 1.5,
    syncKey: activeWorkbookSection?.name ?? '',
  });
  const paneVirtualColumnsBySide = useMemo(
    () => ({
      left: leftVirtualColumns,
      right: rightVirtualColumns,
    }),
    [leftVirtualColumns, rightVirtualColumns],
  );
  const rowEntryByRowNumber = useMemo(
    () => buildWorkbookRowEntryMaps(
      sectionRows,
      activeSheetName,
      baseVersion,
      mineVersion,
      sheetPresentation.visibleColumns,
    ),
    [activeSheetName, baseVersion, mineVersion, sectionRows, sheetPresentation.visibleColumns],
  );
  const compareCellsByRowNumber = useMemo(
    () => buildWorkbookCompareCellsMaps(
      sectionRows,
      sheetPresentation.visibleColumns,
      compareMode,
    ),
    [compareMode, sectionRows, sheetPresentation.visibleColumns],
  );
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
  const singleGridWidth = (LN_W + 3) + leftVirtualColumns.totalWidth;
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
  const activeRegionOverlayVisibleRowFrames = useMemo(() => {
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
      let cursorTop = stickyHeaderHeight + (startIdx * ROW_H) + segment.top;
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
    return visibleRowFrames;
  }, [
    bodySegments,
    frozenRows,
    sectionRowIndexByKey,
    startIdx,
    stickyHeaderHeight,
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
  }, [activeWorkbookSection, baseVersion, frozenRows, items, mineVersion, selectedCell, sheetPresentation.visibleColumns]);

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
  const applySplitRatioStyle = useCallback((ratio: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    container.style.setProperty('--split-left', `${(ratio * 100).toFixed(3)}%`);
    container.style.setProperty('--split-right', `${((1 - ratio) * 100).toFixed(3)}%`);
  }, []);
  const flushPendingSplitRatio = useCallback(() => {
    if (splitRatioFrameRef.current) {
      cancelAnimationFrame(splitRatioFrameRef.current);
      splitRatioFrameRef.current = 0;
    }
    const nextRatio = clampSplitRatio(pendingSplitRatioRef.current);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    return nextRatio;
  }, [applySplitRatioStyle]);
  const queueSplitRatioUpdate = useCallback((ratio: number) => {
    const nextRatio = clampSplitRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    if (splitRatioFrameRef.current) return;
    splitRatioFrameRef.current = requestAnimationFrame(() => {
      splitRatioFrameRef.current = 0;
      const frameRatio = clampSplitRatio(pendingSplitRatioRef.current);
      splitRatioRef.current = frameRatio;
      applySplitRatioStyle(frameRatio);
    });
  }, [applySplitRatioStyle]);
  const commitSplitRatio = useCallback((ratio: number) => {
    const nextRatio = clampSplitRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    setSplitRatio((prev) => (Math.abs(prev - nextRatio) < 0.001 ? prev : nextRatio));
    return nextRatio;
  }, [applySplitRatioStyle]);
  const updateSplitRatioFromClientX = useCallback((clientX: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= SPLIT_DIVIDER_WIDTH) return;
    const nextRatio = clampSplitRatio((clientX - rect.left) / rect.width);
    queueSplitRatioUpdate(nextRatio);
  }, [queueSplitRatioUpdate]);
  const stopSplitterResize = useCallback(() => {
    splitterCleanupRef.current?.();
    splitterCleanupRef.current = null;
    setIsResizingSplitter(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);
  const nudgeSplitRatio = useCallback((delta: number) => {
    const nextRatio = clampSplitRatio(splitRatioRef.current + delta);
    commitSplitRatio(nextRatio);
  }, [commitSplitRatio]);
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
      splitRatio,
      expandedBlocks,
    ));
  }, [active, activeDiffRegion?.id, activeWorkbookSection?.name, expandedBlocks, onLayoutSnapshotChange, splitRatio]);
  const emitLayoutSnapshotRef = useRef(emitLayoutSnapshot);
  emitLayoutSnapshotRef.current = emitLayoutSnapshot;
  const scheduleLayoutSnapshot = useCallback(() => {
    if (snapshotEmitRafRef.current) return;
    snapshotEmitRafRef.current = requestAnimationFrame(() => {
      snapshotEmitRafRef.current = 0;
      emitLayoutSnapshotRef.current();
    });
  }, []);
  const syncScrollPositionRef = useRef(syncScrollPosition);
  syncScrollPositionRef.current = syncScrollPosition;
  const handlePaneScroll = useCallback((source: 'left' | 'right') => {
    scheduleLayoutSnapshot();
    const now = getNow();
    if (now >= programmaticScrollUntilRef.current[source]) {
      userScrollPauseUntilRef.current = now + 260;
    }
    syncScrollPositionRef.current(source);
  }, [scheduleLayoutSnapshot]);
  const handleSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopSplitterResize();
    updateSplitRatioFromClientX(event.clientX);
    setIsResizingSplitter(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSplitRatioFromClientX(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      const finalRatio = flushPendingSplitRatio();
      setSplitRatio((prev) => (Math.abs(prev - finalRatio) < 0.001 ? prev : finalRatio));
      stopSplitterResize();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    splitterCleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [flushPendingSplitRatio, stopSplitterResize, updateSplitRatioFromClientX]);
  const handleSplitterKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudgeSplitRatio(-0.02);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudgeSplitRatio(0.02);
    }
  }, [nudgeSplitRatio]);
  const paneGridTemplateColumns = useMemo(() => {
    return `minmax(0, calc(var(--split-left, 50%) - ${SPLIT_DIVIDER_WIDTH / 2}px)) ${SPLIT_DIVIDER_WIDTH}px minmax(0, calc(var(--split-right, 50%) - ${SPLIT_DIVIDER_WIDTH / 2}px))`;
  }, []);

  useEffect(() => () => {
    if (splitRatioFrameRef.current) cancelAnimationFrame(splitRatioFrameRef.current);
    stopSplitterResize();
  }, [stopSplitterResize]);

  useEffect(() => {
    scheduleLayoutSnapshot();
  }, [scheduleLayoutSnapshot, splitRatio]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
    pendingSplitRatioRef.current = splitRatio;
    applySplitRatioStyle(splitRatio);
  }, [applySplitRatioStyle, splitRatio]);

  const visibleRowItemIndexByLineIdx = useMemo(() => {
    const next = new Map<number, number>();
    items.forEach((item, index) => {
      if (item.kind !== 'split-line') return;
      item.row.lineIdxs.forEach((lineIdx) => {
        if (!next.has(lineIdx)) next.set(lineIdx, index);
      });
    });
    return next;
  }, [items]);

  useEffect(() => {
    const nextSheetName = activeWorkbookSection?.name ?? null;
    const previousSheetName = lastViewportSheetNameRef.current;
    lastViewportSheetNameRef.current = nextSheetName;

    if (!previousSheetName || !nextSheetName || previousSheetName === nextSheetName) return;

    if (snapshotEmitRafRef.current) {
      cancelAnimationFrame(snapshotEmitRafRef.current);
      snapshotEmitRafRef.current = 0;
    }

    lastRestoredSnapshotKeyRef.current = '';
    suppressAutoScrollUntilRef.current = Math.max(suppressAutoScrollUntilRef.current, getNow() + 520);
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 520);
    syncOwnerRef.current = null;
    markProgrammaticScroll('left', 520);
    markProgrammaticScroll('right', 520);
    setHoveredCanvasCell(null);
    leftScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    rightScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeWorkbookSection?.name, markProgrammaticScroll]);

  // 首次从其他布局切换到 split-h 时，需要确保水平滚动位置归零。
  // 由于 snapshot restore、guided navigation、cell auto-scroll 等操作
  // 会在挂载后通过 rAF 异步设置 scrollLeft，我们通过在首次挂载后的
  // 短暂时间窗口内安装 scroll 事件监听守卫，拦截所有 scrollLeft 变化
  // 并强制重置为 0，确保冻结列不会遮挡内容。
  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;

    let guardActive = true;

    const guardScrollLeft = (el: HTMLDivElement) => {
      if (!guardActive) return;
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
    };

    const onLeftScroll = () => guardScrollLeft(left);
    const onRightScroll = () => guardScrollLeft(right);

    left.addEventListener('scroll', onLeftScroll);
    right.addEventListener('scroll', onRightScroll);

    // 挂载后 500ms 内拦截所有水平滚动，之后解除守卫恢复正常交互
    const timerId = window.setTimeout(() => {
      guardActive = false;
      left.removeEventListener('scroll', onLeftScroll);
      right.removeEventListener('scroll', onRightScroll);
    }, 500);

    return () => {
      guardActive = false;
      clearTimeout(timerId);
      left.removeEventListener('scroll', onLeftScroll);
      right.removeEventListener('scroll', onRightScroll);
    };
  }, []);

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
  }, [activeWorkbookSection, collapseBlockPrefix, effectiveExpandedBlocks, items, onRevealHiddenRows, rowBlocks, setExpandedBlocks]);

  const scrollToResolvedLine = useCallback((
    lineIdx: number,
    align: 'start' | 'center' = 'center',
    behavior: 'auto' | 'smooth' | 'smart' = 'smart',
  ) => {
    const exactIndex = visibleRowItemIndexByLineIdx.get(lineIdx) ?? -1;
    if (exactIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(exactIndex, align, behavior);
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
      scrollToIndex(nearestIndex, align, behavior);
      requestAnimationFrame(() => syncScrollPosition('left'));
      return true;
    }
    return false;
  }, [items, markProgrammaticScroll, revealLineIfCollapsed, scrollToIndex, syncScrollPosition, visibleRowItemIndexByLineIdx]);

  useEffect(() => {
    if (!active) return;
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
    return () => {
      onScrollerReady(() => {});
    };
  }, [active, onScrollerReady, scrollToResolvedLine]);

  const focusWorkbookCell = useCallback((
    cell: WorkbookSelectedCell,
    strategy: 'focus' | 'ensure-visible' = 'ensure-visible',
  ) => {
    if (cell.kind === 'row') return true;
    const sourceSide = cell.side === 'base' ? 'left' : 'right';
    const source = sourceSide === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const target = sourceSide === 'left' ? rightScrollRef.current : leftScrollRef.current;
    const paneVirtualColumns = paneVirtualColumnsBySide[sourceSide];
    if (!source) return false;

    const frozenWidth = LN_W + 3 + paneVirtualColumns.frozenWidth;
    const mergedRanges = cell.side === 'base'
      ? sheetPresentation.baseMergeRanges
      : sheetPresentation.mineMergeRanges;
    const span = getWorkbookSelectionSpanForSelection(cell, mergedRanges);
    const targetColumn = paneVirtualColumns.columnLayoutByColumn.get(span.startCol);
    const endColumn = paneVirtualColumns.columnLayoutByColumn.get(span.endCol);
    if (!targetColumn || !endColumn) return false;

    const targetLeft = LN_W + 3 + targetColumn.offset;
    const targetRight = LN_W + 3 + endColumn.offset + endColumn.width;
    const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);

    if (strategy === 'focus') {
      markProgrammaticScroll(sourceSide, 260);
      source.scrollLeft = desiredScrollLeft;
      if (target) target.scrollLeft = source.scrollLeft;
      return true;
    }

    const leftBoundary = source.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = source.scrollLeft + source.clientWidth - desiredPadding;
    if (targetLeft < leftBoundary || targetLeft + targetWidth > rightBoundary) {
      markProgrammaticScroll(sourceSide, 260);
      if (targetLeft < leftBoundary) {
        source.scrollLeft = desiredScrollLeft;
      } else {
        source.scrollLeft = Math.max(0, targetLeft + targetWidth - source.clientWidth + desiredPadding);
      }
      if (target) target.scrollLeft = source.scrollLeft;
    }

    return true;
  }, [
    markProgrammaticScroll,
    paneVirtualColumnsBySide,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
  ]);
  const focusWorkbookDiffRegion = useCallback((region: WorkbookDiffRegion) => {
    const resolvedSide: 'base' | 'mine' = region.hasBaseSide ? 'base' : 'mine';
    const sourceSide = resolvedSide === 'base' ? 'left' : 'right';
    const source = sourceSide === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const target = sourceSide === 'left' ? rightScrollRef.current : leftScrollRef.current;
    const paneVirtualColumns = paneVirtualColumnsBySide[sourceSide];
    if (!source) return;

    const bounds = resolveWorkbookRegionHorizontalBounds({
      region,
      columnLayoutByColumn: paneVirtualColumns.columnLayoutByColumn,
      freezeColumnCount,
      resolvePatchBoundsModes: () => ['single'],
      fallbackBoundsModes: ['single'],
    });
    if (!bounds) return;

    const frozenWidth = LN_W + 3 + paneVirtualColumns.frozenWidth;
    const desiredPadding = 24;
    const targetLeft = LN_W + 3 + bounds.leftOffset;
    const targetRight = LN_W + 3 + bounds.rightOffset;
    const targetWidth = Math.max(1, bounds.width);
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);
    const leftBoundary = source.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = source.scrollLeft + source.clientWidth - desiredPadding;

    if (targetLeft < leftBoundary || targetRight > rightBoundary) {
      markProgrammaticScroll(sourceSide, 260);
      if (targetLeft < leftBoundary || targetWidth >= source.clientWidth - frozenWidth - (desiredPadding * 2)) {
        source.scrollLeft = desiredScrollLeft;
      } else {
        source.scrollLeft = Math.max(0, targetRight - source.clientWidth + desiredPadding);
      }
      if (target) target.scrollLeft = source.scrollLeft;
    }
  }, [
    freezeColumnCount,
    markProgrammaticScroll,
    paneVirtualColumnsBySide,
  ]);
  const activeSearchTargetCell = useMemo(() => {
    return buildWorkbookSearchSelectionFromTarget(
      activeSearchMatch?.workbookTarget,
      rowEntryByRowNumber,
      {
        base: sheetPresentation.baseMergeRanges,
        mine: sheetPresentation.mineMergeRanges,
      },
    );
  }, [
    activeSearchMatch,
    rowEntryByRowNumber,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
  ]);
  const scrollToSearchTarget = useCallback((
    target: WorkbookSelectedCell | null,
    fallbackLineIdx: number,
  ) => {
    if (!target || target.kind === 'column') {
      return {
        didScroll: scrollToResolvedLine(fallbackLineIdx, 'center', 'auto'),
        isExact: true,
      };
    }

    const rowExists = rowEntryByRowNumber[target.side].has(target.rowNumber);
    const rowIndex = rowItemIndexBySide[target.side].get(target.rowNumber) ?? -1;
    if (rowIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(rowIndex, 'center', 'auto');
      requestAnimationFrame(() => syncScrollPosition('left'));
      return { didScroll: true, isExact: true };
    }

    return {
      didScroll: scrollToResolvedLine(fallbackLineIdx, 'center', 'auto'),
      isExact: !rowExists,
    };
  }, [
    markProgrammaticScroll,
    rowEntryByRowNumber,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    syncScrollPosition,
  ]);

  useEffect(() => {
    if (!activeSearchMatch) {
      lastAppliedSearchKeyRef.current = '';
      return;
    }
    if (!active) return;
    if (!activeWorkbookSection) return;
    if (
      activeSearchMatch.lineIdx < activeWorkbookSection.startLineIdx
      || activeSearchMatch.lineIdx > activeWorkbookSection.endLineIdx
    ) {
      return;
    }

    const searchKey = [
      activeWorkbookSection?.name ?? '',
      activeSearchMatch.lineIdx,
      activeSearchMatch.start,
      activeSearchMatch.end,
      activeSearchMatch.workbookTarget?.sheetName ?? '',
      activeSearchMatch.workbookTarget?.side ?? '',
      activeSearchMatch.workbookTarget?.rowNumber ?? '',
      activeSearchMatch.workbookTarget?.colIndex ?? '',
      searchJumpNonce,
    ].join(':');
    if (lastAppliedSearchKeyRef.current === searchKey) return;

    if (activeSearchTargetCell) {
      suppressGuidedNavigationUntilRef.current = getNow() + 900;
      onSelectionRequest({
        target: activeSearchTargetCell,
        reason: 'search',
      });
    }

    const scrollResult = scrollToSearchTarget(activeSearchTargetCell, activeSearchMatch.lineIdx);
    if (!scrollResult.didScroll) return;

    const didFocus = activeSearchTargetCell
      ? focusWorkbookCell(activeSearchTargetCell, 'focus')
      : true;
    if (!scrollResult.isExact || !didFocus) return;

    lastAppliedSearchKeyRef.current = searchKey;
  }, [
    active,
    activeSearchMatch,
    activeSearchTargetCell,
    activeWorkbookSection,
    activeWorkbookSection?.name,
    activeWorkbookSection?.endLineIdx,
    activeWorkbookSection?.startLineIdx,
    focusWorkbookCell,
    items.length,
    onSelectionRequest,
    searchJumpNonce,
    scrollToSearchTarget,
  ]);

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
      snapshot.splitRatio ?? '',
    ].join(':');
    if (lastRestoredSnapshotKeyRef.current === restoreKey) return;
    lastRestoredSnapshotKeyRef.current = restoreKey;
    suppressAutoScrollUntilRef.current = getNow() + 520;
    const nextSplitRatio = clampSplitRatio(snapshot.splitRatio ?? DEFAULT_SPLIT_RATIO);
    setSplitRatio((prev) => (Math.abs(prev - nextSplitRatio) < 0.001 ? prev : nextSplitRatio));
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
        right.scrollTop = snapshot.rightScrollTop;
        left.scrollLeft = snapshot.leftScrollLeft;
        right.scrollLeft = snapshot.rightScrollLeft;
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
  }, [selectedCell, selectedCell?.kind, selectedCell?.sheetName, selectedCell?.side, selectedCell?.rowNumber, selectedCell?.colIndex]);

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
    selectedCell,
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
    lastGuidedNavigationKeyRef.current = '';
  }, [activeDiffRegion?.id, activeWorkbookSection?.name]);

  useEffect(() => {
    if (!active) return;
    if (!activeDiffRegion || !activeWorkbookSection) return;
    if (activeDiffRegion.sheetName !== activeWorkbookSection.name) return;
    if (getNow() < suppressGuidedNavigationUntilRef.current) return;
    const navigationKey = activeDiffRegion.id;
    if (lastGuidedNavigationKeyRef.current === navigationKey) return;

    lastGuidedNavigationKeyRef.current = navigationKey;
    const anchorPatch = activeDiffRegion.patches[0] ?? null;
    const anchorSide: 'base' | 'mine' = anchorPatch?.hasBaseSide ? 'base' : 'mine';
    const anchorRowNumber = anchorSide === 'base'
      ? (anchorPatch?.baseRowStart ?? anchorPatch?.baseRowEnd ?? null)
      : (anchorPatch?.mineRowStart ?? anchorPatch?.mineRowEnd ?? null);
    const targetRowIndex = anchorRowNumber != null
      ? (rowItemIndexBySide[anchorSide].get(anchorRowNumber) ?? -1)
      : -1;
    if (targetRowIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(targetRowIndex, 'start', 'auto');
      requestAnimationFrame(() => syncScrollPosition('left'));
    } else {
      scrollToResolvedLine(activeDiffRegion.lineStartIdx, 'start', 'auto');
    }

    focusWorkbookDiffRegion(activeDiffRegion);
    let followUpRafId = 0;
    const rafId = requestAnimationFrame(() => {
      focusWorkbookDiffRegion(activeDiffRegion);
      followUpRafId = requestAnimationFrame(() => {
        focusWorkbookDiffRegion(activeDiffRegion);
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (followUpRafId) cancelAnimationFrame(followUpRafId);
    };
  }, [
    active,
    activeDiffRegion,
    activeWorkbookSection,
    focusWorkbookDiffRegion,
    markProgrammaticScroll,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    syncScrollPosition,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoRowKeyRef.current === selectionKey) return;
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (idx >= 0) {
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll('left', 360);
      scrollToIndex(idx, 'center', 'smart');
      requestAnimationFrame(() => syncScrollPosition('left'));
    }
  }, [active, activeDiffRegion, activeWorkbookSection, isAutoScrollSuppressed, isUserScrollPaused, markProgrammaticScroll, navigationTargetCell, rowItemIndexBySide, scrollToIndex, selectedCell, syncScrollPosition]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoCellKeyRef.current === selectionKey) return;

    const rafId = requestAnimationFrame(() => {
      lastAutoCellKeyRef.current = selectionKey;
      focusWorkbookCell(selectedCell, 'ensure-visible');
    });

    return () => cancelAnimationFrame(rafId);
  }, [active, activeDiffRegion, activeWorkbookSection, focusWorkbookCell, isAutoScrollSuppressed, isUserScrollPaused, navigationTargetCell, selectedCell]);

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
    renderedColumns: Math.max(leftVirtualColumns.columnEntries.length, rightVirtualColumns.columnEntries.length),
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
    columnWindowMs: Math.max(leftVirtualColumns.debug.lastCalcMs, rightVirtualColumns.debug.lastCalcMs),
    columnWindowUpdates: leftVirtualColumns.debug.rangeUpdates + rightVirtualColumns.debug.rangeUpdates,
    columnOverscan: Math.max(leftVirtualColumns.debug.overscan, rightVirtualColumns.debug.overscan),
    columnViewport: Math.max(leftVirtualColumns.debug.viewportWidth, rightVirtualColumns.debug.viewportWidth),
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
    leftVirtualColumns.columnEntries.length,
    leftVirtualColumns.debug.lastCalcMs,
    leftVirtualColumns.debug.overscan,
    leftVirtualColumns.debug.rangeUpdates,
    leftVirtualColumns.debug.viewportWidth,
    rightVirtualColumns.columnEntries.length,
    rightVirtualColumns.debug.lastCalcMs,
    rightVirtualColumns.debug.overscan,
    rightVirtualColumns.debug.rangeUpdates,
    rightVirtualColumns.debug.viewportWidth,
  ]);
  const sheetRenderKey = `${activeWorkbookSection?.name ?? 'none'}`;
  useEffect(() => {
    if (!showPerfDebug || !activeWorkbookSection) return;
    workbookDebugLog('WorkbookHorizontalPanel/render-state', {
      sheetName: activeWorkbookSection.name,
      sectionRowCount: sectionRows.length,
      frozenRowCount: frozenRows.length,
      itemCount: items.length,
      visibleColumns: sheetPresentation.visibleColumns,
      allColumns: sheetPresentation.allColumns,
      startIdx,
      endIdx,
      contentHeight,
      singleGridWidth,
      leftViewportWidth: leftVirtualColumns.debug.viewportWidth,
      rightViewportWidth: rightVirtualColumns.debug.viewportWidth,
      activeDiffRegion: activeDiffRegion
        ? {
          id: activeDiffRegion.id,
          sheetName: activeDiffRegion.sheetName,
          startRowIndex: activeDiffRegion.startRowIndex,
          endRowIndex: activeDiffRegion.endRowIndex,
          startCol: activeDiffRegion.startCol,
          endCol: activeDiffRegion.endCol,
        }
        : null,
      rowPreview: sectionRows.slice(0, 8).map((row) => {
        const left = parseWorkbookRowLine(row.left);
        const right = parseWorkbookRowLine(row.right);
        return {
          lineIdx: row.lineIdx,
          lineIdxs: row.lineIdxs,
          leftRowNumber: left?.rowNumber ?? null,
          rightRowNumber: right?.rowNumber ?? null,
          leftColumnCount: left?.cells.length ?? 0,
          rightColumnCount: right?.cells.length ?? 0,
          changedColumns: row.workbookRowDelta?.changedColumns ?? [],
        };
      }),
    });
  }, [
    activeDiffRegion,
    activeWorkbookSection,
    contentHeight,
    endIdx,
    frozenRows.length,
    items.length,
    sectionRows,
    sheetPresentation.allColumns,
    sheetPresentation.visibleColumns,
    showPerfDebug,
    singleGridWidth,
    startIdx,
    leftVirtualColumns.debug.viewportWidth,
    rightVirtualColumns.debug.viewportWidth,
  ]);
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
  }, [setExpandedBlocks]);
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
  const renderPinnedCollapseBar = useCallback((width: number | string, count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void) => (
    <div
      style={{
        position: 'sticky',
        left: 0,
        width,
        minWidth: width,
        overflow: 'hidden',
        zIndex: 5,
      }}>
      <CollapseBar
        count={count}
        expandCount={expandCount}
        onExpand={onExpand}
        onExpandAll={onExpandAll}
        palette={resolveWorkbookAuxBarPalette(T, 'mixed')}
      />
    </div>
  ), [T]);

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
  ) => {
    const paneVirtualColumns = paneVirtualColumnsBySide[side];
    const paneViewportWidth = paneVirtualColumns.debug.viewportWidth;
    const pinnedCollapseWidth = paneViewportWidth > 0 ? paneViewportWidth : '100%';

    return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div
        ref={ref}
        onScroll={onSync}
        className="flex-1 overflow-auto relative min-w-0 min-h-0"
        style={{ overflowAnchor: 'none' }}>
        <div key={`${sheetRenderKey}:${side}`} style={{ position: 'relative', minWidth: singleGridWidth, height: totalH + stickyHeaderHeight }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              isolation: 'isolate',
              background: cssVar('bg1'),
              boxShadow: `0 1px 0 ${cssVar('border')}`,
              minWidth: singleGridWidth,
            }}>
            <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden' }}>
              <WorkbookCanvasHeaderStrip
                mode="single"
                viewportWidth={paneViewportWidth}
                scrollRef={ref}
                freezeColumnCount={freezeColumnCount}
                contentWidth={singleGridWidth}
                sheetName={activeWorkbookSection?.name ?? ''}
                selection={selection}
                fontSize={fontSize}
                renderColumns={paneVirtualColumns.columnEntries}
                columnLayoutByColumn={paneVirtualColumns.columnLayoutByColumn}
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
              <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden' }}>
                <WorkbookPaneCanvasStrip
                  rows={frozenCanvasRows}
                  side={side === 'left' ? 'base' : 'mine'}
                  viewportWidth={paneViewportWidth}
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
                  renderColumns={paneVirtualColumns.columnEntries}
                  columnLayoutByColumn={paneVirtualColumns.columnLayoutByColumn}
                  mergedRanges={side === 'left' ? sheetPresentation.baseMergeRanges : sheetPresentation.mineMergeRanges}
                  rowEntryByRowNumber={side === 'left' ? rowEntryByRowNumber.base : rowEntryByRowNumber.mine}
                  compareCellsByRowNumber={side === 'left' ? compareCellsByRowNumber.base : compareCellsByRowNumber.mine}
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
                        pinnedCollapseWidth,
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
                    <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden' }}>
                      <WorkbookPaneCanvasStrip
                        rows={segment.rows}
                        side={side === 'left' ? 'base' : 'mine'}
                        viewportWidth={paneViewportWidth}
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
                        renderColumns={paneVirtualColumns.columnEntries}
                        columnLayoutByColumn={paneVirtualColumns.columnLayoutByColumn}
                        mergedRanges={side === 'left' ? sheetPresentation.baseMergeRanges : sheetPresentation.mineMergeRanges}
                        rowEntryByRowNumber={side === 'left' ? rowEntryByRowNumber.base : rowEntryByRowNumber.mine}
                        compareCellsByRowNumber={side === 'left' ? compareCellsByRowNumber.base : compareCellsByRowNumber.mine}
                        compareMode={compareMode}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <WorkbookActiveRegionOverlayLayer
            scrollRef={ref}
            viewportWidth={paneViewportWidth}
            stickyHeaderHeight={stickyHeaderHeight}
            activeDiffRegion={activeDiffRegion}
            activeSheetName={activeWorkbookSection?.name ?? null}
            visibleRowFrames={activeRegionOverlayVisibleRowFrames}
            columnLayoutByColumn={paneVirtualColumns.columnLayoutByColumn}
            contentLeft={LN_W + 3}
            frozenWidth={paneVirtualColumns.frozenWidth}
            freezeColumnCount={freezeColumnCount}
            resolvePatchBoundsModes={() => ['single']}
            fallbackBoundsModes={['single']}
            pulseNonce={guidedPulseNonce}
            {...(side === 'left'
              ? { label: formatWorkbookDiffRegionSummary(activeDiffRegion) }
              : {})}
          />
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
      <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
          <div
            ref={paneContainerRef}
            className="flex-1 min-w-0 min-h-0"
            style={{
              display: 'grid',
              gridTemplateColumns: paneGridTemplateColumns,
              alignItems: 'stretch',
            }}>
            {renderPane(leftScrollRef, 'left', () => handlePaneScroll('left'))}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整左右表格宽度"
              aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
              aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
              aria-valuenow={Math.round(splitRatio * 100)}
              tabIndex={0}
              onPointerDown={handleSplitterPointerDown}
              onKeyDown={handleSplitterKeyDown}
              onDoubleClick={() => commitSplitRatio(DEFAULT_SPLIT_RATIO)}
              style={{
                position: 'relative',
                cursor: 'col-resize',
                touchAction: 'none',
                background: isResizingSplitter ? cssAlpha('acc', '12') : 'transparent',
                outline: 'none',
              }}>
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 1,
                  transform: 'translateX(-50%)',
                  background: isResizingSplitter ? cssVar('acc') : cssVar('border'),
                  boxShadow: `0 0 0 1px ${isResizingSplitter ? cssVar('acc') : cssVar('border')}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 4,
                  height: 56,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: 999,
                  background: isResizingSplitter ? cssAlpha('acc', '44') : cssAlpha('border', '66'),
                }}
              />
            </div>
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
      {!tooltipDisabled && (
        <WorkbookCanvasHoverTooltip
          hover={hoveredCanvasCell}
          baseTitle={baseTitle}
          mineTitle={mineTitle}
        />
      )}
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
