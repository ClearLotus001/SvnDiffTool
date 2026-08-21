import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import {
  getStackedWorkbookRowRenderHeight,
} from '@/utils/workbook/workbookRowBehavior';
import {
  applyWorkbookMiniMapSearchState,
  buildWorkbookMiniMapBaseCacheKey,
  getWorkbookMiniMapDescriptor,
  resolveWorkbookMiniMapBaseState,
} from '@/utils/workbook/workbookPanelHelpers';
import type {
  CompareMode,
  WorkbookCompareRenderItem,
} from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { SplitRow, WorkbookCompareMode } from '@/types';
import type { WorkbookMiniMapSegment } from '@/components/workbook/WorkbookMiniMap';

interface UseWorkbookCompareMiniMapStateParams {
  activeSearchLineIdx: number;
  compareMode: WorkbookCompareMode;
  frozenRows: SplitRow[];
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsViewportHeight: number;
  itemHeights: number[];
  items: WorkbookCompareRenderItem[];
  mode: CompareMode;
  rowHeight: number;
  searchMatchSet: ReadonlySet<number>;
  visibleColumns: number[];
  showColumnHeader: boolean;
}

export function useWorkbookCompareMiniMapState({
  activeSearchLineIdx,
  compareMode,
  frozenRows,
  frozenRowsViewportIsOverflowing,
  frozenRowsViewportHeight,
  itemHeights,
  items,
  mode,
  rowHeight,
  searchMatchSet,
  visibleColumns,
  showColumnHeader,
}: UseWorkbookCompareMiniMapStateParams): { value: WorkbookMiniMapSegment[]; duration: number } {
  const baseCacheKey = useMemo(() => buildWorkbookMiniMapBaseCacheKey({
    scope: 'compare-minimap-base:v1',
    headerHeight: showColumnHeader ? ROW_H : 0,
    compareMode,
    visibleColumns,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
    mode,
    rowHeight,
  }), [
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    mode,
    rowHeight,
    showColumnHeader,
    visibleColumns,
  ]);

  const baseMeasured = useMemo(() => resolveWorkbookMiniMapBaseState({
    cacheOwner: itemHeights,
    cacheKey: baseCacheKey,
    headerHeight: showColumnHeader ? ROW_H : 0,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
    items,
    visibleColumns,
    resolveRowHeight: (row) => (
      mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight
    ),
    resolveItemEntry: (item, index) => {
      if (item.kind === 'collapse') {
        const lineIdxs = [];
        for (let lineIdx = item.fromIdx; lineIdx <= item.toIdx; lineIdx += 1) lineIdxs.push(lineIdx);
        return {
          tone: 'equal',
          height: itemHeights[index] ?? rowHeight,
          lineIdxs,
        };
      }

      if (item.kind === 'hidden-rows') {
        return {
          tone: 'equal',
          height: itemHeights[index] ?? rowHeight,
          lineIdxs: item.rows.flatMap((row) => row.lineIdxs),
        };
      }

      const descriptor = getWorkbookMiniMapDescriptor(item.row, visibleColumns, compareMode);
      return {
        tone: descriptor.tone,
        tones: descriptor.tones,
        height: mode === 'stacked'
          ? getStackedWorkbookRowRenderHeight(item.row, rowHeight, ROW_H)
          : rowHeight,
        lineIdxs: item.row.lineIdxs,
      };
    },
  }), [
    baseCacheKey,
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    itemHeights,
    items,
    mode,
    rowHeight,
    visibleColumns,
    showColumnHeader,
  ]);

  return useMemo(() => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      value: applyWorkbookMiniMapSearchState(baseMeasured.value, searchMatchSet, activeSearchLineIdx),
      duration: baseMeasured.duration + ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start),
    };
  }, [activeSearchLineIdx, baseMeasured.duration, baseMeasured.value, searchMatchSet]);
}
