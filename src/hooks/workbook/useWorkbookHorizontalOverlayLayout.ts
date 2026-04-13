import { useMemo } from 'react';

import type { SplitRow } from '@/types';
import type { WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import type { WorkbookHorizontalBodyLayoutResult } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import {
  collectWorkbookRowFramesByKey,
  resolveWorkbookVisibleRowFrames,
} from '@/utils/workbook/workbookVisibleRowFrames';
import { getWorkbookRowKey as getWorkbookHorizontalRowKey } from '@/utils/workbook/workbookPanelHelpers';

interface UseWorkbookHorizontalOverlayLayoutParams {
  sectionRows: SplitRow[];
  visibleFrozenCanvasRows: WorkbookPaneCanvasRow[];
  bodyLayout: WorkbookHorizontalBodyLayoutResult;
  rowWindowOffsetTop: number;
  stickyHeaderHeight: number;
}

export function useWorkbookHorizontalOverlayLayout({
  sectionRows,
  visibleFrozenCanvasRows,
  bodyLayout,
  rowWindowOffsetTop,
  stickyHeaderHeight,
}: UseWorkbookHorizontalOverlayLayoutParams): Map<number, { top: number; height: number }> {
  const frozenRowFramesByKey = useMemo(
    () => collectWorkbookRowFramesByKey(visibleFrozenCanvasRows, {
      getRowKey: (renderRow) => getWorkbookHorizontalRowKey(renderRow.row),
      getItemHeight: () => ROW_H,
      cacheKey: 'horizontal:overlay:frozen-row-frames:v1',
    }),
    [visibleFrozenCanvasRows],
  );

  return useMemo(() => {
    return resolveWorkbookVisibleRowFrames(sectionRows, [
      {
        framesByKey: frozenRowFramesByKey,
        topOffset: ROW_H,
      },
      {
        framesByKey: bodyLayout.rowFramesByKey,
        topOffset: stickyHeaderHeight + rowWindowOffsetTop,
      },
    ]);
  }, [bodyLayout.rowFramesByKey, frozenRowFramesByKey, rowWindowOffsetTop, sectionRows, stickyHeaderHeight]);
}
