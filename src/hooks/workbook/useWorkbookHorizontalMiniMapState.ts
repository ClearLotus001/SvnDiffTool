import { useMemo } from 'react';

import type { WorkbookCompareMode, SplitRow } from '@/types';
import type { WorkbookMiniMapSegment } from '@/components/workbook/WorkbookMiniMap';
import {
  applyWorkbookMiniMapSearchState,
  buildWorkbookMiniMapBaseCacheKey,
  getWorkbookMiniMapDescriptor,
  resolveWorkbookMiniMapBaseState,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookHorizontalRenderItem } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

interface UseWorkbookHorizontalMiniMapStateParams {
  activeSearchLineIdx: number;
  compareMode: WorkbookCompareMode;
  frozenRows: SplitRow[];
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsViewportHeight: number;
  items: WorkbookHorizontalRenderItem[];
  searchMatchSet: ReadonlySet<number>;
  visibleColumns: number[];
}

export function useWorkbookHorizontalMiniMapState({
  activeSearchLineIdx,
  compareMode,
  frozenRows,
  frozenRowsViewportIsOverflowing,
  frozenRowsViewportHeight,
  items,
  searchMatchSet,
  visibleColumns,
}: UseWorkbookHorizontalMiniMapStateParams): { value: WorkbookMiniMapSegment[]; duration: number } {
  const baseCacheKey = useMemo(() => buildWorkbookMiniMapBaseCacheKey({
    scope: 'horizontal-minimap-base:v1',
    headerHeight: ROW_H,
    compareMode,
    visibleColumns,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
  }), [
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    visibleColumns,
  ]);

  const baseMeasured = useMemo(() => resolveWorkbookMiniMapBaseState({
    cacheOwner: items,
    cacheKey: baseCacheKey,
    headerHeight: ROW_H,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
    items,
    visibleColumns,
    resolveRowHeight: () => ROW_H,
    resolveItemEntry: (item) => {
      if (item.kind === 'split-collapse') {
        const lineIdxs = [];
        for (let lineIdx = item.fromIdx; lineIdx <= item.toIdx; lineIdx += 1) lineIdxs.push(lineIdx);
        return {
          tone: 'equal',
          height: ROW_H,
          lineIdxs,
        };
      }

      if (item.kind === 'hidden-rows') {
        return {
          tone: 'equal',
          height: ROW_H,
          lineIdxs: item.rows.flatMap((row) => row.lineIdxs),
        };
      }

      const descriptor = getWorkbookMiniMapDescriptor(item.row, visibleColumns, compareMode);
      return {
        tone: descriptor.tone,
        tones: descriptor.tones,
        height: ROW_H,
        lineIdxs: item.row.lineIdxs,
      };
    },
  }), [
    baseCacheKey,
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    items,
    visibleColumns,
  ]);

  return useMemo(() => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      value: applyWorkbookMiniMapSearchState(baseMeasured.value, searchMatchSet, activeSearchLineIdx),
      duration: baseMeasured.duration + ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start),
    };
  }, [activeSearchLineIdx, baseMeasured.duration, baseMeasured.value, searchMatchSet]);
}
