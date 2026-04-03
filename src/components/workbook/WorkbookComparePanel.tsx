import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import type {
    DiffLine,
    Hunk,
    SearchMatch,
    SplitRow,
    WorkbookCompareMode,
    WorkbookCompareLayoutSnapshot,
    WorkbookDiffRegion,
    WorkbookFreezeState,
    WorkbookHiddenStateBySheet,
    WorkbookMoveDirection,
    WorkbookSelectionMode,
    WorkbookSelectedCell,
    WorkbookSelectionRequest,
    WorkbookSelectionState,
  } from '@/types';
import { useI18n } from '@/context/i18n';
import { useThemeTokens } from '@/context/theme';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { useVirtual, ROW_H } from '@/hooks/virtualization/useVirtual';
import { useHorizontalVirtualColumns } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { useWorkbookExpandedBlocksState } from '@/hooks/workbook/useWorkbookExpandedBlocksState';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
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
  buildWorkbookSearchSelectionFromTarget,
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
  moveWorkbookSelection,
} from '@/utils/workbook/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '@/utils/workbook/workbookSheetIndex';
import {
  parseWorkbookRowLine,
} from '@/utils/workbook/workbookCompare';
import {
  getWorkbookSelectionSpanForSelection,
} from '@/utils/workbook/workbookMergeLayout';
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
  getWorkbookColumnsRenderMode,
  getStackedWorkbookRowRenderHeight,
  getWorkbookStackedRenderMode,
} from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedVisualGroups,
} from '@/utils/workbook/workbookStackedMergeGroups';
import {
  buildWorkbookCompareLayoutSnapshot,
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
import WorkbookColumnsCanvasStrip, { type WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import WorkbookStackedCanvasStrip, {
  type WorkbookCanvasRenderGroup,
  type WorkbookCanvasRenderRow,
} from '@/components/workbook/WorkbookStackedCanvasStrip';
import WorkbookPerfDebugPanel, { type WorkbookPerfDebugStats } from '@/components/workbook/WorkbookPerfDebugPanel';
import WorkbookSheetTabs from '@/components/workbook/WorkbookSheetTabs';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import WorkbookHiddenRowsBar from '@/components/workbook/WorkbookHiddenRowsBar';
import { useAppStore } from '@/store/appStore';
import {
  WORKBOOK_CONTEXT_LINES as CONTEXT_LINES,
  workbookRowHasLineIdx as compareRowHasLineIdx,
  workbookRowTouchesOrAfter as compareRowTouchesOrAfter,
  isEqualWorkbookRow as isEqualCompareRow,
  rowTouchesGuidedHunk,
  getWorkbookRowKey as getWorkbookCompareRowKey,
  buildSelectionAutoScrollKey,
  getWorkbookMiniMapTone,
  buildWorkbookRowEntryMaps,
  buildWorkbookCompareCellsMaps,
  type SelectionAutoScrollLock,
} from '@/utils/workbook/workbookPanelHelpers';

type CompareMode = 'stacked' | 'columns';
const EMPTY_HEIGHTS: number[] = [];
type WorkbookCompareRenderItem =
  | { kind: 'row'; row: SplitRow; lineIdx: number }
  | { kind: 'collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[]; count: number };
type WorkbookStackedVirtualItem =
  | {
    kind: 'rows';
    rows: WorkbookCanvasRenderRow[];
    height: number;
    sourceStartItemIndex: number;
    sourceEndItemIndex: number;
    groupKey: string;
    hasVerticalMerge: boolean;
    baseTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
    mineTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
  }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; height: number; sourceItemIndex: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; height: number; sourceItemIndex: number };

interface WorkbookStackedScrollTarget {
  itemIndex: number;
  rowOffsetTop: number;
  rowHeight: number;
}

function buildWorkbookStackedBandScrollTarget(
  itemIndex: number,
  rowOffsetTop: number,
  rowHeight: number,
  side: 'base' | 'mine',
): WorkbookStackedScrollTarget {
  const hasDoubleBand = rowHeight > ROW_H;
  return {
    itemIndex,
    rowOffsetTop: rowOffsetTop + (hasDoubleBand && side === 'mine' ? ROW_H : 0),
    rowHeight: hasDoubleBand ? ROW_H : rowHeight,
  };
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
  baseTitle: string;
  mineTitle: string;
  baseVersionLabel: string;
  mineVersionLabel: string;
  mode: CompareMode;
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
  baseTitle,
  mineTitle,
  baseVersionLabel,
  mineVersionLabel,
  mode,
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
}: WorkbookComparePanelProps) => {
  const { t } = useI18n();
  const T = useThemeTokens();
  const searchJumpNonce = useAppStore((s) => s.searchJumpNonce);
  const selectedCell = selection.primary;
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const pendingScrollAdjustRef = useRef(0);
  const selectionAutoScrollLockRef = useRef<SelectionAutoScrollLock | null>(null);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const snapshotEmitRafRef = useRef(0);
  const restoreRafRef = useRef(0);
  const lastRestoredSnapshotKeyRef = useRef('');
  const lastViewportSheetNameRef = useRef<string | null>(activeWorkbookSection?.name ?? null);
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const collapsedItemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: Array<Extract<WorkbookCompareRenderItem, { kind: 'row' | 'collapse' }>>; duration: number }>>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const lastGuidedNavigationKeyRef = useRef('');
  const lastAppliedSearchKeyRef = useRef('');
  const lastForcedRevealHunkIdxRef = useRef(-1);
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
  const freezeRowNumber = useMemo(() => {
    const resolvedFreezeRowNumber = getResolvedWorkbookFreezeRowNumber(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    });
    return extendWorkbookFreezeRowNumberForMergedCells(resolvedFreezeRowNumber, activeSheetMergeRanges);
  }, [activeSheetMergeRanges, activeWorkbookSection?.firstDataRowNumber, activeFreezeState]);
  const freezeColumnCount = useMemo(
    () => getResolvedWorkbookFreezeColCount(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    }),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
  );
  const activeSheetCacheKey = activeWorkbookSection?.name ?? '';
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  useEffect(() => {
    visibleRowsCacheRef.current.clear();
    collapsedItemsCacheRef.current = new WeakMap();
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
    () => buildCollapsibleRowBlocks(collapseSourceRows, isEqualCompareRow),
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

  const collapsedItemsMeasured = useMemo(() => {
    let expandedCache = collapsedItemsCacheRef.current.get(effectiveExpandedBlocks);
    if (!expandedCache) {
      expandedCache = new Map();
      collapsedItemsCacheRef.current.set(effectiveExpandedBlocks, expandedCache);
    }
    const itemsCacheKey = `${activeSheetCacheKey}::${freezeRowNumber}::${collapseCtx ? '1' : '0'}`;
    const cached = expandedCache.get(itemsCacheKey);
    if (cached) return cached;

    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, effectiveExpandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
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
  }, [activeSheetCacheKey, collapseBlockPrefix, collapseCtx, effectiveExpandedBlocks, freezeRowNumber, rowBlocks]);
  const renderItemsMeasured = useMemo(() => {
    if (hiddenRowNumberSet.size === 0) {
      return {
        value: collapsedItemsMeasured.value as WorkbookCompareRenderItem[],
        duration: collapsedItemsMeasured.duration,
      };
    }

    const start = getNow();
    const value = overlayHiddenWorkbookRowsOnItems<
      WorkbookCompareRenderItem,
      Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>,
      SplitRow
    >(
      collapsedItemsMeasured.value,
      hiddenRowNumberSet,
      (item) => item.kind === 'row' ? item.row : null,
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
      if (item.kind === 'collapse') return true;
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

  const rowHeight = mode === 'stacked' ? (ROW_H * 2) : ROW_H;
  const itemHeights = useMemo(
    () => items.map((item) => {
      if (item.kind === 'collapse' || item.kind === 'hidden-rows') return ROW_H;
      return mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(item.row, rowHeight, ROW_H)
        : rowHeight;
    }),
    [items, mode, rowHeight],
  );
  const sheetPresentation = useMemo(() => {
    return buildWorkbookSheetPresentation(
      sectionRows,
      activeWorkbookSection?.name ?? '',
      baseWorkbookMetadata,
      mineWorkbookMetadata,
      activeWorkbookSection?.maxColumns ?? 1,
      showHiddenColumns,
      compareMode,
      activeHiddenState.hiddenColumns,
    );
  }, [activeHiddenState.hiddenColumns, activeWorkbookSection?.maxColumns, activeWorkbookSection?.name, baseWorkbookMetadata, compareMode, mineWorkbookMetadata, sectionRows, showHiddenColumns]);
  const stackedVirtualItems = useMemo<WorkbookStackedVirtualItem[]>(() => {
    if (mode !== 'stacked') return [];

    const next: WorkbookStackedVirtualItem[] = [];
    const currentRows: Array<{ row: WorkbookCanvasRenderRow; sourceItemIndex: number }> = [];

    const flushRows = () => {
      if (currentRows.length === 0) return;

      const layoutRows = buildWorkbookStackedLayoutRows({
        rows: currentRows.map((item) => ({
          row: item.row.row,
          renderMode: item.row.renderMode,
          height: item.row.height,
        })),
        sheetName: activeWorkbookSection?.name ?? '',
        baseVersion,
        mineVersion,
        visibleColumns: sheetPresentation.visibleColumns,
      });
      const groups = buildWorkbookStackedVisualGroups({
        rows: layoutRows,
        baseMergeRanges: sheetPresentation.baseMergeRanges,
        mineMergeRanges: sheetPresentation.mineMergeRanges,
      });

      groups.forEach((group) => {
        const groupedRows = currentRows.slice(group.startIndex, group.endIndex + 1);
        next.push({
          kind: 'rows',
          rows: groupedRows.map((item) => item.row),
          height: groupedRows.reduce((sum, item) => sum + item.row.height, 0),
          sourceStartItemIndex: groupedRows[0]!.sourceItemIndex,
          sourceEndItemIndex: groupedRows[groupedRows.length - 1]!.sourceItemIndex,
          groupKey: group.key,
          hasVerticalMerge: group.reason === 'merge',
          baseTrack: group.baseTrack.map((track) => ({
            sourceRowIndex: track.sourceRowIndex,
            rowNumber: track.entry.rowNumber,
          })),
          mineTrack: group.mineTrack.map((track) => ({
            sourceRowIndex: track.sourceRowIndex,
            rowNumber: track.entry.rowNumber,
          })),
        });
      });

      currentRows.length = 0;
    };

    items.forEach((item, index) => {
      if (item.kind === 'collapse') {
        flushRows();
        next.push({
          kind: 'collapse',
          item,
          height: ROW_H,
          sourceItemIndex: index,
        });
        return;
      }

      if (item.kind === 'hidden-rows') {
        flushRows();
        next.push({
          kind: 'hidden-rows',
          item,
          height: ROW_H,
          sourceItemIndex: index,
        });
        return;
      }

      const renderMode = getWorkbookStackedRenderMode(item.row);
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = index > 0
        && items[index - 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[index - 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      const nextGuided = index + 1 < items.length
        && items[index + 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[index + 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);

      currentRows.push({
        sourceItemIndex: index,
        row: {
          row: item.row,
          renderMode,
          height: itemHeights[index] ?? rowHeight,
          isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
          isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
          isGuided,
          isGuidedStart: isGuided && !prevGuided,
          isGuidedEnd: isGuided && !nextGuided,
        },
      });
    });

    flushRows();
    return next;
  }, [
    activeSearchLineIdx,
    activeWorkbookSection?.name,
    baseVersion,
    guidedHunkRange,
    itemHeights,
    items,
    mineVersion,
    mode,
    rowHeight,
    searchMatchSet,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    sheetPresentation.visibleColumns,
  ]);
  const stackedVirtualHeights = useMemo(
    () => stackedVirtualItems.map((item) => item.height),
    [stackedVirtualItems],
  );
  const stackedVirtualOffsets = useMemo(() => {
    const offsets = new Array<number>(stackedVirtualItems.length + 1).fill(0);
    for (let index = 0; index < stackedVirtualItems.length; index += 1) {
      offsets[index + 1] = offsets[index]! + (stackedVirtualItems[index]?.height ?? 0);
    }
    return offsets;
  }, [stackedVirtualItems]);
  const stackedRowScrollTargetsBySide = useMemo(() => {
    const next = {
      base: new Map<number, WorkbookStackedScrollTarget>(),
      mine: new Map<number, WorkbookStackedScrollTarget>(),
    };

    stackedVirtualItems.forEach((item, itemIndex) => {
      if (item.kind !== 'rows') return;
      let rowOffsetTop = 0;
      item.rows.forEach((renderRow) => {
        const baseRowNumber = getWorkbookSideRowNumber(renderRow.row, 'base');
        if (baseRowNumber != null && !next.base.has(baseRowNumber)) {
          next.base.set(baseRowNumber, buildWorkbookStackedBandScrollTarget(
            itemIndex,
            rowOffsetTop,
            renderRow.height,
            'base',
          ));
        }

        const mineRowNumber = getWorkbookSideRowNumber(renderRow.row, 'mine');
        if (mineRowNumber != null && !next.mine.has(mineRowNumber)) {
          next.mine.set(mineRowNumber, buildWorkbookStackedBandScrollTarget(
            itemIndex,
            rowOffsetTop,
            renderRow.height,
            'mine',
          ));
        }

        rowOffsetTop += renderRow.height;
      });
    });

    return next;
  }, [stackedVirtualItems]);
  const stackedLineScrollTargets = useMemo(() => {
    const next = new Map<number, WorkbookStackedScrollTarget>();

    stackedVirtualItems.forEach((item, itemIndex) => {
      if (item.kind !== 'rows') return;
      let rowOffsetTop = 0;
      item.rows.forEach((renderRow) => {
        const baseTarget = buildWorkbookStackedBandScrollTarget(
          itemIndex,
          rowOffsetTop,
          renderRow.height,
          'base',
        );
        const mineTarget = buildWorkbookStackedBandScrollTarget(
          itemIndex,
          rowOffsetTop,
          renderRow.height,
          'mine',
        );
        const leftLineIdx = renderRow.row.lineIdxs[0];
        const rightLineIdx = renderRow.row.lineIdxs.length > 1
          ? renderRow.row.lineIdxs[1]
          : undefined;
        const hasBaseRow = getWorkbookSideRowNumber(renderRow.row, 'base') != null;
        const hasMineRow = getWorkbookSideRowNumber(renderRow.row, 'mine') != null;

        if (leftLineIdx != null) {
          next.set(leftLineIdx, hasBaseRow ? baseTarget : mineTarget);
        }
        if (rightLineIdx != null) {
          next.set(rightLineIdx, hasMineRow ? mineTarget : baseTarget);
        }
        if (rightLineIdx == null && leftLineIdx != null) {
          next.set(leftLineIdx, hasMineRow && !hasBaseRow ? mineTarget : baseTarget);
        }

        rowOffsetTop += renderRow.height;
      });
    });

    return next;
  }, [stackedVirtualItems]);
  const visibleRowItemIndexByLineIdx = useMemo(() => {
    const next = new Map<number, number>();

    if (mode === 'stacked') {
      stackedVirtualItems.forEach((item, index) => {
        if (item.kind !== 'rows') return;
        item.rows.forEach((row) => {
          row.row.lineIdxs.forEach((lineIdx) => {
            if (!next.has(lineIdx)) next.set(lineIdx, index);
          });
        });
      });
      return next;
    }

    items.forEach((item, index) => {
      if (item.kind !== 'row') return;
      item.row.lineIdxs.forEach((lineIdx) => {
        if (!next.has(lineIdx)) next.set(lineIdx, index);
      });
    });

    return next;
  }, [items, mode, stackedVirtualItems]);
  const constantVirtual = useVirtual(
    mode === 'stacked' ? 0 : items.length,
    scrollRef as RefObject<HTMLDivElement>,
    rowHeight,
    { overscanMin: 12, overscanFactor: 1.5, syncKey: activeWorkbookSection?.name ?? '' },
  );
  const stackedVariableVirtualHeights = mode === 'stacked' ? stackedVirtualHeights : EMPTY_HEIGHTS;
  const stackedVariableVirtual = useVariableVirtual(
    stackedVariableVirtualHeights,
    scrollRef as RefObject<HTMLDivElement>,
    { overscanMin: 12, overscanFactor: 1.5, syncKey: activeWorkbookSection?.name ?? '' },
  );
  const activeVirtual = mode === 'stacked' ? stackedVariableVirtual : constantVirtual;
  const {
    totalH,
    startIdx,
    endIdx,
    scrollToIndex,
    debug: rowVirtualDebug,
  } = activeVirtual;
  const rowWindowOffsetTop = mode === 'stacked' ? stackedVariableVirtual.offsetTop : startIdx * rowHeight;
  const markProgrammaticScroll = useCallback((duration = 320) => {
    programmaticScrollUntilRef.current = Math.max(programmaticScrollUntilRef.current, getNow() + duration);
  }, []);
  const scrollToStackedTarget = useCallback((
    target: WorkbookStackedScrollTarget,
    align: 'start' | 'center' = 'center',
    behavior: 'auto' | 'smooth' | 'smart' = 'smart',
  ) => {
    const container = scrollRef.current;
    if (!container) return false;

    const itemTop = stackedVirtualOffsets[target.itemIndex] ?? 0;
    const targetTop = itemTop + target.rowOffsetTop;
    const viewportHeight = rowVirtualDebug.viewportHeight;
    const offset = align === 'center'
      ? Math.max(0, (viewportHeight / 2) - (target.rowHeight / 2))
      : 60;
    const nextTop = Math.max(0, targetTop - offset);
    const distance = Math.abs(container.scrollTop - nextTop);
    const resolvedBehavior = behavior === 'smart'
      ? (distance > Math.max(viewportHeight * 4, target.rowHeight * 200) ? 'auto' : 'smooth')
      : behavior;

    markProgrammaticScroll(420);
    container.scrollTo({
      top: nextTop,
      behavior: resolvedBehavior,
    });
    return true;
  }, [markProgrammaticScroll, rowVirtualDebug.viewportHeight, scrollRef, stackedVirtualOffsets]);
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
  const emitLayoutSnapshotRef = useRef(emitLayoutSnapshot);
  emitLayoutSnapshotRef.current = emitLayoutSnapshot;
  const scheduleLayoutSnapshot = useCallback(() => {
    if (snapshotEmitRafRef.current) return;
    snapshotEmitRafRef.current = requestAnimationFrame(() => {
      snapshotEmitRafRef.current = 0;
      emitLayoutSnapshotRef.current();
    });
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      scheduleLayoutSnapshot();
      const now = getNow();
      if (now < programmaticScrollUntilRef.current) return;
      userScrollPauseUntilRef.current = now + 260;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (snapshotEmitRafRef.current) cancelAnimationFrame(snapshotEmitRafRef.current);
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
    };
  }, [scheduleLayoutSnapshot]);

  useEffect(() => {
    const nextSheetName = activeWorkbookSection?.name ?? null;
    const previousSheetName = lastViewportSheetNameRef.current;
    lastViewportSheetNameRef.current = nextSheetName;

    if (!previousSheetName || !nextSheetName || previousSheetName === nextSheetName) return;

    const container = scrollRef.current;
    if (!container) return;

    if (snapshotEmitRafRef.current) {
      cancelAnimationFrame(snapshotEmitRafRef.current);
      snapshotEmitRafRef.current = 0;
    }

    lastRestoredSnapshotKeyRef.current = '';
    pendingScrollAdjustRef.current = 0;
    suppressAutoScrollUntilRef.current = Math.max(suppressAutoScrollUntilRef.current, getNow() + 520);
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 520);
    markProgrammaticScroll(520);
    setHoveredCanvasCell(null);
    container.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeWorkbookSection?.name, markProgrammaticScroll]);

  useEffect(() => {
    if (!isExpandedBlocksContextSettled) return;
    scheduleLayoutSnapshot();
  }, [expandedBlocks, isExpandedBlocksContextSettled, scheduleLayoutSnapshot]);

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
    suppressAutoScrollUntilRef.current = getNow() + 520;
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    if (selectedCell && selectedCell.sheetName === activeWorkbookSection?.name) {
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
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        markProgrammaticScroll(420);
        container.scrollTop = snapshot.scrollTop;
        container.scrollLeft = snapshot.scrollLeft;
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
    activeHunkIdx,
    activeWorkbookSection?.name,
    layoutSnapshot,
    markProgrammaticScroll,
    selectedCell,
  ]);

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
    lastForcedRevealHunkIdxRef.current = -1;
    selectionAutoScrollLockRef.current = null;
    lastCollapseJumpIndexRef.current = null;
  }, [activeWorkbookSection?.name, diffLines]);

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const hiddenRowItem = items.find((item): item is Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }> => (
      item.kind === 'hidden-rows'
      && item.rows.some(row => compareRowHasLineIdx(row, lineIdx))
    ));
    if (hiddenRowItem && activeWorkbookSection) {
      onRevealHiddenRows(activeWorkbookSection.name, hiddenRowItem.rowNumbers);
      return true;
    }

    const target = findCollapsedRowTarget(rowBlocks, effectiveExpandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
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
  }, [activeWorkbookSection, collapseBlockPrefix, effectiveExpandedBlocks, items, onRevealHiddenRows, rowBlocks, setExpandedBlocks]);

  const scrollToResolvedLine = useCallback((
    lineIdx: number,
    align: 'start' | 'center' = 'center',
    behavior: 'auto' | 'smooth' | 'smart' = 'smart',
  ) => {
    if (mode === 'stacked') {
      const exactTarget = stackedLineScrollTargets.get(lineIdx);
      if (exactTarget) {
        scrollToStackedTarget(exactTarget, align, behavior);
        setPendingScrollTarget((prev) => (
          prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
        ));
        return true;
      }
    }

    const exactIndex = visibleRowItemIndexByLineIdx.get(lineIdx) ?? -1;
    if (exactIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(exactIndex, align, behavior);
      setPendingScrollTarget((prev) => (
        prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
      ));
      return true;
    }
    if (revealLineIfCollapsed(lineIdx)) {
      setPendingScrollTarget({ lineIdx, align });
      return false;
    }
    const nearestIndex = mode === 'stacked'
      ? stackedVirtualItems.findIndex((item) => item.kind === 'rows' && item.rows.some((row) => compareRowTouchesOrAfter(row.row, lineIdx)))
      : items.findIndex((item) => item.kind === 'row' && compareRowTouchesOrAfter(item.row, lineIdx));
    if (nearestIndex >= 0) {
      if (mode === 'stacked') {
        const nearestItem = stackedVirtualItems[nearestIndex];
        if (nearestItem?.kind === 'rows') {
          const nearestRow = nearestItem.rows.find((row) => compareRowTouchesOrAfter(row.row, lineIdx)) ?? nearestItem.rows[0];
          if (nearestRow) {
            return scrollToStackedTarget({
              itemIndex: nearestIndex,
              rowOffsetTop: nearestItem.rows
                .slice(0, nearestItem.rows.indexOf(nearestRow))
                .reduce((sum, row) => sum + row.height, 0),
              rowHeight: nearestRow.height,
            }, align, behavior);
          }
        }
      }
      markProgrammaticScroll(420);
      scrollToIndex(nearestIndex, align, behavior);
      return true;
    }
    return false;
  }, [items, markProgrammaticScroll, mode, revealLineIfCollapsed, scrollToIndex, scrollToStackedTarget, stackedLineScrollTargets, stackedVirtualItems, visibleRowItemIndexByLineIdx]);

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
    syncKey: activeWorkbookSection?.name ?? '',
  });
  const focusWorkbookCell = useCallback((
    cell: WorkbookSelectedCell,
    strategy: 'focus' | 'ensure-visible' = 'ensure-visible',
  ) => {
    if (cell.kind === 'row') return true;
    const container = scrollRef.current;
    if (!container) return false;

    const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
    const mergedRanges = cell.side === 'base'
      ? sheetPresentation.baseMergeRanges
      : sheetPresentation.mineMergeRanges;
    const span = getWorkbookSelectionSpanForSelection(cell, mergedRanges);
    const targetColumn = virtualColumns.columnLayoutByColumn.get(span.startCol);
    const endColumn = virtualColumns.columnLayoutByColumn.get(span.endCol);
    if (!targetColumn || !endColumn) return false;

    const contentOrigin = LN_W + 3;
    const sideOffset = mode === 'columns' && cell.side === 'mine'
      ? targetColumn.width
      : 0;
    const targetLeft = contentOrigin + targetColumn.offset + sideOffset;
    const targetRight = contentOrigin + endColumn.offset + (
      mode === 'columns'
        ? cell.side === 'mine'
          ? endColumn.displayWidth
          : endColumn.width
        : endColumn.width
    );
    const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);

    if (strategy === 'focus') {
      markProgrammaticScroll(260);
      container.scrollLeft = desiredScrollLeft;
      return true;
    }

    const leftBoundary = container.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = container.scrollLeft + container.clientWidth - desiredPadding;
    if (targetLeft < leftBoundary || targetLeft + targetWidth > rightBoundary) {
      markProgrammaticScroll(260);
      if (targetLeft < leftBoundary) {
        container.scrollLeft = desiredScrollLeft;
      } else {
        container.scrollLeft = Math.max(0, targetLeft + targetWidth - container.clientWidth + desiredPadding);
      }
    }

    return true;
  }, [
    markProgrammaticScroll,
    mode,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);
  const focusWorkbookDiffRegion = useCallback((region: WorkbookDiffRegion) => {
    const container = scrollRef.current;
    if (!container) return;

    const bounds = resolveWorkbookRegionHorizontalBounds({
      region,
      columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
      freezeColumnCount,
      resolvePatchBoundsModes: () => (
        mode === 'stacked'
          ? ['single']
          : ['paired-shared']
      ),
      fallbackBoundsModes: mode === 'stacked'
        ? ['single']
        : ['paired-shared'],
    });
    if (!bounds) return;

    const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
    const contentOrigin = LN_W + 3;
    const targetLeft = contentOrigin + bounds.leftOffset;
    const targetRight = contentOrigin + bounds.rightOffset;
    const targetWidth = Math.max(1, bounds.width);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);
    const leftBoundary = container.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = container.scrollLeft + container.clientWidth - desiredPadding;

    if (targetLeft < leftBoundary || targetRight > rightBoundary) {
      markProgrammaticScroll(260);
      if (targetLeft < leftBoundary || targetWidth >= container.clientWidth - frozenWidth - (desiredPadding * 2)) {
        container.scrollLeft = desiredScrollLeft;
      } else {
        container.scrollLeft = Math.max(0, targetRight - container.clientWidth + desiredPadding);
      }
    }
  }, [
    freezeColumnCount,
    markProgrammaticScroll,
    mode,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);
  const showColumnHeader = true;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
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

    if (mode === 'stacked') {
      stackedVirtualItems.forEach((item, index) => {
        if (item.kind !== 'rows') return;
        item.rows.forEach((row) => {
          const baseRowNumber = getWorkbookSideRowNumber(row.row, 'base');
          if (baseRowNumber != null && !next.base.has(baseRowNumber)) {
            next.base.set(baseRowNumber, index);
          }

          const mineRowNumber = getWorkbookSideRowNumber(row.row, 'mine');
          if (mineRowNumber != null && !next.mine.has(mineRowNumber)) {
            next.mine.set(mineRowNumber, index);
          }
        });
      });
      return next;
    }

    items.forEach((item, index) => {
      if (item.kind !== 'row') return;

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
  }, [items, mode, stackedVirtualItems]);
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
    if (mode === 'stacked') {
      const stackedTarget = stackedRowScrollTargetsBySide[target.side].get(target.rowNumber) ?? null;
      if (stackedTarget) {
        scrollToStackedTarget(stackedTarget, 'center', 'auto');
        return { didScroll: true, isExact: true };
      }
    }

    const rowIndex = rowItemIndexBySide[target.side].get(target.rowNumber) ?? -1;
    if (rowIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(rowIndex, 'center', 'auto');
      return { didScroll: true, isExact: true };
    }

    return {
      didScroll: scrollToResolvedLine(fallbackLineIdx, 'center', 'auto'),
      isExact: !rowExists,
    };
  }, [
    markProgrammaticScroll,
    mode,
    rowEntryByRowNumber,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    scrollToStackedTarget,
    stackedRowScrollTargetsBySide,
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
      renderMode: getWorkbookStackedRenderMode(row),
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
  const stackedFrozenCanvasGroups = useMemo<WorkbookCanvasRenderGroup[]>(() => {
    if (stackedFrozenCanvasRows.length === 0) return [];

    const layoutRows = buildWorkbookStackedLayoutRows({
      rows: stackedFrozenCanvasRows.map((row) => ({
        row: row.row,
        renderMode: row.renderMode,
        height: row.height,
      })),
      sheetName: activeWorkbookSection?.name ?? '',
      baseVersion,
      mineVersion,
      visibleColumns: sheetPresentation.visibleColumns,
    });
    const visualGroups = buildWorkbookStackedVisualGroups({
      rows: layoutRows,
      baseMergeRanges: sheetPresentation.baseMergeRanges,
      mineMergeRanges: sheetPresentation.mineMergeRanges,
    });

    return visualGroups.map((group) => {
      const rows = stackedFrozenCanvasRows.slice(group.startIndex, group.endIndex + 1);
      return {
        key: group.key,
        rows,
        height: rows.reduce((sum, row) => sum + row.height, 0),
        hasVerticalMerge: group.reason === 'merge',
        baseTrack: group.baseTrack.map((track) => ({
          sourceRowIndex: track.sourceRowIndex,
          rowNumber: track.entry.rowNumber,
        })),
        mineTrack: group.mineTrack.map((track) => ({
          sourceRowIndex: track.sourceRowIndex,
          rowNumber: track.entry.rowNumber,
        })),
      };
    });
  }, [
    activeWorkbookSection?.name,
    baseVersion,
    mineVersion,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    sheetPresentation.visibleColumns,
    stackedFrozenCanvasRows,
  ]);
  const columnsFrozenCanvasRows = useMemo<WorkbookColumnsCanvasRow[]>(
    () => frozenRows.map((row) => ({
      row,
      renderMode: getWorkbookColumnsRenderMode(row),
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [frozenRows],
  );
  const bodySegments = useMemo(() => {
    if (mode !== 'stacked') return [];

    const slice = stackedVirtualItems.slice(startIdx, endIdx);
    const segments: Array<
      | { kind: 'rows'; group: WorkbookCanvasRenderGroup; top: number; height: number }
      | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; top: number; height: number }
      | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; top: number; height: number }
    > = [];
    let cursorTop = 0;

    slice.forEach((item) => {
      if (item.kind === 'collapse') {
        segments.push({
          kind: 'collapse',
          item: item.item,
          top: cursorTop,
          height: item.height,
        });
        cursorTop += item.height;
        return;
      }

      if (item.kind === 'hidden-rows') {
        segments.push({
          kind: 'hidden-rows',
          item: item.item,
          top: cursorTop,
          height: item.height,
        });
        cursorTop += item.height;
        return;
      }

      segments.push({
        kind: 'rows',
        group: {
          key: item.groupKey,
          rows: item.rows,
          height: item.height,
          hasVerticalMerge: item.hasVerticalMerge,
          baseTrack: item.baseTrack,
          mineTrack: item.mineTrack,
        },
        top: cursorTop,
        height: item.height,
      });
      cursorTop += item.height;
    });

    return segments;
  }, [
    endIdx,
    mode,
    startIdx,
    stackedVirtualItems,
  ]);
  const stackedCanvasRuns = useMemo(() => {
    if (mode !== 'stacked') return [];

    const runs: Array<{
      key: string;
      groups: WorkbookCanvasRenderGroup[];
      top: number;
      height: number;
    }> = [];
    let currentGroups: WorkbookCanvasRenderGroup[] = [];
    let currentTop = 0;
    let currentHeight = 0;

    const flushRun = () => {
      if (currentGroups.length === 0) return;
      runs.push({
        key: currentGroups.map(group => group.key).join(':'),
        groups: currentGroups,
        top: currentTop,
        height: currentHeight,
      });
      currentGroups = [];
      currentHeight = 0;
    };

    bodySegments.forEach((segment) => {
      if (segment.kind !== 'rows') {
        flushRun();
        return;
      }
      if (currentGroups.length === 0) {
        currentTop = segment.top;
      }
      currentGroups.push(segment.group);
      currentHeight += segment.height;
    });
    flushRun();

    return runs;
  }, [bodySegments, mode]);
  const stackedVisibleMergeGroupCount = useMemo(() => {
    if (mode !== 'stacked') return 0;

    const visibleKeys = new Set<string>();
    stackedFrozenCanvasGroups.forEach((group) => {
      if (group.hasVerticalMerge) visibleKeys.add(group.key);
    });
    bodySegments.forEach((segment) => {
      if (segment.kind !== 'rows') return;
      if (segment.group.hasVerticalMerge) visibleKeys.add(segment.group.key);
    });

    return visibleKeys.size;
  }, [bodySegments, mode, stackedFrozenCanvasGroups]);
  const columnsBodySegments = useMemo(() => {
    if (mode !== 'columns') return null;

    const slice = items.slice(startIdx, endIdx);
    const segments: Array<
      | { kind: 'rows'; rows: WorkbookColumnsCanvasRow[]; top: number; height: number }
      | { kind: 'collapse'; item: Extract<typeof slice[number], { kind: 'collapse' }>; top: number; height: number }
      | { kind: 'hidden-rows'; item: Extract<typeof slice[number], { kind: 'hidden-rows' }>; top: number; height: number }
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
      const renderMode = getWorkbookColumnsRenderMode(item.row);
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
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
        isGuided,
        isGuidedStart: isGuided && !prevGuided,
        isGuidedEnd: isGuided && !nextGuided,
      } as WorkbookColumnsCanvasRow);
      cursorTop += ROW_H;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, items, mode, searchMatchSet, startIdx]);
  const sectionRowIndexByKey = useMemo(
    () => new Map(sectionRows.map((row, index) => [getWorkbookCompareRowKey(row), index])),
    [sectionRows],
  );
  const activeRegionOverlayVisibleRowFrames = useMemo(() => {
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
        let cursorTop = stickyHeaderHeight + rowWindowOffsetTop + segment.top;
        segment.group.rows.forEach((renderRow) => {
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
        let cursorTop = stickyHeaderHeight + rowWindowOffsetTop + segment.top;
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
    return visibleRowFrames;
  }, [
    bodySegments,
    columnsBodySegments,
    frozenRows,
    mode,
    rowHeight,
    rowWindowOffsetTop,
    sectionRowIndexByKey,
    showColumnHeader,
    stickyHeaderHeight,
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
  }, [activeWorkbookSection, baseVersion, frozenRows, items, mineVersion, selectedCell, sheetPresentation.visibleColumns]);

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
  }, [activeDiffRegion?.id, activeHunkIdx, activeWorkbookSection?.name]);

  useEffect(() => {
    if (!active) return;
    if (!activeDiffRegion || !activeWorkbookSection) return;
    if (activeDiffRegion.sheetName !== activeWorkbookSection.name) return;
    if (getNow() < suppressGuidedNavigationUntilRef.current) return;
    const navigationKey = `${activeHunkIdx}:${activeDiffRegion.id}`;
    if (lastGuidedNavigationKeyRef.current === navigationKey) return;

    lastGuidedNavigationKeyRef.current = navigationKey;
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    const preferredNavigationTarget = (
      navigationTargetCell
      && navigationTargetCell.sheetName === activeWorkbookSection.name
      && navigationTargetCell.kind !== 'column'
      && navigationTargetCell.rowNumber > 0
    ) ? navigationTargetCell : null;
    const anchorPatch = activeDiffRegion.patches[0] ?? null;
    const anchorSide: 'base' | 'mine' = preferredNavigationTarget?.side
      ?? (anchorPatch?.hasBaseSide ? 'base' : 'mine');
    const anchorRowNumber = preferredNavigationTarget?.rowNumber
      ?? (anchorSide === 'base'
        ? (anchorPatch?.baseRowStart ?? anchorPatch?.baseRowEnd ?? null)
        : (anchorPatch?.mineRowStart ?? anchorPatch?.mineRowEnd ?? null));
    const stackedTarget = mode === 'stacked' && anchorRowNumber != null
      ? (stackedRowScrollTargetsBySide[anchorSide].get(anchorRowNumber) ?? null)
      : null;
    const targetRowIndex = anchorRowNumber != null
      ? (rowItemIndexBySide[anchorSide].get(anchorRowNumber) ?? -1)
      : -1;
    if (stackedTarget) {
      scrollToStackedTarget(stackedTarget, 'start', 'auto');
    } else if (targetRowIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(targetRowIndex, 'start', 'auto');
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
    activeHunkIdx,
    activeWorkbookSection,
    focusWorkbookDiffRegion,
    markProgrammaticScroll,
    mode,
    navigationTargetCell,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    scrollToStackedTarget,
    stackedRowScrollTargetsBySide,
  ]);

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
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'row')) return;
    if (!shouldForceReveal && lastAutoRowKeyRef.current === selectionKey) return;
    const stackedTarget = mode === 'stacked'
      ? (stackedRowScrollTargetsBySide[selectedCell.side].get(selectedCell.rowNumber) ?? null)
      : null;
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (stackedTarget) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      scrollToStackedTarget(stackedTarget, 'center', 'smart');
    } else if (idx >= 0) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll(360);
      scrollToIndex(idx, 'center', 'smart');
    }
  }, [active, activeDiffRegion, activeHunkIdx, activeWorkbookSection, isAutoScrollSuppressed, isSelectionAutoScrollLocked, isUserScrollPaused, markProgrammaticScroll, mode, navigationTargetCell, rowItemIndexBySide, scrollToIndex, scrollToStackedTarget, selectedCell, stackedRowScrollTargetsBySide]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'cell')) return;
    if (!shouldForceReveal && lastAutoCellKeyRef.current === selectionKey) return;

    const rafId = requestAnimationFrame(() => {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoCellKeyRef.current = selectionKey;
      focusWorkbookCell(selectedCell, 'ensure-visible');
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeDiffRegion,
    activeHunkIdx,
    activeWorkbookSection,
    focusWorkbookCell,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    isSelectionAutoScrollLocked,
    markProgrammaticScroll,
    navigationTargetCell,
    selectedCell,
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
      if (item.kind !== 'row') {
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
    () => mode === 'stacked'
      ? getCollapseIndexes(stackedVirtualItems, (item) => item.kind === 'collapse')
      : getCollapseIndexes(items, (item) => item.kind === 'collapse'),
    [items, mode, stackedVirtualItems],
  );
  const totalCollapseCount = useMemo(
    () => mode === 'stacked'
      ? countRemainingCollapses(stackedVirtualItems, 0, (item) => item.kind === 'collapse')
      : countRemainingCollapses(items, 0, (item) => item.kind === 'collapse'),
    [items, mode, stackedVirtualItems],
  );
  const activeCollapsePosition = useMemo(
    () => resolveActiveCollapsePosition(collapseIndexes, lastCollapseJumpIndexRef.current, startIdx),
    [collapseIndexes, startIdx],
  );
  const perfStats = useMemo<WorkbookPerfDebugStats>(() => ({
    panel: mode,
    sheetName: activeWorkbookSection?.name ?? '',
    totalRows: mode === 'stacked' ? stackedVirtualItems.length : items.length,
    renderedRows: Math.max(0, endIdx - startIdx),
    collapseBlocks: mode === 'stacked'
      ? stackedVirtualItems.filter(item => item.kind === 'collapse').length
      : items.filter(item => item.kind === 'collapse').length,
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
    scrollSyncCount: 0,
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
    mode,
    rowVirtualDebug.lastCalcMs,
    rowVirtualDebug.overscan,
    rowVirtualDebug.rangeUpdates,
    rowVirtualDebug.viewportHeight,
    sheetPresentation.visibleColumns.length,
    stackedVirtualItems,
    startIdx,
    virtualColumns.columnEntries.length,
    virtualColumns.debug.lastCalcMs,
    virtualColumns.debug.overscan,
    virtualColumns.debug.rangeUpdates,
    virtualColumns.debug.viewportWidth,
  ]);
  const sheetRenderKey = `${mode}:${activeWorkbookSection?.name ?? 'none'}`;
  useEffect(() => {
    if (!showPerfDebug || !activeWorkbookSection) return;
    workbookDebugLog('WorkbookComparePanel/render-state', {
      panel: mode,
      sheetName: activeWorkbookSection.name,
      sectionRowCount: sectionRows.length,
      frozenRowCount: frozenRows.length,
      itemCount: items.length,
      visibleColumns: sheetPresentation.visibleColumns,
      allColumns: sheetPresentation.allColumns,
      startIdx,
      endIdx,
      rowWindowOffsetTop,
      contentHeight,
      minBodyWidth,
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
    minBodyWidth,
    mode,
    rowWindowOffsetTop,
    sectionRows,
    sheetPresentation.allColumns,
    sheetPresentation.visibleColumns,
    showPerfDebug,
    startIdx,
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
  }, [activeHunkIdx, activeWorkbookSection, selectedCell, setExpandedBlocks]);
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
      <CollapseBar
        count={count}
        expandCount={expandCount}
        onExpand={onExpand}
        onExpandAll={onExpandAll}
        palette={resolveWorkbookAuxBarPalette(T, 'mixed')}
      />
    </div>
  ), [T, pinnedCollapseWidth]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectionRequest({
      target: null,
      reason: 'programmatic',
    });
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
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
                selection={selection}
                fontSize={fontSize}
                renderColumns={virtualColumns.columnEntries}
                columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                fixedSide={stackedHeaderSide}
                showFixedSideAccent={false}
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
          )}
          {stackedFrozenCanvasGroups.length > 0 && (
            <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
              <WorkbookStackedCanvasStrip
                groups={stackedFrozenCanvasGroups}
                viewportWidth={virtualColumns.debug.viewportWidth}
                scrollRef={scrollRef as RefObject<HTMLDivElement>}
                freezeColumnCount={freezeColumnCount}
                contentWidth={minBodyWidth}
                sheetName={activeWorkbookSection?.name ?? ''}
                baseVersion={baseVersion}
                mineVersion={mineVersion}
                headerRowNumber={headerRowNumber}
                selection={selection}
                onSelectionRequest={onSelectionRequest}
                onHoverChange={setHoveredCanvasCell}
                fontSize={fontSize}
                visibleColumns={sheetPresentation.visibleColumns}
                renderColumns={virtualColumns.columnEntries}
                columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                baseMergedRanges={sheetPresentation.baseMergeRanges}
                mineMergedRanges={sheetPresentation.mineMergeRanges}
                baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                baseCompareCellsByRowNumber={compareCellsByRowNumber.base}
                mineCompareCellsByRowNumber={compareCellsByRowNumber.mine}
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
              selection={selection}
              fontSize={fontSize}
              renderColumns={virtualColumns.columnEntries}
              columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
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
              selection={selection}
              onSelectionRequest={onSelectionRequest}
              onHoverChange={setHoveredCanvasCell}
              fontSize={fontSize}
              visibleColumns={sheetPresentation.visibleColumns}
              renderColumns={virtualColumns.columnEntries}
              columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
              baseMergedRanges={sheetPresentation.baseMergeRanges}
              mineMergedRanges={sheetPresentation.mineMergeRanges}
              baseRowEntryByRowNumber={rowEntryByRowNumber.base}
              mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
              baseCompareCellsByRowNumber={compareCellsByRowNumber.base}
              mineCompareCellsByRowNumber={compareCellsByRowNumber.mine}
              compareMode={compareMode}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
      {stackedVisibleMergeGroupCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: '0 10px 8px',
            padding: '8px 12px',
            borderRadius: 12,
            border: `1px solid ${cssAlpha('chgTx', '35')}`,
            background: `linear-gradient(180deg, ${cssVar('bg0')} 0%, ${cssVar('bg1')} 100%)`,
            boxShadow: `0 10px 20px -24px ${cssAlpha('chgTx', '55')}, inset 0 1px 0 ${cssVar('bg0')}`,
            flexShrink: 0,
          }}>
          <div
            style={{
              color: cssVar('chgTx'),
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 800,
              lineHeight: 1.35,
            }}>
            {t('workbookStackedMergeNoticeTitle', { count: stackedVisibleMergeGroupCount })}
          </div>
          <div
            style={{
              marginTop: 4,
              color: cssVar('t1'),
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.45,
            }}>
            {t('workbookStackedMergeNoticeBody')}
          </div>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto relative min-w-0 min-h-0"
            style={{ overflowAnchor: 'none' }}>
            <div key={sheetRenderKey} style={{ position: 'relative', minWidth: minBodyWidth, height: contentHeight }}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 30,
                  isolation: 'isolate',
                  background: cssVar('bg1'),
                  boxShadow: `0 1px 0 ${cssVar('border')}`,
                  minWidth: minBodyWidth,
                }}>
                {renderStickyCanvas()}
              </div>

              <div style={{ position: 'absolute', top: stickyHeaderHeight + rowWindowOffsetTop, left: 0, minWidth: minBodyWidth }}>
                {mode === 'stacked' ? (
                  <>
                    {bodySegments.map((segment) => {
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
                      if (segment.kind === 'hidden-rows') {
                        return (
                          <div key={`hidden-rows-${segment.item.rowNumbers.join('-') || segment.top}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
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
                      return null;
                    })}
                    {stackedCanvasRuns.map((run) => (
                      <div
                        key={run.key}
                        style={{
                          position: 'absolute',
                          top: run.top,
                          left: 0,
                          right: 0,
                          minWidth: minBodyWidth,
                          height: run.height,
                        }}>
                        <div style={{ position: 'sticky', left: 0, width: virtualColumns.debug.viewportWidth, overflow: 'hidden' }}>
                          <WorkbookStackedCanvasStrip
                            groups={run.groups}
                            viewportWidth={virtualColumns.debug.viewportWidth}
                            scrollRef={scrollRef as RefObject<HTMLDivElement>}
                            freezeColumnCount={freezeColumnCount}
                            contentWidth={minBodyWidth}
                            sheetName={activeWorkbookSection?.name ?? ''}
                            baseVersion={baseVersion}
                            mineVersion={mineVersion}
                            headerRowNumber={headerRowNumber}
                            selection={selection}
                            onSelectionRequest={onSelectionRequest}
                            onHoverChange={setHoveredCanvasCell}
                            fontSize={fontSize}
                            visibleColumns={sheetPresentation.visibleColumns}
                            renderColumns={virtualColumns.columnEntries}
                            columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                            baseMergedRanges={sheetPresentation.baseMergeRanges}
                            mineMergedRanges={sheetPresentation.mineMergeRanges}
                            baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                            mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                            baseCompareCellsByRowNumber={compareCellsByRowNumber.base}
                            mineCompareCellsByRowNumber={compareCellsByRowNumber.mine}
                            compareMode={compareMode}
                          />
                        </div>
                      </div>
                    ))}
                  </>
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
                    if (segment.kind === 'hidden-rows') {
                      return (
                        <div key={`hidden-rows-${segment.item.rowNumbers.join('-') || segment.top}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
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
                            selection={selection}
                            onSelectionRequest={onSelectionRequest}
                            onHoverChange={setHoveredCanvasCell}
                            fontSize={fontSize}
                            visibleColumns={sheetPresentation.visibleColumns}
                            renderColumns={virtualColumns.columnEntries}
                            columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                            baseMergedRanges={sheetPresentation.baseMergeRanges}
                            mineMergedRanges={sheetPresentation.mineMergeRanges}
                            baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                            mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                            baseCompareCellsByRowNumber={compareCellsByRowNumber.base}
                            mineCompareCellsByRowNumber={compareCellsByRowNumber.mine}
                            compareMode={compareMode}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <WorkbookActiveRegionOverlayLayer
                scrollRef={scrollRef as RefObject<HTMLDivElement>}
                viewportWidth={virtualColumns.debug.viewportWidth}
                stickyHeaderHeight={stickyHeaderHeight}
                activeDiffRegion={activeDiffRegion}
                activeSheetName={activeWorkbookSection?.name ?? null}
                visibleRowFrames={activeRegionOverlayVisibleRowFrames}
                columnLayoutByColumn={virtualColumns.columnLayoutByColumn}
                contentLeft={LN_W + 3}
                frozenWidth={virtualColumns.frozenWidth}
                freezeColumnCount={freezeColumnCount}
                resolvePatchBoundsModes={() => (
                  mode === 'stacked'
                    ? ['single']
                    : ['paired-shared']
                )}
                fallbackBoundsModes={mode === 'stacked'
                  ? ['single']
                  : ['paired-shared']}
                pulseNonce={guidedPulseNonce}
                label={formatWorkbookDiffRegionSummary(activeDiffRegion)}
              />
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

export default WorkbookComparePanel;
