import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import {
  getStackedWorkbookRowRenderHeight,
} from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookMiniMapState,
  getWorkbookMiniMapDescriptor,
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
  return useMemo(() => buildWorkbookMiniMapState({
    headerHeight: showColumnHeader ? ROW_H : 0,
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
    items,
    searchMatchSet,
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

      if (item.kind === 'sparse-gap') {
        return {
          tone: 'equal',
          height: itemHeights[index] ?? (item.count * ROW_H),
          lineIdxs: [],
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
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    itemHeights,
    items,
    mode,
    rowHeight,
    searchMatchSet,
    showColumnHeader,
    visibleColumns,
  ]);
}
