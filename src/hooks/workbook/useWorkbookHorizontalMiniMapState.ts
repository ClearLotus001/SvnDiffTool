import { useMemo } from 'react';

import type { WorkbookCompareMode, SplitRow } from '@/types';
import type { WorkbookMiniMapSegment } from '@/components/workbook/WorkbookMiniMap';
import {
  buildWorkbookMiniMapState,
  getWorkbookMiniMapDescriptor,
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
  return useMemo(() => buildWorkbookMiniMapState({
    headerHeight: ROW_H,
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing,
    frozenRowsViewportHeight,
    items,
    searchMatchSet,
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

      if (item.kind === 'sparse-gap') {
        return {
          tone: 'equal',
          height: item.count * ROW_H,
          lineIdxs: [],
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
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    items,
    searchMatchSet,
    visibleColumns,
  ]);
}
