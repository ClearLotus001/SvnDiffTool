import { useMemo } from 'react';

import type {
  SplitRow,
  WorkbookCompareMode,
} from '@/types';
import type { WorkbookHorizontalRenderItem } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
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
  getWorkbookSplitRowNumber,
} from '@/utils/workbook/workbookNavigation';
import {
  buildCollapsedItems,
  type CollapsibleRowBlock,
} from '@/utils/collapse/collapsibleRows';
import { overlayHiddenWorkbookRowsOnItems } from '@/utils/workbook/workbookManualVisibility';
import {
  buildWorkbookProtectedLineSignature,
  getWorkbookCollapsibleSheetView,
} from '@/utils/workbook/workbookSheetViewCache';
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
import { buildWorkbookRenderModel, type WorkbookRenderModel } from '@/utils/workbook/workbookRenderModel';
import { buildWorkbookExpandedBlocksSignature } from '@/utils/workbook/workbookExpandedBlocksSignature';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { WorkbookRenderPolicy } from '@/utils/workbook/workbookVisibilityModel';

export interface WorkbookMeasuredValue<T> {
  value: T;
  duration: number;
}

export interface UseWorkbookHorizontalDerivedStateParams {
  activeWorkbookSection: WorkbookSection | undefined;
  sectionRows: SplitRow[];
  activeSheetCacheKey: string;
  collapseBlockPrefix: string;
  protectedLineIdxSet: ReadonlySet<number>;
  activeHiddenRows: number[];
  activeHiddenColumns: number[];
  stickyHeaderFreezeRowNumber: number;
  freezeRowNumber: number;
  expandedBlocks: CollapseExpansionState;
  collapseCtx: boolean;
  renderPolicy: WorkbookRenderPolicy;
  compareMode: WorkbookCompareMode;
  baseVersion: string;
  mineVersion: string;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  showHiddenColumns: boolean;
  autoCollapseUnchangedColumns?: boolean;
  revealedAutoColumns?: number[];
  protectedAutoCollapseColumns?: number[];
  protectedAutoCollapseColumnCount?: number;
}

export interface UseWorkbookHorizontalDerivedStateResult {
  hiddenRowNumberSet: Set<number>;
  rowBlocks: CollapsibleRowBlock<SplitRow>[];
  effectiveExpandedBlocks: CollapseExpansionState;
  frozenRows: SplitRow[];
  stickyHeaderRows: SplitRow[];
  paneFrozenRows: SplitRow[];
  collapsedItemsMeasured: WorkbookMeasuredValue<Array<Extract<WorkbookHorizontalRenderItem, { kind: 'split-line' | 'split-collapse' }>>>;
  renderItemsMeasured: WorkbookMeasuredValue<WorkbookHorizontalRenderItem[]>;
  itemsMeasured: WorkbookMeasuredValue<WorkbookHorizontalRenderItem[]>;
  items: WorkbookHorizontalRenderItem[];
  itemHeights: number[];
  sheetPresentation: WorkbookSheetPresentation;
  renderModel: WorkbookRenderModel;
}

const horizontalCollapsedItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<Array<Extract<WorkbookHorizontalRenderItem, { kind: 'split-line' | 'split-collapse' }>>>>
>();
const horizontalRenderedItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<WorkbookHorizontalRenderItem[]>>
>();
const horizontalVisibleItemsSharedCache = new WeakMap<
  SplitRow[],
  Map<string, WorkbookMeasuredValue<WorkbookHorizontalRenderItem[]>>
>();
const horizontalItemHeightsSharedCache = new WeakMap<SplitRow[], Map<string, number[]>>();

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function useWorkbookHorizontalDerivedState({
  activeWorkbookSection,
  sectionRows,
  activeSheetCacheKey,
  collapseBlockPrefix,
  protectedLineIdxSet,
  activeHiddenRows,
  activeHiddenColumns,
  stickyHeaderFreezeRowNumber,
  freezeRowNumber,
  expandedBlocks,
  collapseCtx,
  renderPolicy,
  compareMode,
  baseVersion,
  mineVersion,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  showHiddenColumns,
  autoCollapseUnchangedColumns = false,
  revealedAutoColumns = [],
  protectedAutoCollapseColumns = [],
  protectedAutoCollapseColumnCount = 0,
}: UseWorkbookHorizontalDerivedStateParams): UseWorkbookHorizontalDerivedStateResult {
  const showOnlyDifferences = renderPolicy.mode === 'differences-only';
  const collapsibleSheetView = useMemo(
    () => getWorkbookCollapsibleSheetView({
      sectionRows,
      sheetName: activeSheetCacheKey,
      protectedLineIdxSet,
      showOnlyDifferences,
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      equalityStrategyKey: 'split-equal-row',
      isEqualRow: isEqualWorkbookRow,
    }),
    [activeSheetCacheKey, collapseBlockPrefix, protectedLineIdxSet, sectionRows, showOnlyDifferences],
  );
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

  const frozenRows = useMemo(() => {
    if (!activeWorkbookSection || freezeRowNumber <= 0) return [];
    return sectionRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      if (rowNumber == null || rowNumber > freezeRowNumber) return false;
      if (!showOnlyDifferences || !isEqualWorkbookRow(row)) return true;
      return row.lineIdxs.some((lineIdx) => protectedLineIdxSet.has(lineIdx));
    });
  }, [activeWorkbookSection, freezeRowNumber, protectedLineIdxSet, sectionRows, showOnlyDifferences]);
  const stickyHeaderRows = useMemo(
    () => frozenRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber <= stickyHeaderFreezeRowNumber;
    }),
    [frozenRows, stickyHeaderFreezeRowNumber],
  );
  const paneFrozenRows = useMemo(
    () => frozenRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber > stickyHeaderFreezeRowNumber;
    }),
    [frozenRows, stickyHeaderFreezeRowNumber],
  );

  const collapsedItemsMeasured = useMemo(() => {
    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      horizontalCollapsedItemsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      protectedLineSignature,
      freezeRowNumber,
      collapseCtx,
      showOnlyDifferences,
      expandedBlocksSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

    const start = getNow();
    const value = buildCollapsedItems(rowBlocks, collapseCtx, effectiveExpandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      buildRowItem: (row) => ({ kind: 'split-line' as const, row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep, firstRow, lastRow }) => ({
        kind: 'split-collapse' as const,
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
    const nextValue = {
      value,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, nextValue);
    return nextValue;
  }, [
    activeSheetCacheKey,
    collapseBlockPrefix,
    collapseCtx,
    showOnlyDifferences,
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
        value: collapsedItemsMeasured.value as WorkbookHorizontalRenderItem[],
        duration: collapsedItemsMeasured.duration,
      };
    }

    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      horizontalRenderedItemsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      freezeRowNumber,
      collapseCtx,
      showOnlyDifferences,
      expandedBlocksSignature,
      hiddenRowsSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

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
    const nextValue = {
      value,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, nextValue);
    return nextValue;
  }, [
    activeSheetCacheKey,
    collapseCtx,
    showOnlyDifferences,
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
      horizontalVisibleItemsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      freezeRowNumber,
      collapseCtx,
      showOnlyDifferences,
      hiddenRowsSignature,
      expandedBlocksSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

    const start = getNow();
    const visibleItems = renderItemsMeasured.value.filter((item) => {
      if (item.kind === 'split-collapse') return true;
      if (item.kind === 'hidden-rows') {
        return item.rowNumbers.some((rowNumber) => rowNumber > freezeRowNumber);
      }
      const rowNumber = getWorkbookSplitRowNumber(item.row);
      return rowNumber == null || rowNumber > freezeRowNumber;
    });
    const nextValue = {
      value: visibleItems,
      duration: getNow() - start,
    };
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, nextValue);
    return nextValue;
  }, [
    activeSheetCacheKey,
    collapseCtx,
    showOnlyDifferences,
    expandedBlocksSignature,
    freezeRowNumber,
    hiddenRowsSignature,
    renderItemsMeasured.value,
    sectionRows,
  ]);
  const items = itemsMeasured.value;

  const itemHeights = useMemo(() => {
    const cacheBySectionRows = getWorkbookSharedCacheBucket(
      horizontalItemHeightsSharedCache,
      sectionRows,
    );
    const cacheKey = buildWorkbookCacheSignature([
      activeSheetCacheKey,
      freezeRowNumber,
      collapseCtx,
      showOnlyDifferences,
      hiddenRowsSignature,
      expandedBlocksSignature,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey);
    if (cached) return cached;

    const next = items.map(() => ROW_H);
    setWorkbookSharedCacheEntry(cacheBySectionRows, cacheKey, next);
    return next;
  }, [
    activeSheetCacheKey,
    collapseCtx,
    showOnlyDifferences,
    expandedBlocksSignature,
    freezeRowNumber,
    hiddenRowsSignature,
    items,
    sectionRows,
  ]);

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
      autoCollapseUnchangedColumns,
      revealedAutoColumns,
      protectedAutoCollapseColumns,
      protectedAutoCollapseColumnCount,
      showOnlyDifferences,
    ),
    [
      activeHiddenColumns,
      activeWorkbookSection?.maxColumns,
      activeWorkbookSection?.name,
      baseWorkbookMetadata,
      autoCollapseUnchangedColumns,
      compareMode,
      mineWorkbookMetadata,
      protectedAutoCollapseColumns,
      protectedAutoCollapseColumnCount,
      revealedAutoColumns,
      sectionRows,
      showOnlyDifferences,
      showHiddenColumns,
    ],
  );
  const activeSheetName = activeWorkbookSection?.name ?? '';
  const renderModel = useMemo(
    () => buildWorkbookRenderModel({
      sectionRows,
      sheetName: activeSheetName,
      baseVersion,
      mineVersion,
      visibleColumns: sheetPresentation.visibleColumns,
      compareMode,
      renderPolicy,
      headerRowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      items,
      renderItemIndexesCacheKey: 'horizontal:split-render-items:v1',
      getRow: (item) => (item.kind === 'split-line' ? item.row : null),
      getHiddenRows: (item) => (item.kind === 'hidden-rows' ? item.rows : null),
      getHiddenRowNumbers: (item) => (item.kind === 'hidden-rows' ? item.rowNumbers : null),
    }),
    [activeSheetName, activeWorkbookSection?.firstDataRowNumber, baseVersion, compareMode, items, mineVersion, renderPolicy, sectionRows, sheetPresentation.visibleColumns],
  );

  return {
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
    renderModel,
  };
}
