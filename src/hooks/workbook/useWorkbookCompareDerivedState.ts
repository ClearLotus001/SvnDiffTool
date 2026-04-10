import { useMemo } from 'react';
import type {
  SplitRow,
  WorkbookCompareMode,
} from '@/types';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import {
  buildWorkbookSheetPresentation,
  type WorkbookMetadataMap,
  type WorkbookSheetPresentation,
} from '@/utils/workbook/workbookMeta';
import {
  applyWorkbookFreezeToExpandedBlocks,
} from '@/utils/workbook/workbookFreeze';
import {
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
} from '@/utils/workbook/workbookNavigation';
import {
  injectWorkbookSparseGapItems,
  type WorkbookSparseGapItem,
  type WorkbookSparseRowRange,
} from '@/utils/workbook/workbookSparseGaps';
import {
  buildCollapsedItems,
  type CollapsibleRowBlock,
} from '@/utils/collapse/collapsibleRows';
import { overlayHiddenWorkbookRowsOnItems } from '@/utils/workbook/workbookManualVisibility';
import {
  getStackedWorkbookRowRenderHeight,
  getWorkbookStackedRenderMode,
} from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedVisualGroups,
} from '@/utils/workbook/workbookStackedMergeGroups';
import {
  buildWorkbookProtectedLineSignature,
  getWorkbookCollapsibleSheetView,
  isWorkbookSectionEffectivelyEqual,
} from '@/utils/workbook/workbookSheetViewCache';
import { buildWorkbookExpandedBlocksSignature } from '@/utils/workbook/workbookExpandedBlocksSignature';
import {
  buildWorkbookCacheSignature,
  getWorkbookSharedCacheBucket,
  getWorkbookSharedCacheEntry,
  setWorkbookSharedCacheEntry,
} from '@/utils/workbook/workbookSharedCache';
import {
  WORKBOOK_CONTEXT_LINES as CONTEXT_LINES,
  isEqualWorkbookRow,
} from '@/utils/workbook/workbookPanelHelpers';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import type { WorkbookCanvasRenderRow } from '@/components/workbook/WorkbookStackedCanvasStrip';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

export type WorkbookCompareRenderItem =
  | { kind: 'row'; row: SplitRow; lineIdx: number }
  | { kind: 'collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number; rowNumberStart: number | null; rowNumberEnd: number | null }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[]; count: number }
  | WorkbookSparseGapItem;

type WorkbookStackedStaticRow = Pick<WorkbookCanvasRenderRow, 'row' | 'renderMode' | 'height'>;

export type WorkbookStackedVirtualItem =
  | {
    kind: 'rows';
    rows: WorkbookStackedStaticRow[];
    height: number;
    sourceStartItemIndex: number;
    sourceEndItemIndex: number;
    groupKey: string;
    hasVerticalMerge: boolean;
    baseTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
    mineTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
  }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; height: number; sourceItemIndex: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; height: number; sourceItemIndex: number }
  | { kind: 'sparse-gap'; item: WorkbookSparseGapItem; height: number; sourceItemIndex: number };

export interface WorkbookStackedScrollTarget {
  itemIndex: number;
  rowOffsetTop: number;
  rowHeight: number;
}

export interface WorkbookMeasuredValue<T> {
  value: T;
  duration: number;
}

export interface WorkbookStackedVirtualItemsMeasured extends WorkbookMeasuredValue<WorkbookStackedVirtualItem[]> {
  cacheHit: boolean;
}

export interface WorkbookStackedIndexesMeasured {
  rowScrollTargetsBySide: {
    base: Map<number, WorkbookStackedScrollTarget>;
    mine: Map<number, WorkbookStackedScrollTarget>;
  };
  lineScrollTargets: Map<number, WorkbookStackedScrollTarget>;
  visibleRowItemIndexByLineIdx: Map<number, number>;
  rowItemIndexBySide: {
    base: Map<number, number>;
    mine: Map<number, number>;
  };
  duration: number;
  cacheHit: boolean;
}

export type WorkbookStackedFastPathMode = 'equal-plain' | null;
export type CompareMode = 'stacked' | 'columns';

const EMPTY_ROW_ITEM_INDEX_BY_SIDE = {
  base: new Map<number, number>(),
  mine: new Map<number, number>(),
};
const EMPTY_VISIBLE_ROW_ITEM_INDEX_BY_LINE_IDX = new Map<number, number>();
const EMPTY_LINE_SCROLL_TARGETS = new Map<number, WorkbookStackedScrollTarget>();
const EMPTY_ROW_SCROLL_TARGETS_BY_SIDE = {
  base: new Map<number, WorkbookStackedScrollTarget>(),
  mine: new Map<number, WorkbookStackedScrollTarget>(),
};
const EMPTY_MEASURED = {
  duration: 0,
  cacheHit: false,
};
const STACKED_EQUAL_FAST_PATH_GROUP_SIZE = 256;

const workbookComparePanelCacheObjectIds = new WeakMap<object, number>();
let nextWorkbookComparePanelCacheObjectId = 1;
const compareCollapsedItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<Array<Extract<WorkbookCompareRenderItem, { kind: 'row' | 'collapse' }>>>>
>();
const compareRenderedItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<WorkbookCompareRenderItem[]>>
>();
const compareVisibleItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<WorkbookCompareRenderItem[]>>
>();
const compareItemHeightsSharedCache = new WeakMap<SplitRow[], Map<string, number[]>>();
const compareStackedItemsSharedCache = new WeakMap<SplitRow[], Map<string, WorkbookStackedVirtualItemsMeasured>>();
const compareStackedIndexesSharedCache = new WeakMap<SplitRow[], Map<string, WorkbookStackedIndexesMeasured>>();

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getWorkbookComparePanelCacheObjectId(value: object | null | undefined): number {
  if (!value) return 0;
  const existing = workbookComparePanelCacheObjectIds.get(value);
  if (existing) return existing;
  const nextId = nextWorkbookComparePanelCacheObjectId;
  nextWorkbookComparePanelCacheObjectId += 1;
  workbookComparePanelCacheObjectIds.set(value, nextId);
  return nextId;
}

function hasVerticalWorkbookMergeRanges(
  ranges: ReadonlyArray<{ startRow: number; endRow: number }>,
): boolean {
  return ranges.some((range) => range.endRow > range.startRow);
}

function createEmptyWorkbookIndexBySide() {
  return {
    base: new Map<number, number>(),
    mine: new Map<number, number>(),
  };
}

function resolveWorkbookCompareItemRowRange(
  item: WorkbookCompareRenderItem,
): WorkbookSparseRowRange | null {
  if (item.kind === 'sparse-gap') {
    return {
      rowNumberStart: item.rowNumberStart,
      rowNumberEnd: item.rowNumberEnd,
    };
  }

  if (item.kind === 'row') {
    const rowNumber = getWorkbookSplitRowNumber(item.row);
    return rowNumber == null
      ? null
      : {
        rowNumberStart: rowNumber,
        rowNumberEnd: rowNumber,
      };
  }

  if (item.kind === 'collapse') {
    return item.rowNumberStart != null && item.rowNumberEnd != null
      ? {
        rowNumberStart: item.rowNumberStart,
        rowNumberEnd: item.rowNumberEnd,
      }
      : null;
  }

  const rowNumberStart = item.rowNumbers[0] ?? null;
  const rowNumberEnd = item.rowNumbers[item.rowNumbers.length - 1] ?? null;
  return rowNumberStart != null && rowNumberEnd != null
    ? {
      rowNumberStart,
      rowNumberEnd,
    }
    : null;
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

function buildPlainStackedTrack(
  rows: Array<{ row: WorkbookStackedStaticRow; sourceItemIndex: number }>,
  side: 'base' | 'mine',
): Array<{ sourceRowIndex: number; rowNumber: number }> {
  return rows.flatMap((item, sourceRowIndex) => {
    const rowNumber = getWorkbookSideRowNumber(item.row.row, side);
    return rowNumber == null
      ? []
      : [{
        sourceRowIndex,
        rowNumber,
      }];
  });
}

function buildEqualPlainStackedVirtualItems(
  rows: Array<{ row: WorkbookStackedStaticRow; sourceItemIndex: number }>,
): WorkbookStackedVirtualItem[] {
  const next: WorkbookStackedVirtualItem[] = [];

  for (
    let chunkStart = 0;
    chunkStart < rows.length;
    chunkStart += STACKED_EQUAL_FAST_PATH_GROUP_SIZE
  ) {
    const chunkEnd = Math.min(rows.length, chunkStart + STACKED_EQUAL_FAST_PATH_GROUP_SIZE) - 1;
    const chunkRows = rows.slice(chunkStart, chunkEnd + 1);
    next.push({
      kind: 'rows',
      rows: chunkRows.map((item) => item.row),
      height: chunkRows.reduce((sum, item) => sum + item.row.height, 0),
      sourceStartItemIndex: chunkRows[0]!.sourceItemIndex,
      sourceEndItemIndex: chunkRows[chunkRows.length - 1]!.sourceItemIndex,
      groupKey: `stacked-group:equal-plain:${chunkRows[0]!.sourceItemIndex}:${chunkRows[chunkRows.length - 1]!.sourceItemIndex}`,
      hasVerticalMerge: false,
      baseTrack: buildPlainStackedTrack(chunkRows, 'base'),
      mineTrack: buildPlainStackedTrack(chunkRows, 'mine'),
    });
  }

  return next;
}

export interface UseWorkbookCompareDerivedStateParams {
  activeWorkbookSection: WorkbookSection | undefined;
  sectionRows: SplitRow[];
  activeSheetCacheKey: string;
  collapseBlockPrefix: string;
  protectedLineIdxSet: ReadonlySet<number>;
  activeHiddenRows: number[];
  activeHiddenColumns: number[];
  freezeRowNumber: number;
  expandedBlocks: CollapseExpansionState;
  collapseCtx: boolean;
  mode: CompareMode;
  compareMode: WorkbookCompareMode;
  baseVersion: string;
  mineVersion: string;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  showHiddenColumns: boolean;
}

export interface UseWorkbookCompareDerivedStateResult {
  frozenRows: SplitRow[];
  collapseSourceRows: SplitRow[];
  rowBlocks: CollapsibleRowBlock<SplitRow>[];
  hiddenRowNumberSet: Set<number>;
  effectiveExpandedBlocks: CollapseExpansionState;
  collapsedItemsMeasured: WorkbookMeasuredValue<Array<Extract<WorkbookCompareRenderItem, { kind: 'row' | 'collapse' }>>>;
  renderItemsMeasured: WorkbookMeasuredValue<WorkbookCompareRenderItem[]>;
  itemsMeasured: WorkbookMeasuredValue<WorkbookCompareRenderItem[]>;
  items: WorkbookCompareRenderItem[];
  rowHeight: number;
  itemHeights: number[];
  sheetPresentation: WorkbookSheetPresentation;
  stackedFastPathMode: WorkbookStackedFastPathMode;
  stackedVirtualItemsMeasured: WorkbookStackedVirtualItemsMeasured;
  stackedVirtualItems: WorkbookStackedVirtualItem[];
  stackedVirtualHeights: number[];
  stackedVirtualOffsets: number[];
  stackedIndexesMeasured: WorkbookStackedIndexesMeasured;
}

export function useWorkbookCompareDerivedState({
  activeWorkbookSection,
  sectionRows,
  activeSheetCacheKey,
  collapseBlockPrefix,
  protectedLineIdxSet,
  activeHiddenRows,
  activeHiddenColumns,
  freezeRowNumber,
  expandedBlocks,
  collapseCtx,
  mode,
  compareMode,
  baseVersion,
  mineVersion,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  showHiddenColumns,
}: UseWorkbookCompareDerivedStateParams): UseWorkbookCompareDerivedStateResult {
  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber <= freezeRowNumber;
    });
  }, [activeWorkbookSection, freezeRowNumber, sectionRows]);

  const collapsibleSheetView = useMemo(
    () => getWorkbookCollapsibleSheetView({
      sectionRows,
      sheetName: activeSheetCacheKey,
      protectedLineIdxSet,
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      equalityStrategyKey: 'compare-equal-row',
      isEqualRow: isEqualWorkbookRow,
    }),
    [activeSheetCacheKey, collapseBlockPrefix, protectedLineIdxSet, sectionRows],
  );
  const collapseSourceRows = collapsibleSheetView.visibleRows;
  const protectedLineSignature = useMemo(
    () => buildWorkbookProtectedLineSignature(protectedLineIdxSet),
    [protectedLineIdxSet],
  );
  const hiddenRowNumberSet = useMemo(
    () => new Set(activeHiddenRows),
    [activeHiddenRows],
  );
  const hiddenRowsSignature = useMemo(
    () => activeHiddenRows.join(','),
    [activeHiddenRows],
  );
  const rowBlocks = collapsibleSheetView.rowBlocks;
  const effectiveExpandedBlocks = useMemo(
    () => applyWorkbookFreezeToExpandedBlocks(
      expandedBlocks,
      collapsibleSheetView.collapsedRowDescriptors,
      freezeRowNumber,
      getWorkbookSplitRowNumber,
    ),
    [collapsibleSheetView.collapsedRowDescriptors, expandedBlocks, freezeRowNumber],
  );
  const expandedBlocksSignature = useMemo(
    () => buildWorkbookExpandedBlocksSignature(effectiveExpandedBlocks),
    [effectiveExpandedBlocks],
  );

  const collapsedItemsMeasured = useMemo(() => {
    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      compareCollapsedItemsSharedCache,
      sectionRows,
    );
    const itemsCacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      protectedLineSignature,
      freezeRowNumber,
      collapseCtx,
      expandedBlocksSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, itemsCacheKey);
    if (cached) return cached;

    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, effectiveExpandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      buildRowItem: (row) => ({ kind: 'row' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep, firstRow, lastRow }) => ({
        kind: 'collapse' as const,
        blockId,
        count,
        fromIdx,
        toIdx,
        hiddenStart,
        hiddenEnd,
        expandStep,
        rowNumberStart: getWorkbookSplitRowNumber(firstRow),
        rowNumberEnd: getWorkbookSplitRowNumber(lastRow),
      }),
    });
    const nextResult = {
      value,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, itemsCacheKey, nextResult);
    return nextResult;
  }, [
    activeSheetCacheKey,
    collapseBlockPrefix,
    collapseCtx,
    effectiveExpandedBlocks,
    expandedBlocksSignature,
    freezeRowNumber,
    protectedLineSignature,
    rowBlocks,
    sectionRows,
  ]);

  const renderItemsMeasured = useMemo(() => {
    if (hiddenRowNumberSet.size === 0) {
      return {
        value: collapsedItemsMeasured.value as WorkbookCompareRenderItem[],
        duration: collapsedItemsMeasured.duration,
      };
    }

    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      compareRenderedItemsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      freezeRowNumber,
      collapseCtx,
      expandedBlocksSignature,
      hiddenRowsSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

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
    const nextResult = {
      value,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, nextResult);
    return nextResult;
  }, [
    activeSheetCacheKey,
    collapseCtx,
    collapsedItemsMeasured.duration,
    collapsedItemsMeasured.value,
    expandedBlocksSignature,
    freezeRowNumber,
    hiddenRowNumberSet,
    hiddenRowsSignature,
    sectionRows,
  ]);

  const itemsMeasured = useMemo(() => {
    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      compareVisibleItemsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      freezeRowNumber,
      collapseCtx,
      hiddenRowsSignature,
      expandedBlocksSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

    const start = getNow();
    const visibleItems = renderItemsMeasured.value.filter((item) => {
      if (item.kind === 'collapse') return true;
      if (item.kind === 'hidden-rows') {
        return item.rowNumbers.some((rowNumber) => rowNumber > freezeRowNumber);
      }
      if (item.kind === 'sparse-gap') {
        return item.rowNumberEnd > freezeRowNumber;
      }
      const rowNumber = getWorkbookSplitRowNumber(item.row);
      return rowNumber == null || rowNumber > freezeRowNumber;
    });
    const value = injectWorkbookSparseGapItems(visibleItems, {
      firstExpectedRowNumber: freezeRowNumber + 1,
      ...(activeWorkbookSection?.rowCount != null
        ? { lastExpectedRowNumber: activeWorkbookSection.rowCount }
        : {}),
      resolveRowRange: resolveWorkbookCompareItemRowRange,
    });
    const nextResult = {
      value,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, nextResult);
    return nextResult;
  }, [
    activeSheetCacheKey,
    collapseCtx,
    expandedBlocksSignature,
    freezeRowNumber,
    activeWorkbookSection?.rowCount,
    hiddenRowsSignature,
    renderItemsMeasured.value,
    sectionRows,
  ]);
  const items = itemsMeasured.value;

  const rowHeight = mode === 'stacked' ? (ROW_H * 2) : ROW_H;
  const itemHeights = useMemo(
    () => {
      const cacheBySectionRows = getWorkbookSharedCacheBucket(
        compareItemHeightsSharedCache,
        sectionRows,
      );
      const cacheKey = buildWorkbookCacheSignature([
        activeSheetCacheKey,
        freezeRowNumber,
        collapseCtx,
        hiddenRowsSignature,
        expandedBlocksSignature,
        mode,
        rowHeight,
      ]);
      const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
      if (cached) return cached;

      const next = items.map((item) => {
        if (item.kind === 'sparse-gap') return item.count * ROW_H;
        if (item.kind === 'collapse' || item.kind === 'hidden-rows') return ROW_H;
        return mode === 'stacked'
          ? getStackedWorkbookRowRenderHeight(item.row, rowHeight, ROW_H)
          : rowHeight;
      });
      setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, next);
      return next;
    },
    [
      activeSheetCacheKey,
      collapseCtx,
      expandedBlocksSignature,
      freezeRowNumber,
      hiddenRowsSignature,
      items,
      mode,
      rowHeight,
      sectionRows,
    ],
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
      activeHiddenColumns,
    ),
    [
      activeHiddenColumns,
      activeWorkbookSection?.maxColumns,
      activeWorkbookSection?.name,
      baseWorkbookMetadata,
      compareMode,
      mineWorkbookMetadata,
      sectionRows,
      showHiddenColumns,
    ],
  );
  const visibleColumnsSignature = useMemo(
    () => sheetPresentation.visibleColumns.join(','),
    [sheetPresentation.visibleColumns],
  );
  const baseMergeRangesCacheId = useMemo(
    () => getWorkbookComparePanelCacheObjectId(sheetPresentation.baseMergeRanges),
    [sheetPresentation.baseMergeRanges],
  );
  const mineMergeRangesCacheId = useMemo(
    () => getWorkbookComparePanelCacheObjectId(sheetPresentation.mineMergeRanges),
    [sheetPresentation.mineMergeRanges],
  );
  const hasVerticalBaseMergeRanges = useMemo(
    () => hasVerticalWorkbookMergeRanges(sheetPresentation.baseMergeRanges),
    [sheetPresentation.baseMergeRanges],
  );
  const hasVerticalMineMergeRanges = useMemo(
    () => hasVerticalWorkbookMergeRanges(sheetPresentation.mineMergeRanges),
    [sheetPresentation.mineMergeRanges],
  );
  const stackedFastPathMode = useMemo<WorkbookStackedFastPathMode>(
    () => (
      mode === 'stacked'
      && isWorkbookSectionEffectivelyEqual(collapseSourceRows)
      && !hasVerticalBaseMergeRanges
      && !hasVerticalMineMergeRanges
        ? 'equal-plain'
        : null
    ),
    [
      collapseSourceRows,
      hasVerticalBaseMergeRanges,
      hasVerticalMineMergeRanges,
      mode,
    ],
  );
  const stackedSharedCacheKey = useMemo(
    () => buildWorkbookCacheSignature([
      activeWorkbookSection?.name ?? '',
      freezeRowNumber,
      collapseCtx,
      hiddenRowsSignature,
      expandedBlocksSignature,
      baseVersion,
      mineVersion,
      rowHeight,
      visibleColumnsSignature,
      baseMergeRangesCacheId,
      mineMergeRangesCacheId,
      stackedFastPathMode ?? 'default',
    ]),
    [
      activeWorkbookSection?.name,
      baseMergeRangesCacheId,
      baseVersion,
      collapseCtx,
      expandedBlocksSignature,
      freezeRowNumber,
      hiddenRowsSignature,
      mineMergeRangesCacheId,
      mineVersion,
      rowHeight,
      stackedFastPathMode,
      visibleColumnsSignature,
    ],
  );

  const stackedVirtualItemsMeasured = useMemo<WorkbookStackedVirtualItemsMeasured>(() => {
    if (mode !== 'stacked') {
      return {
        value: [],
        ...EMPTY_MEASURED,
      };
    }

    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      compareStackedItemsSharedCache,
      sectionRows,
    );
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, stackedSharedCacheKey);
    if (cached) {
      return {
        ...cached,
        cacheHit: true,
      };
    }

    const start = getNow();
    const next: WorkbookStackedVirtualItem[] = [];
    const currentRows: Array<{ row: WorkbookStackedStaticRow; sourceItemIndex: number }> = [];

    const flushRows = () => {
      if (currentRows.length === 0) return;

      if (stackedFastPathMode === 'equal-plain') {
        next.push(...buildEqualPlainStackedVirtualItems(currentRows));
        currentRows.length = 0;
        return;
      }

      const layoutRows = buildWorkbookStackedLayoutRows({
        rows: currentRows.map((item) => ({
          row: item.row.row,
          renderMode: item.row.renderMode,
          height: item.row.height,
        })),
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
            rowNumber: track.rowNumber,
          })),
          mineTrack: group.mineTrack.map((track) => ({
            sourceRowIndex: track.sourceRowIndex,
            rowNumber: track.rowNumber,
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

      if (item.kind === 'sparse-gap') {
        flushRows();
        next.push({
          kind: 'sparse-gap',
          item,
          height: itemHeights[index] ?? (item.count * ROW_H),
          sourceItemIndex: index,
        });
        return;
      }

      currentRows.push({
        sourceItemIndex: index,
        row: {
          row: item.row,
          renderMode: getWorkbookStackedRenderMode(item.row),
          height: itemHeights[index] ?? rowHeight,
        },
      });
    });

    flushRows();
    const measured = {
      value: next,
      duration: getNow() - start,
      cacheHit: false,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, stackedSharedCacheKey, measured);
    return measured;
  }, [
    itemHeights,
    items,
    mode,
    rowHeight,
    sectionRows,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    stackedSharedCacheKey,
    stackedFastPathMode,
  ]);
  const stackedVirtualItems = stackedVirtualItemsMeasured.value;
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

  const stackedIndexesMeasured = useMemo<WorkbookStackedIndexesMeasured>(() => {
    if (stackedVirtualItems.length === 0) {
      return {
        rowScrollTargetsBySide: EMPTY_ROW_SCROLL_TARGETS_BY_SIDE,
        lineScrollTargets: EMPTY_LINE_SCROLL_TARGETS,
        visibleRowItemIndexByLineIdx: EMPTY_VISIBLE_ROW_ITEM_INDEX_BY_LINE_IDX,
        rowItemIndexBySide: EMPTY_ROW_ITEM_INDEX_BY_SIDE,
        ...EMPTY_MEASURED,
      };
    }

    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      compareStackedIndexesSharedCache,
      sectionRows,
    );
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, stackedSharedCacheKey);
    if (cached) {
      return {
        ...cached,
        cacheHit: true,
      };
    }

    const start = getNow();
    const rowScrollTargetsBySide = {
      base: new Map<number, WorkbookStackedScrollTarget>(),
      mine: new Map<number, WorkbookStackedScrollTarget>(),
    };
    const lineScrollTargets = new Map<number, WorkbookStackedScrollTarget>();
    const visibleRowItemIndexByLineIdx = new Map<number, number>();
    const rowItemIndexBySide = createEmptyWorkbookIndexBySide();

    stackedVirtualItems.forEach((item, itemIndex) => {
      if (item.kind !== 'rows') return;
      let rowOffsetTop = 0;
      item.rows.forEach((renderRow) => {
        const baseRowNumber = getWorkbookSideRowNumber(renderRow.row, 'base');
        const mineRowNumber = getWorkbookSideRowNumber(renderRow.row, 'mine');
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
        if (baseRowNumber != null && !rowScrollTargetsBySide.base.has(baseRowNumber)) {
          rowScrollTargetsBySide.base.set(baseRowNumber, baseTarget);
          rowItemIndexBySide.base.set(baseRowNumber, itemIndex);
        }
        if (mineRowNumber != null && !rowScrollTargetsBySide.mine.has(mineRowNumber)) {
          rowScrollTargetsBySide.mine.set(mineRowNumber, mineTarget);
          rowItemIndexBySide.mine.set(mineRowNumber, itemIndex);
        }

        const leftLineIdx = renderRow.row.lineIdxs[0];
        const rightLineIdx = renderRow.row.lineIdxs.length > 1
          ? renderRow.row.lineIdxs[1]
          : undefined;
        const hasBaseRow = baseRowNumber != null;
        const hasMineRow = mineRowNumber != null;

        if (leftLineIdx != null) {
          if (!visibleRowItemIndexByLineIdx.has(leftLineIdx)) {
            visibleRowItemIndexByLineIdx.set(leftLineIdx, itemIndex);
          }
          lineScrollTargets.set(leftLineIdx, hasBaseRow ? baseTarget : mineTarget);
        }
        if (rightLineIdx != null) {
          if (!visibleRowItemIndexByLineIdx.has(rightLineIdx)) {
            visibleRowItemIndexByLineIdx.set(rightLineIdx, itemIndex);
          }
          lineScrollTargets.set(rightLineIdx, hasMineRow ? mineTarget : baseTarget);
        }
        if (rightLineIdx == null && leftLineIdx != null) {
          lineScrollTargets.set(leftLineIdx, hasMineRow && !hasBaseRow ? mineTarget : baseTarget);
        }

        rowOffsetTop += renderRow.height;
      });
    });

    const measured = {
      rowScrollTargetsBySide,
      lineScrollTargets,
      visibleRowItemIndexByLineIdx,
      rowItemIndexBySide,
      duration: getNow() - start,
      cacheHit: false,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, stackedSharedCacheKey, measured);
    return measured;
  }, [
    sectionRows,
    stackedSharedCacheKey,
    stackedVirtualItems,
  ]);

  return {
    frozenRows,
    collapseSourceRows,
    rowBlocks,
    hiddenRowNumberSet,
    effectiveExpandedBlocks,
    collapsedItemsMeasured,
    renderItemsMeasured,
    itemsMeasured,
    items,
    rowHeight,
    itemHeights,
    sheetPresentation,
    stackedFastPathMode,
    stackedVirtualItemsMeasured,
    stackedVirtualItems,
    stackedVirtualHeights,
    stackedVirtualOffsets,
    stackedIndexesMeasured,
  };
}
