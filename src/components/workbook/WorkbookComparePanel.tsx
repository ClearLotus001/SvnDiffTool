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
import { useTheme } from '@/context/theme';
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
import { workbookDiffRegionContainsSelection } from '@/utils/workbook/workbookDiffRegion';
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
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
  moveWorkbookSelection,
  type WorkbookRowEntry,
} from '@/utils/workbook/workbookNavigation';
import type { IndexedWorkbookSectionRows } from '@/utils/workbook/workbookSheetIndex';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import {
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
  getWorkbookSelectionSpanForSelection,
} from '@/utils/workbook/workbookMergeLayout';
import {
  buildWorkbookRegionOverlayBoxes,
  buildWorkbookRegionOverlayBoxesFromGeometry,
} from '@/utils/workbook/workbookRegionOverlay';
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
  getStackedWorkbookRowRenderHeight,
  getWorkbookCompactRenderMode,
} from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedVisualGroups,
} from '@/utils/workbook/workbookStackedMergeGroups';
import {
  buildWorkbookCompareLayoutSnapshot,
  shouldRestoreWorkbookLayoutSnapshot,
} from '@/utils/workbook/workbookLayoutSnapshot';
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
  type WorkbookMiniMapTone,
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
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
  type WorkbookDiffRegionOverlayBox,
} from '@/components/workbook/WorkbookDiffRegionOverlay';
import WorkbookHiddenRowsBar from '@/components/workbook/WorkbookHiddenRowsBar';

const CONTEXT_LINES = 3;

type CompareMode = 'stacked' | 'columns';
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
  const T = useTheme();
  const { t } = useI18n();
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
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const visibleRowsCacheRef = useRef(new Map<string, SplitRow[]>());
  const collapsedItemsCacheRef = useRef(new WeakMap<CollapseExpansionState, Map<string, { value: Array<Extract<WorkbookCompareRenderItem, { kind: 'row' | 'collapse' }>>; duration: number }>>());
  const userScrollPauseUntilRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const lastAutoRowKeyRef = useRef('');
  const lastAutoCellKeyRef = useRef('');
  const lastGuidedNavigationKeyRef = useRef('');
  const lastForcedRevealHunkIdxRef = useRef(-1);
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
  }, [diffLines, baseWorkbookMetadata, mineWorkbookMetadata]);

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
    const value = overlayHiddenWorkbookRowsOnItems<WorkbookCompareRenderItem, SplitRow>(
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

      const renderMode = getWorkbookCompactRenderMode(item.row);
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
  const constantVirtual = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
    rowHeight,
    { overscanMin: 12, overscanFactor: 1.5 },
  );
  const stackedVariableVirtual = useVariableVirtual(
    stackedVirtualHeights,
    scrollRef as RefObject<HTMLDivElement>,
    { overscanMin: 12, overscanFactor: 1.5 },
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
    const exactIndex = mode === 'stacked'
      ? stackedVirtualItems.findIndex((item) => item.kind === 'rows' && item.rows.some((row) => compareRowHasLineIdx(row.row, lineIdx)))
      : items.findIndex((item) => item.kind === 'row' && compareRowHasLineIdx(item.row, lineIdx));
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
      markProgrammaticScroll(420);
      scrollToIndex(nearestIndex, align, behavior);
      return true;
    }
    return false;
  }, [items, markProgrammaticScroll, mode, revealLineIfCollapsed, scrollToIndex, stackedVirtualItems]);

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
  });
  const focusWorkbookCell = useCallback((
    cell: WorkbookSelectedCell,
    strategy: 'focus' | 'ensure-visible' = 'ensure-visible',
  ) => {
    if (cell.kind === 'row') return;
    const container = scrollRef.current;
    if (!container) return;

    const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
    const mergedRanges = cell.side === 'base'
      ? sheetPresentation.baseMergeRanges
      : sheetPresentation.mineMergeRanges;
    const span = getWorkbookSelectionSpanForSelection(cell, mergedRanges);
    const targetColumn = virtualColumns.columnLayoutByColumn.get(span.startCol);
    const endColumn = virtualColumns.columnLayoutByColumn.get(span.endCol);
    if (!targetColumn || !endColumn) return;

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
      return;
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
  }, [
    markProgrammaticScroll,
    mode,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
  ]);
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
  const compareCellsByRowNumber = useMemo(() => {
    const next = {
      base: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
      mine: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
    };

    sectionRows.forEach((row) => {
      const rowDelta = buildWorkbookSplitRowCompareState(
        row,
        sheetPresentation.visibleColumns,
        compareMode,
      );
      const baseRowNumber = getWorkbookSideRowNumber(row, 'base');
      if (baseRowNumber != null) next.base.set(baseRowNumber, rowDelta.cellDeltas);

      const mineRowNumber = getWorkbookSideRowNumber(row, 'mine');
      if (mineRowNumber != null) next.mine.set(mineRowNumber, rowDelta.cellDeltas);
    });

    return next;
  }, [compareMode, sectionRows, sheetPresentation.visibleColumns]);
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
      renderMode: getWorkbookCompactRenderMode(row),
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
      renderMode: getWorkbookCompactRenderMode(row),
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
      const renderMode = getWorkbookCompactRenderMode(item.row);
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

    const contentLeft = LN_W + 3;
    const boxes = activeDiffRegion.patches.flatMap((patch, patchIndex) => {
      const visibleRows = Array.from(visibleRowFrames.entries())
        .filter(([rowIndex]) => rowIndex >= patch.startRowIndex && rowIndex <= patch.endRowIndex)
        .sort((left, right) => left[0] - right[0]);
      if (visibleRows.length === 0) return [];

      const firstVisibleRowIndex = visibleRows[0]?.[0] ?? patch.startRowIndex;
      const lastVisibleRowIndex = visibleRows[visibleRows.length - 1]?.[0] ?? patch.endRowIndex;
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

      return geometries.flatMap(({ geometry, sideKey }) => buildWorkbookRegionOverlayBoxesFromGeometry({
        geometry,
        keyPrefix: `${activeDiffRegion.id}:${patchIndex}:${sideKey}`,
        top,
        bottom,
        openTop: firstVisibleRowIndex > patch.startRowIndex,
        openBottom: lastVisibleRowIndex < patch.endRowIndex,
      }));
    });

    const mergedBoxes = mergeWorkbookDiffRegionOverlayBoxes(boxes)
      .filter((box) => box.width > 6 && box.height > 6);
    if (mergedBoxes.length > 0) return mergedBoxes;

    const fallbackBoxes = buildWorkbookRegionOverlayBoxes({
      region: activeDiffRegion,
      visibleRowFrames,
      boundsModes: mode === 'stacked'
        ? ['single']
        : [
            ...(activeDiffRegion.hasBaseSide ? ['paired-base' as const] : []),
            ...(activeDiffRegion.hasMineSide ? ['paired-mine' as const] : []),
          ],
      columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
      contentLeft,
      scrollLeft,
      frozenWidth: virtualColumns.frozenWidth,
      freezeColumnCount,
      key: `${activeDiffRegion.id}:fallback`,
    });

    const mergedFallbackBoxes = mergeWorkbookDiffRegionOverlayBoxes(fallbackBoxes)
      .filter((box) => box.width > 6 && box.height > 6);
    return mergedFallbackBoxes.length > 0 ? mergedFallbackBoxes : [];
  }, [
    activeDiffRegion,
    activeWorkbookSection?.name,
    bodySegments,
    columnsBodySegments,
    freezeColumnCount,
    frozenRows,
    mode,
    rowHeight,
    rowWindowOffsetTop,
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
    if (!active) return;
    if (!activeDiffRegion || !navigationTargetCell || !activeWorkbookSection) return;
    if (activeDiffRegion.sheetName !== activeWorkbookSection.name) return;
    if (navigationTargetCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell && workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;

    const navigationKey = `${activeHunkIdx}:${activeDiffRegion.id}:${buildSelectionAutoScrollKey(activeWorkbookSection.name, navigationTargetCell)}`;
    if (lastGuidedNavigationKeyRef.current === navigationKey) return;

    lastGuidedNavigationKeyRef.current = navigationKey;
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    const targetRowIndex = navigationTargetCell.kind !== 'column'
      ? (rowItemIndexBySide[navigationTargetCell.side].get(navigationTargetCell.rowNumber) ?? -1)
      : -1;
    if (targetRowIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(targetRowIndex, 'start', 'auto');
    } else {
      scrollToResolvedLine(activeDiffRegion.lineStartIdx, 'start', 'auto');
    }

    if (navigationTargetCell.kind === 'row') return;
    const rafId = requestAnimationFrame(() => {
      focusWorkbookCell(navigationTargetCell, 'focus');
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeDiffRegion,
    activeHunkIdx,
    activeWorkbookSection,
    focusWorkbookCell,
    markProgrammaticScroll,
    navigationTargetCell,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    selectedCell,
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
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (idx >= 0) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll(360);
      scrollToIndex(idx, 'center', 'smart');
    }
  }, [active, activeDiffRegion, activeHunkIdx, activeWorkbookSection, isAutoScrollSuppressed, isSelectionAutoScrollLocked, isUserScrollPaused, markProgrammaticScroll, navigationTargetCell, rowItemIndexBySide, scrollToIndex, selectedCell]);

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
      <CollapseBar count={count} expandCount={expandCount} onExpand={onExpand} onExpandAll={onExpandAll} />
    </div>
  ), [pinnedCollapseWidth]);

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      {showPerfDebug && <WorkbookPerfDebugPanel stats={perfStats} />}
      {stackedVisibleMergeGroupCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: '0 10px 8px',
            padding: '8px 12px',
            borderRadius: 12,
            border: `1px solid ${T.chgTx}35`,
            background: `linear-gradient(180deg, ${T.bg0} 0%, ${T.bg1} 100%)`,
            boxShadow: `0 10px 20px -24px ${T.chgTx}55, inset 0 1px 0 ${T.bg0}`,
            flexShrink: 0,
          }}>
          <div
            style={{
              color: T.chgTx,
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
              color: T.t1,
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.45,
            }}>
            {t('workbookStackedMergeNoticeBody')}
          </div>
        </div>
      )}
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
                        key={segment.group.key}
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
                        groups={[segment.group]}
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
                      top: 0,
                      left: 0,
                      height: '100%',
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
