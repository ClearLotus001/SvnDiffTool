import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { getWorkbookRowKey as getWorkbookHorizontalRowKey } from '@/utils/workbook/workbookPanelHelpers';
import type { SplitRow } from '@/types';
import type { WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import type { WorkbookHorizontalBodySegment } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';

interface UseWorkbookHorizontalOverlayLayoutParams {
  sectionRows: SplitRow[];
  visibleFrozenCanvasRows: WorkbookPaneCanvasRow[];
  bodySegments: WorkbookHorizontalBodySegment[];
  rowWindowOffsetTop: number;
  stickyHeaderHeight: number;
}

export function useWorkbookHorizontalOverlayLayout({
  sectionRows,
  visibleFrozenCanvasRows,
  bodySegments,
  rowWindowOffsetTop,
  stickyHeaderHeight,
}: UseWorkbookHorizontalOverlayLayoutParams): Map<number, { top: number; height: number }> {
  const sectionRowIndexByKey = useMemo(
    () => new Map(sectionRows.map((row, index) => [getWorkbookHorizontalRowKey(row), index])),
    [sectionRows],
  );

  return useMemo(() => {
    const visibleRowFrames = new Map<number, { top: number; height: number }>();
    let frozenCursorTop = ROW_H;
    visibleFrozenCanvasRows.forEach((renderRow) => {
      const rowIndex = sectionRowIndexByKey.get(getWorkbookHorizontalRowKey(renderRow.row));
      if (rowIndex == null) {
        frozenCursorTop += ROW_H;
        return;
      }
      visibleRowFrames.set(rowIndex, { top: frozenCursorTop, height: ROW_H });
      frozenCursorTop += ROW_H;
    });
    bodySegments.forEach((segment) => {
      if (segment.kind !== 'rows') return;
      let cursorTop = stickyHeaderHeight + rowWindowOffsetTop + segment.top;
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
  }, [bodySegments, rowWindowOffsetTop, sectionRowIndexByKey, stickyHeaderHeight, visibleFrozenCanvasRows]);
}
