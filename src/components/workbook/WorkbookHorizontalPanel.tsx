import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  startTransition,
} from 'react';
import type {
    DiffLine,
    Hunk,
    SearchMatch,
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
import { useI18n } from '@/context/i18n';
import { useTheme, useThemeTokens } from '@/context/theme';
import {
  clampSplitRatio,
  useSplitPanelHorizontalState,
} from '@/hooks/diff/useSplitPanelHorizontalState';
import { useVirtual, ROW_H } from '@/hooks/virtualization/useVirtual';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
import { useHorizontalVirtualColumns } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { useCollapseNavigationState } from '@/hooks/diff/useCollapseNavigationState';
import { useWorkbookExpandedBlocksState } from '@/hooks/workbook/useWorkbookExpandedBlocksState';
import { useWorkbookHorizontalViewportSync } from '@/hooks/workbook/useWorkbookHorizontalViewportSync';
import { useWorkbookHorizontalNavigationEffects } from '@/hooks/workbook/useWorkbookHorizontalNavigationEffects';
import {
  useWorkbookHorizontalBodyLayout,
} from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { useWorkbookHorizontalOverlayLayout } from '@/hooks/workbook/useWorkbookHorizontalOverlayLayout';
import { useWorkbookHorizontalStickyRenderProps } from '@/hooks/workbook/useWorkbookHorizontalStickyRenderProps';
import { useWorkbookHorizontalPaneRenderProps } from '@/hooks/workbook/useWorkbookHorizontalPaneRenderProps';
import { useWorkbookHorizontalNavigationRows } from '@/hooks/workbook/useWorkbookHorizontalNavigationRows';
import { useWorkbookHorizontalMiniMapState } from '@/hooks/workbook/useWorkbookHorizontalMiniMapState';
import { useWorkbookHorizontalPerfStats } from '@/hooks/workbook/useWorkbookHorizontalPerfStats';
import { useWorkbookHorizontalDerivedState } from '@/hooks/workbook/useWorkbookHorizontalDerivedState';
import { LN_W } from '@/constants/layout';
import { WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '@/utils/workbook/workbookSections';
import {
  formatWorkbookDiffRegionSummary,
} from '@/utils/workbook/workbookDiffRegion';
import {
  buildWorkbookSearchSelectionFromTarget,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
} from '@/utils/workbook/workbookNavigation';
import type { WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';
import {
  getWorkbookSelectionSpanForSelection,
} from '@/utils/workbook/workbookMergeLayout';
import {
  formatWorkbookFrozenColumnRangeLabel,
  formatWorkbookFrozenRowRangeLabel,
} from '@/utils/workbook/workbookFrozenPaneLabels';
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
  findCollapsedRowTarget,
} from '@/utils/collapse/collapsibleRows';
import {
  type WorkbookMetadataMap,
} from '@/utils/workbook/workbookMeta';
import { buildWorkbookCollapseBlockPrefix } from '@/utils/workbook/workbookCollapse';
import {
  extendWorkbookFreezeRowNumberForMergedCells,
  getResolvedWorkbookFreezeColCount,
  getResolvedWorkbookFreezeRowNumber,
} from '@/utils/workbook/workbookFreeze';
import { resolveWorkbookFrozenPaneViewport } from '@/utils/workbook/workbookFrozenPane';
import { resolveWorkbookAuxBarPalette } from '@/utils/workbook/workbookRowVisuals';
import CollapseBar from '@/components/diff/CollapseBar';
import CollapseJumpButton from '@/components/diff/CollapseJumpButton';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
} from '@/components/workbook/WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import { type WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import WorkbookPerfDebugPanel from '@/components/workbook/WorkbookPerfDebugPanel';
import WorkbookFrozenPaneOverflowBar from '@/components/workbook/WorkbookFrozenPaneOverflowBar';
import WorkbookSheetTabs from '@/components/workbook/WorkbookSheetTabs';
import WorkbookHorizontalRenderPane from '@/components/workbook/WorkbookHorizontalRenderPane';
import WorkbookHorizontalShell from '@/components/workbook/WorkbookHorizontalShell';
import { useAppStore } from '@/store/appStore';
import {
  WORKBOOK_CONTEXT_LINES as CONTEXT_LINES,
  workbookRowHasLineIdx as splitRowHasLineIdx,
  buildSelectionAutoScrollKey,
} from '@/utils/workbook/workbookPanelHelpers';
import { findNearestWorkbookVisibleItemIndex } from '@/utils/workbook/workbookRenderItemIndexes';
import { buildWorkbookRenderIdentity } from '@/utils/workbook/workbookRenderIdentity';

export interface WorkbookHorizontalPanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  guidedHunkRange?: Hunk | null;
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
  workbookSectionRowIndex: WorkbookSectionRowIndex;
  modifiedSheetNames?: ReadonlySet<string>;
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
const MIN_WORKBOOK_SCROLLABLE_BODY_ROWS = 8;
const MIN_WORKBOOK_FROZEN_PANE_ROWS = 4;
const MAX_WORKBOOK_FROZEN_PANE_VIEWPORT_RATIO = 0.6;
const EMPTY_HEIGHTS: number[] = [];
const EMPTY_MODIFIED_SHEET_NAMES = new Set<string>();

const WorkbookHorizontalPanel = memo(({
  diffLines,
  collapseCtx,
  activeHunkIdx,
  searchMatches,
  activeSearchIdx,
  guidedHunkRange = null,
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
  modifiedSheetNames = EMPTY_MODIFIED_SHEET_NAMES,
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
  const { t } = useI18n();
  const themeKey = useTheme();
  const T = useThemeTokens();
  const searchJumpNonce = useAppStore((s) => s.searchJumpNonce);
  const selectedCell = selection.primary;
  const initialSplitRatio = clampSplitRatio(
    layoutSnapshot?.splitRatio ?? DEFAULT_SPLIT_RATIO,
    MIN_SPLIT_RATIO,
    MAX_SPLIT_RATIO,
    DEFAULT_SPLIT_RATIO,
  );
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const leftFrozenRowsScrollRef = useRef<HTMLDivElement>(null);
  const rightFrozenRowsScrollRef = useRef<HTMLDivElement>(null);
  const frozenColumnsScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustRef = useRef(0);
  const scrollSyncCountRef = useRef(0);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const [hoveredFrozenRowsPaneSide, setHoveredFrozenRowsPaneSide] = useState<'left' | 'right' | null>(null);
  const suppressGuidedNavigationUntilRef = useRef(0);
  const lastFreezeSignatureRef = useRef<string | null>(null);
  const lastFrozenPaneAutoScrollKeyRef = useRef('');
  const {
    paneContainerRef,
    leftPaneScrollRef: leftScrollRef,
    rightPaneScrollRef: rightScrollRef,
    splitRatio,
    isResizingSplitter,
    horizontalPaneGridTemplateColumns: paneGridTemplateColumns,
    syncPaneScrollPosition: syncScrollPosition,
    handleSplitterPointerDown,
    handleSplitterKeyDown,
    resetSplitRatio,
    restoreSplitRatio,
  } = useSplitPanelHorizontalState({
    enabled: true,
    initialSplitRatio,
    defaultSplitRatio: DEFAULT_SPLIT_RATIO,
    minSplitRatio: MIN_SPLIT_RATIO,
    maxSplitRatio: MAX_SPLIT_RATIO,
    dividerWidth: SPLIT_DIVIDER_WIDTH,
    onWillSyncTarget: (targetSide) => {
      programmaticScrollUntilRef.current[targetSide] = Math.max(
        programmaticScrollUntilRef.current[targetSide],
        getNow() + 180,
      );
    },
    onDidSync: () => {
      scrollSyncCountRef.current += 1;
    },
  });
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
  const {
    userScrollPauseUntilRef,
    programmaticScrollUntilRef,
    lastAutoRowKeyRef,
    lastAutoCellKeyRef,
    suppressAutoScrollUntilRef,
    markProgrammaticScroll,
    isUserScrollPaused,
    isAutoScrollSuppressed,
    handlePaneScroll,
  } = useWorkbookHorizontalViewportSync({
    active,
    leftScrollRef,
    rightScrollRef,
    activeSheetName: activeWorkbookSection?.name ?? null,
    activeRegionId: activeDiffRegion?.id ?? null,
    expandedBlocks,
    isExpandedBlocksContextSettled,
    onExpandedBlocksChange,
    layoutSnapshot,
    onLayoutSnapshotChange,
    splitRatio,
    defaultSplitRatio: DEFAULT_SPLIT_RATIO,
    restoreSplitRatio,
    selectedCell,
    diffIdentity: diffLines,
    syncScrollPosition,
    onResetViewportState: () => {
      setHoveredCanvasCell(null);
    },
  });
  const baseVersion = useMemo(() => baseVersionLabel.trim(), [baseVersionLabel]);
  const mineVersion = useMemo(() => mineVersionLabel.trim(), [mineVersionLabel]);
  const activeRegionPulseTriggerKey = useMemo(() => (
    active && activeDiffRegion && activeDiffRegion.sheetName === activeWorkbookSection?.name
      ? `${activeHunkIdx}:${activeDiffRegion.id}`
      : null
  ), [active, activeDiffRegion, activeHunkIdx, activeWorkbookSection?.name]);

  const searchMatchSet = useMemo(() => new Set(searchMatches.map(match => match.lineIdx)), [searchMatches]);
  const activeSearchMatch = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx] ?? null)
    : null;
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
  const protectedLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
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
  const stickyHeaderFreezeRowNumber = useMemo(
    () => extendWorkbookFreezeRowNumberForMergedCells(
      activeWorkbookSection?.firstDataRowNumber ?? 0,
      activeSheetMergeRanges,
    ),
    [activeSheetMergeRanges, activeWorkbookSection?.firstDataRowNumber],
  );
  const explicitFreezeRowNumber = useMemo(
    () => extendWorkbookFreezeRowNumberForMergedCells(
      getResolvedWorkbookFreezeRowNumber(activeFreezeState, {
        rowNumber: 0,
        colCount: 0,
      }),
      activeSheetMergeRanges,
    ),
    [activeSheetMergeRanges, activeFreezeState],
  );
  const freezeRowNumber = useMemo(
    () => Math.max(stickyHeaderFreezeRowNumber, explicitFreezeRowNumber),
    [explicitFreezeRowNumber, stickyHeaderFreezeRowNumber],
  );
  const activeSheetCacheKey = activeWorkbookSection?.name ?? '';
  const collapseBlockPrefix = buildWorkbookCollapseBlockPrefix(activeSheetCacheKey);
  const freezeColumnCount = useMemo(
    () => getResolvedWorkbookFreezeColCount(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    }),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
  );
  const {
    hiddenRowNumberSet,
    rowBlocks,
    effectiveExpandedBlocks,
    frozenRows,
    stickyHeaderRows,
    paneFrozenRows,
    collapsedItemsMeasured,
    renderItemsMeasured,
    itemsMeasured,
    items,
    itemHeights,
    sheetPresentation,
    rowEntryByRowNumber,
    compareCellsByRowNumber,
    renderItemIndexes,
  } = useWorkbookHorizontalDerivedState({
    activeWorkbookSection,
    sectionRows,
    activeSheetCacheKey,
    collapseBlockPrefix,
    protectedLineIdxSet,
    activeHiddenRows: activeHiddenState.hiddenRows,
    activeHiddenColumns: activeHiddenState.hiddenColumns,
    stickyHeaderFreezeRowNumber,
    freezeRowNumber,
    expandedBlocks,
    collapseCtx,
    compareMode,
    baseVersion,
    mineVersion,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
    showHiddenColumns,
  });
  const rowVirtualHeights = items.length > 0 ? itemHeights : EMPTY_HEIGHTS;
  const { totalH, startIdx, endIdx, offsetTop: rowWindowOffsetTop, scrollToIndex, debug: rowVirtualDebug } = useVariableVirtual(
    rowVirtualHeights,
    leftScrollRef as RefObject<HTMLDivElement | null>,
    { overscanMin: 12, overscanFactor: 1.5, syncKey: activeWorkbookSection?.name ?? '' },
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
    scrollRef: leftScrollRef as RefObject<HTMLDivElement | null>,
    frozenScrollRef: frozenColumnsScrollRef as RefObject<HTMLDivElement | null>,
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
    scrollRef: rightScrollRef as RefObject<HTMLDivElement | null>,
    frozenScrollRef: frozenColumnsScrollRef as RefObject<HTMLDivElement | null>,
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
  const rowItemIndexBySide = renderItemIndexes.rowItemIndexBySide;
  const singleGridWidth = (LN_W + 3) + leftVirtualColumns.totalWidth;
  const stickyHeaderRowsHeight = stickyHeaderRows.length * ROW_H;
  const frozenRowsHeight = paneFrozenRows.length * ROW_H;
  const frozenRowsViewport = useMemo(() => resolveWorkbookFrozenPaneViewport({
    totalFrozenSize: frozenRowsHeight,
    viewportSize: rowVirtualDebug.viewportHeight,
    headerSize: ROW_H,
    minBodyViewportSize: items.length > 0 ? ROW_H * MIN_WORKBOOK_SCROLLABLE_BODY_ROWS : 0,
    maxViewportRatio: MAX_WORKBOOK_FROZEN_PANE_VIEWPORT_RATIO,
    minViewportSize: paneFrozenRows.length > 0 ? ROW_H * MIN_WORKBOOK_FROZEN_PANE_ROWS : 0,
  }), [frozenRowsHeight, items.length, paneFrozenRows.length, rowVirtualDebug.viewportHeight]);
  const frozenRowsViewportHeight = frozenRowsViewport.viewportSize;
  const totalFrozenRowsViewportHeight = stickyHeaderRowsHeight + frozenRowsViewportHeight;
  const stickyHeaderHeight = ROW_H + totalFrozenRowsViewportHeight;
  const contentHeight = totalH + stickyHeaderHeight;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
  const stickyHeaderCanvasRows = useMemo<WorkbookPaneCanvasRow[]>(
    () => stickyHeaderRows.map((row) => ({
      row,
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [stickyHeaderRows],
  );
  const frozenCanvasRows = useMemo<WorkbookPaneCanvasRow[]>(
    () => paneFrozenRows.map((row) => ({
      row,
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [paneFrozenRows],
  );
  const {
    startIdx: frozenRowsStartIdx,
    endIdx: frozenRowsEndIdx,
    scrollToIndex: scrollFrozenRowsToIndex,
  } = useVirtual(
    frozenCanvasRows.length,
    leftFrozenRowsScrollRef as RefObject<HTMLDivElement | null>,
    ROW_H,
    {
      overscanMin: 12,
      overscanFactor: 1.5,
      syncKey: `${activeWorkbookSection?.name ?? ''}:${freezeRowNumber}:frozen`,
    },
  );
  const visibleFrozenCanvasRows = useMemo(
    () => frozenCanvasRows.slice(frozenRowsStartIdx, frozenRowsEndIdx),
    [frozenCanvasRows, frozenRowsEndIdx, frozenRowsStartIdx],
  );
  const visibleFrozenCanvasOffsetTop = frozenRowsStartIdx * ROW_H;
  const visibleFrozenCanvasHeight = visibleFrozenCanvasRows.length * ROW_H;
  const frozenRowsRangeLabelBySide = useMemo(
    () => ({
      left: formatWorkbookFrozenRowRangeLabel(visibleFrozenCanvasRows.map((row) => row.row), 'base'),
      right: formatWorkbookFrozenRowRangeLabel(visibleFrozenCanvasRows.map((row) => row.row), 'mine'),
    }),
    [visibleFrozenCanvasRows],
  );
  const frozenColumnsRangeLabel = useMemo(
    () => formatWorkbookFrozenColumnRangeLabel(leftVirtualColumns.columnEntries, freezeColumnCount),
    [freezeColumnCount, leftVirtualColumns.columnEntries],
  );
  const bodyLayout = useWorkbookHorizontalBodyLayout({
    items,
    startIdx,
    endIdx,
    guidedHunkRange,
    activeSearchLineIdx,
    searchMatchSet,
  });
  const bodySegments = bodyLayout.bodySegments;
  const activeRegionOverlayVisibleRowFrames = useWorkbookHorizontalOverlayLayout({
    sectionRows,
    visibleFrozenCanvasRows,
    bodyLayout,
    rowWindowOffsetTop,
    stickyHeaderHeight,
  });

  const workbookNavigationRows = useWorkbookHorizontalNavigationRows({
    activeSheetName: activeWorkbookSection?.name ?? null,
    selectedCell,
    frozenRows: paneFrozenRows,
    items,
    baseVersion,
    mineVersion,
    visibleColumns: sheetPresentation.visibleColumns,
    rowEntryByRowNumber,
  });

  const syncFrozenRowsPaneScrollPosition = useCallback((source: 'left' | 'right') => {
    const from = source === 'left' ? leftFrozenRowsScrollRef.current : rightFrozenRowsScrollRef.current;
    const to = source === 'left' ? rightFrozenRowsScrollRef.current : leftFrozenRowsScrollRef.current;
    if (!from || !to) return;
    if (Math.abs(to.scrollTop - from.scrollTop) > 1) {
      to.scrollTop = from.scrollTop;
    }
  }, []);
  useEffect(() => {
    const nextKey = `${activeWorkbookSection?.name ?? ''}:${freezeRowNumber}:${frozenRowsViewport.isOverflowing ? 'overflow' : 'fit'}`;
    if (lastFrozenPaneAutoScrollKeyRef.current === nextKey) return;
    lastFrozenPaneAutoScrollKeyRef.current = nextKey;

    const nextScrollTop = frozenRowsViewport.isOverflowing
      ? Math.max(0, frozenRowsHeight - frozenRowsViewportHeight)
      : 0;

    const applyScroll = () => {
      if (leftFrozenRowsScrollRef.current) leftFrozenRowsScrollRef.current.scrollTop = nextScrollTop;
      if (rightFrozenRowsScrollRef.current) rightFrozenRowsScrollRef.current.scrollTop = nextScrollTop;
    };

    const rafId = requestAnimationFrame(applyScroll);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeWorkbookSection?.name,
    freezeRowNumber,
    frozenRowsHeight,
    frozenRowsViewport.isOverflowing,
    frozenRowsViewportHeight,
  ]);
  const visibleRowItemIndexByLineIdx = renderItemIndexes.visibleRowItemIndexByLineIdx;

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const hiddenRowNumbers = renderItemIndexes.hiddenRowNumbersByLineIdx.get(lineIdx);
    if (hiddenRowNumbers && activeWorkbookSection) {
      onRevealHiddenRows(activeWorkbookSection.name, hiddenRowNumbers);
      return true;
    }

    const target = findCollapsedRowTarget(rowBlocks, effectiveExpandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      rowHasLineIdx: splitRowHasLineIdx,
    });
    if (!target) return false;
    setExpandedBlocks((prev) => revealCollapsedLine(
      prev,
      target.blockId,
      target.hiddenStart,
      target.hiddenEnd,
      target.targetIndex,
    ));
    return true;
  }, [activeWorkbookSection, collapseBlockPrefix, effectiveExpandedBlocks, onRevealHiddenRows, renderItemIndexes, rowBlocks, setExpandedBlocks]);

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
    const nearestIndex = findNearestWorkbookVisibleItemIndex(renderItemIndexes, lineIdx);
    if (nearestIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(nearestIndex, align, behavior);
      requestAnimationFrame(() => syncScrollPosition('left'));
      return true;
    }
    return false;
  }, [markProgrammaticScroll, renderItemIndexes, revealLineIfCollapsed, scrollToIndex, syncScrollPosition, visibleRowItemIndexByLineIdx]);

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
    const frozenColumnsScroller = frozenColumnsScrollRef.current;

    const frozenWidth = LN_W + 3 + paneVirtualColumns.frozenWidth;
    const mergedRanges = cell.side === 'base'
      ? sheetPresentation.baseMergeRanges
      : sheetPresentation.mineMergeRanges;
    const span = getWorkbookSelectionSpanForSelection(cell, mergedRanges);
    const targetColumn = paneVirtualColumns.columnLayoutByColumn.get(span.startCol);
    const endColumn = paneVirtualColumns.columnLayoutByColumn.get(span.endCol);
    if (!targetColumn || !endColumn) return false;

    const targetLeftWithinFrozenPane = targetColumn.absoluteOffset ?? targetColumn.offset;
    const targetRightWithinFrozenPane = (endColumn.absoluteOffset ?? endColumn.offset) + endColumn.width;
    const targetLeft = LN_W + 3 + targetColumn.offset;
    const targetRight = LN_W + 3 + endColumn.offset + endColumn.width;
    const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);

    if (span.endCol < freezeColumnCount && paneVirtualColumns.isFrozenOverflowing && frozenColumnsScroller) {
      const frozenLeftBoundary = frozenColumnsScroller.scrollLeft + desiredPadding;
      const frozenRightBoundary = frozenColumnsScroller.scrollLeft + paneVirtualColumns.frozenWidth - desiredPadding;
      if (
        strategy === 'focus'
        || targetLeftWithinFrozenPane < frozenLeftBoundary
        || targetRightWithinFrozenPane > frozenRightBoundary
      ) {
        frozenColumnsScroller.scrollLeft = Math.max(
          0,
          Math.min(
            targetLeftWithinFrozenPane - desiredPadding,
            paneVirtualColumns.fullFrozenWidth - paneVirtualColumns.frozenWidth,
          ),
        );
      }
      return true;
    }

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
    freezeColumnCount,
    leftScrollRef,
    markProgrammaticScroll,
    paneVirtualColumnsBySide,
    rightScrollRef,
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
    const frozenColumnsScroller = frozenColumnsScrollRef.current;

    if (region.endCol < freezeColumnCount && paneVirtualColumns.isFrozenOverflowing && frozenColumnsScroller) {
      const startEntry = paneVirtualColumns.columnLayoutByColumn.get(region.startCol);
      const endEntry = paneVirtualColumns.columnLayoutByColumn.get(region.endCol);
      if (startEntry && endEntry) {
        const desiredPadding = 24;
        const targetLeft = startEntry.absoluteOffset ?? startEntry.offset;
        const targetRight = (endEntry.absoluteOffset ?? endEntry.offset) + endEntry.width;
        const maxScrollLeft = Math.max(0, paneVirtualColumns.fullFrozenWidth - paneVirtualColumns.frozenWidth);
        if (
          targetLeft < frozenColumnsScroller.scrollLeft + desiredPadding
          || targetRight > frozenColumnsScroller.scrollLeft + paneVirtualColumns.frozenWidth - desiredPadding
        ) {
          frozenColumnsScroller.scrollLeft = Math.max(0, Math.min(targetLeft - desiredPadding, maxScrollLeft));
        }
      }
      return;
    }

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
    leftScrollRef,
    markProgrammaticScroll,
    paneVirtualColumnsBySide,
    rightScrollRef,
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
  useWorkbookHorizontalNavigationEffects({
    active,
    activeSearchMatch,
    activeSearchTargetCell,
    activeWorkbookSection,
    activeHiddenRows: activeHiddenState.hiddenRows,
    activeHiddenColumns: activeHiddenState.hiddenColumns,
    showHiddenColumns,
    searchJumpNonce,
    onSelectionRequest,
    onRevealHiddenRows,
    onRevealHiddenColumns,
    scrollToSearchTarget,
    focusWorkbookCell,
    activeDiffRegion,
    navigationTargetCell,
    selectedCell,
    frozenRows,
    rowItemIndexBySide,
    scrollFrozenRowsToIndex,
    scrollToResolvedLine,
    scrollToIndex,
    syncScrollPosition,
    syncFrozenRowsPaneScrollPosition,
    focusWorkbookDiffRegion,
    markProgrammaticScroll,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    lastAutoRowKeyRef,
    lastAutoCellKeyRef,
    suppressGuidedNavigationUntilRef,
  });

  useEffect(() => {
    if (!tooltipDisabled) return;
    setHoveredCanvasCell(null);
  }, [tooltipDisabled]);

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
    lastAutoCellKeyRef,
    lastAutoRowKeyRef,
    selectedCell,
    selectedCell?.colIndex,
    selectedCell?.kind,
    selectedCell?.rowNumber,
    selectedCell?.sheetName,
    selectedCell?.side,
    suppressAutoScrollUntilRef,
    userScrollPauseUntilRef,
  ]);

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
  }, [items, leftScrollRef, markProgrammaticScroll, rightScrollRef]);

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

  const miniMapMeasured = useWorkbookHorizontalMiniMapState({
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing: frozenRowsViewport.isOverflowing,
    frozenRowsViewportHeight: totalFrozenRowsViewportHeight,
    items,
    searchMatchSet,
    visibleColumns: sheetPresentation.visibleColumns,
  });
  const miniMapSegments = miniMapMeasured.value;
  const scrollToCollapseIndex = useCallback((idx: number, align: 'start' | 'center' = 'start') => {
    markProgrammaticScroll('left', 360);
    scrollToIndex(idx, align);
    requestAnimationFrame(() => syncScrollPosition('left'));
  }, [markProgrammaticScroll, scrollToIndex, syncScrollPosition]);
  const {
    activeCollapseIndex,
    activeCollapsePosition,
    totalCollapseCount,
    handleJumpToNextCollapse,
    handleJumpToPreviousCollapse,
    resetActiveCollapseNavigation,
  } = useCollapseNavigationState({
    items,
    startIdx,
    endIdx,
    isCollapseItem: (item) => item.kind === 'split-collapse',
    scrollToIndex: scrollToCollapseIndex,
  });

  const perfStats = useWorkbookHorizontalPerfStats({
    enabled: showPerfDebug,
    activeSheetName: activeWorkbookSection?.name ?? '',
    items,
    startIdx,
    endIdx,
    totalColumns: sheetPresentation.visibleColumns.length,
    renderedColumns: Math.max(leftVirtualColumns.columnEntries.length, rightVirtualColumns.columnEntries.length),
    frozenRowsCount: frozenRows.length,
    freezeColumnCount,
    collapsedItemsDuration: collapsedItemsMeasured.duration,
    hiddenRowNumberCount: hiddenRowNumberSet.size,
    renderItemsDuration: renderItemsMeasured.duration,
    itemsDuration: itemsMeasured.duration,
    hiddenRowsCount: activeHiddenState.hiddenRows.length,
    miniMapDuration: miniMapMeasured.duration,
    rowWindowMs: rowVirtualDebug.lastCalcMs,
    rowWindowUpdates: rowVirtualDebug.rangeUpdates,
    rowOverscan: rowVirtualDebug.overscan,
    rowViewport: rowVirtualDebug.viewportHeight,
    columnWindowMs: Math.max(leftVirtualColumns.debug.lastCalcMs, rightVirtualColumns.debug.lastCalcMs),
    columnWindowUpdates: leftVirtualColumns.debug.rangeUpdates + rightVirtualColumns.debug.rangeUpdates,
    columnOverscan: Math.max(leftVirtualColumns.debug.overscan, rightVirtualColumns.debug.overscan),
    columnViewport: Math.max(leftVirtualColumns.debug.viewportWidth, rightVirtualColumns.debug.viewportWidth),
    miniMapDebugRef: miniMapDebugRef as typeof miniMapDebugRef,
    scrollSyncCount: scrollSyncCountRef.current,
    frozenRowsViewportHeight: totalFrozenRowsViewportHeight,
    frozenRowsHeight: stickyHeaderRowsHeight + frozenRowsHeight,
    frozenRowsOverflow: frozenRowsViewport.isOverflowing,
    frozenColumnsViewport: leftVirtualColumns.frozenWidth,
    frozenColumnsTotalSize: leftVirtualColumns.fullFrozenWidth,
    frozenColumnsOverflow: leftVirtualColumns.isFrozenOverflowing,
    frozenColumnsScrollLeft: leftVirtualColumns.debug.frozenScrollLeft,
  });
  const sheetRenderKey = buildWorkbookRenderIdentity({
    sheetName: activeWorkbookSection?.name,
    themeKey,
  });
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
      frozenPane: {
        rows: {
          viewportHeight: totalFrozenRowsViewportHeight,
          totalHeight: stickyHeaderRowsHeight + frozenRowsHeight,
          overflowing: frozenRowsViewport.isOverflowing,
        },
        columns: {
          viewportWidth: leftVirtualColumns.frozenWidth,
          totalWidth: leftVirtualColumns.fullFrozenWidth,
          overflowing: leftVirtualColumns.isFrozenOverflowing,
          scrollLeft: leftVirtualColumns.debug.frozenScrollLeft,
        },
      },
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
    stickyHeaderRowsHeight,
    frozenRowsHeight,
    frozenRows.length,
    frozenRowsViewport.isOverflowing,
    totalFrozenRowsViewportHeight,
    items.length,
    sectionRows,
    sheetPresentation.allColumns,
    sheetPresentation.visibleColumns,
    showPerfDebug,
    singleGridWidth,
    startIdx,
    leftVirtualColumns.debug.frozenScrollLeft,
    leftVirtualColumns.frozenWidth,
    leftVirtualColumns.fullFrozenWidth,
    leftVirtualColumns.isFrozenOverflowing,
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
  }, [setExpandedBlocks, userScrollPauseUntilRef]);
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
  const renderPinnedCollapseBar = useCallback((width: number | string, count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void, sourceItemIndex: number) => (
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
        active={sourceItemIndex === activeCollapseIndex}
        onExpand={onExpand}
        onExpandAll={onExpandAll}
        palette={resolveWorkbookAuxBarPalette(T, 'mixed')}
      />
    </div>
  ), [T, activeCollapseIndex]);

  useEffect(() => {
    resetActiveCollapseNavigation();
  }, [activeWorkbookSection?.name, diffLines, resetActiveCollapseNavigation]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectionRequest({
      target: null,
      reason: 'programmatic',
    });
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    leftScrollRef.current?.scrollTo({ top: 0, left: 0 });
    rightScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [leftScrollRef, onActiveWorkbookSheetChange, onSelectionRequest, rightScrollRef, workbookSections]);
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
  const handleRevealHiddenHeaderColumns = useCallback((columns: number[]) => {
    if (!activeWorkbookSection) return;
    onRevealHiddenColumns(activeWorkbookSection.name, columns);
  }, [activeWorkbookSection, onRevealHiddenColumns]);
  const handleRevealActiveSheetRows = useCallback((rowNumbers: number[]) => {
    if (!activeWorkbookSection) return;
    onRevealHiddenRows(activeWorkbookSection.name, rowNumbers);
  }, [activeWorkbookSection, onRevealHiddenRows]);
  const stickyRenderPropsBySide = useWorkbookHorizontalStickyRenderProps({
    paneVirtualColumnsBySide,
    activeSheetName,
    leftScrollRef: leftScrollRef as RefObject<HTMLDivElement | null>,
    rightScrollRef: rightScrollRef as RefObject<HTMLDivElement | null>,
    leftFrozenRowsScrollRef: leftFrozenRowsScrollRef as RefObject<HTMLDivElement | null>,
    rightFrozenRowsScrollRef: rightFrozenRowsScrollRef as RefObject<HTMLDivElement | null>,
    hoveredFrozenRowsPaneSide,
    frozenRowsRangeLabelBySide,
    freezeColumnCount,
    singleGridWidth,
    selection,
    fontSize,
    hiddenColumnSegments: sheetPresentation.hiddenColumnSegments,
    onSelectColumn: handleSelectColumn,
    onRevealHiddenColumns: handleRevealHiddenHeaderColumns,
    onColumnWidthChange: handleResizeColumn,
    onAutoFitColumn: handleAutoFitColumn,
    stickyHeaderRowsHeight,
    stickyHeaderCanvasRows,
    baseVersion,
    mineVersion,
    headerRowNumber,
    onSelectionRequest,
    onHoverChange: setHoveredCanvasCell,
    visibleColumns: sheetPresentation.visibleColumns,
    baseMergedRanges: sheetPresentation.baseMergeRanges,
    mineMergedRanges: sheetPresentation.mineMergeRanges,
    baseRowEntryByRowNumber: rowEntryByRowNumber.base,
    mineRowEntryByRowNumber: rowEntryByRowNumber.mine,
    baseCompareCellsByRowNumber: compareCellsByRowNumber.base,
    mineCompareCellsByRowNumber: compareCellsByRowNumber.mine,
    compareMode,
  });
  const paneRenderPropsBySide = useWorkbookHorizontalPaneRenderProps({
    paneVirtualColumnsBySide,
    leftScrollRef: leftScrollRef as RefObject<HTMLDivElement | null>,
    rightScrollRef: rightScrollRef as RefObject<HTMLDivElement | null>,
    activeSheetName,
    activeDiffRegion,
    freezeColumnCount,
    singleGridWidth,
    viewportHeight: rowVirtualDebug.viewportHeight,
    stickyHeaderHeight,
    activeRegionOverlayVisibleRowFrames,
    activeRegionPulseTriggerKey,
    overlayLabel: formatWorkbookDiffRegionSummary(activeDiffRegion),
    selection,
    onSelectionRequest,
    onHoverChange: setHoveredCanvasCell,
    fontSize,
    visibleColumns: sheetPresentation.visibleColumns,
    baseVersion,
    mineVersion,
    headerRowNumber,
    baseMergedRanges: sheetPresentation.baseMergeRanges,
    mineMergedRanges: sheetPresentation.mineMergeRanges,
    baseRowEntryByRowNumber: rowEntryByRowNumber.base,
    mineRowEntryByRowNumber: rowEntryByRowNumber.mine,
    baseCompareCellsByRowNumber: compareCellsByRowNumber.base,
    mineCompareCellsByRowNumber: compareCellsByRowNumber.mine,
    compareMode,
  });

  const renderPane = (
    ref: RefObject<HTMLDivElement | null>,
    side: 'left' | 'right',
    onSync: () => void,
  ) => {
    const stickyRenderProps = stickyRenderPropsBySide[side];
    const paneRenderProps = paneRenderPropsBySide[side];

    return (
      <WorkbookHorizontalRenderPane
        paneRef={ref}
        onScroll={onSync}
        sheetRenderKey={`${sheetRenderKey}:${side}`}
        contentWidth={singleGridWidth}
        contentHeight={totalH + stickyHeaderHeight}
        stickyHeaderHeight={stickyHeaderHeight + rowWindowOffsetTop}
        side={side}
        stickyRenderProps={stickyRenderProps}
        paneRenderProps={paneRenderProps}
        hasFrozenRows={frozenCanvasRows.length > 0}
        frozenRowsViewportHeight={frozenRowsViewportHeight}
        frozenRowsViewportIsOverflowing={frozenRowsViewport.isOverflowing}
        frozenRowsHeight={frozenRowsHeight}
        visibleFrozenCanvasOffsetTop={visibleFrozenCanvasOffsetTop}
        visibleFrozenCanvasHeight={visibleFrozenCanvasHeight}
        visibleFrozenCanvasRows={visibleFrozenCanvasRows}
        onFrozenRowsScroll={() => syncFrozenRowsPaneScrollPosition(side)}
        onFrozenRowsMouseEnter={() => setHoveredFrozenRowsPaneSide(side)}
        onFrozenRowsMouseLeave={() => setHoveredFrozenRowsPaneSide((prev) => (prev === side ? null : prev))}
        bodySegments={bodySegments}
        renderPinnedCollapseBar={renderPinnedCollapseBar}
        onExpandCollapseBlock={handleExpandCollapseBlock}
        onRevealHiddenRows={handleRevealActiveSheetRows}
      />
    );
  };

  return (
    <WorkbookHorizontalShell
      paneContainerRef={paneContainerRef}
      paneGridTemplateColumns={paneGridTemplateColumns}
      splitRatio={splitRatio}
      isResizingSplitter={isResizingSplitter}
      minSplitRatioPercent={Math.round(MIN_SPLIT_RATIO * 100)}
      maxSplitRatioPercent={Math.round(MAX_SPLIT_RATIO * 100)}
      onSplitterPointerDown={handleSplitterPointerDown}
      onSplitterKeyDown={handleSplitterKeyDown}
      onResetSplitRatio={resetSplitRatio}
      perfPanel={showPerfDebug ? <WorkbookPerfDebugPanel stats={perfStats} /> : null}
      frozenOverflowBar={leftVirtualColumns.isFrozenOverflowing ? (
        <WorkbookFrozenPaneOverflowBar
          scrollerRef={frozenColumnsScrollRef as RefObject<HTMLDivElement | null>}
          label={t('workbookFrozenColumnsWindowLabel')}
          itemCount={freezeColumnCount}
          rangeLabel={frozenColumnsRangeLabel}
          totalSize={leftVirtualColumns.fullFrozenWidth}
          viewportSize={leftVirtualColumns.frozenWidth}
          hint={t('workbookFrozenColumnsWindowHintShared')}
        />
      ) : null}
      leftPane={renderPane(leftScrollRef, 'left', () => handlePaneScroll('left'))}
      rightPane={renderPane(rightScrollRef, 'right', () => handlePaneScroll('right'))}
      collapseJumpButton={(
        <CollapseJumpButton
          onPrev={handleJumpToPreviousCollapse}
          onNext={handleJumpToNextCollapse}
          currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
          totalCount={totalCollapseCount}
          storageKey="workbook-split-h"
        />
      )}
      miniMap={(
        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={leftScrollRef as RefObject<HTMLDivElement | null>}
          contentHeight={contentHeight}
          debugRef={miniMapDebugRef}
        />
      )}
      hoverTooltip={!tooltipDisabled ? (
        <WorkbookCanvasHoverTooltip
          hover={hoveredCanvasCell}
          baseTitle={baseTitle}
          mineTitle={mineTitle}
        />
      ) : null}
      sheetTabs={(
        <WorkbookSheetTabs
          sections={workbookSections}
          activeIndex={resolvedActiveWorkbookSectionIdx}
          onSelect={handleSelectSheet}
          fontSize={fontSize}
          modifiedSheetNames={modifiedSheetNames}
        />
      )}
    />
  );
});

export default WorkbookHorizontalPanel;
