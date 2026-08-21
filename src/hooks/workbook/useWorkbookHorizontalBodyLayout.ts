import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { Hunk, SplitRow } from '@/types';
import type { WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import {
  buildWorkbookLinearBodyLayoutBase,
  mapWorkbookProjectedBodyRows,
} from '@/utils/workbook/workbookBodyLayoutProjection';

export type WorkbookHorizontalRenderItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number; rowNumberStart: number | null; rowNumberEnd: number | null }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[]; count: number };

export type WorkbookHorizontalBodySegment =
  | { kind: 'rows'; rows: WorkbookPaneCanvasRow[]; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookHorizontalRenderItem, { kind: 'split-collapse' }>; top: number; height: number; sourceItemIndex: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookHorizontalRenderItem, { kind: 'hidden-rows' }>; top: number; height: number };

interface UseWorkbookHorizontalBodyLayoutParams {
  items: WorkbookHorizontalRenderItem[];
  startIdx: number;
  endIdx: number;
  guidedHunkRange: Hunk | null;
  activeSearchLineIdx: number;
  searchMatchSet: ReadonlySet<number>;
}

export interface WorkbookHorizontalBodyLayoutResult {
  bodySegments: WorkbookHorizontalBodySegment[];
  rowFramesByKey: Map<string, { top: number; height: number }>;
}

export function useWorkbookHorizontalBodyLayout({
  items,
  startIdx,
  endIdx,
  guidedHunkRange,
  activeSearchLineIdx,
  searchMatchSet,
}: UseWorkbookHorizontalBodyLayoutParams): WorkbookHorizontalBodyLayoutResult {
  const bodyBaseLayout = useMemo(
    () => buildWorkbookLinearBodyLayoutBase({
      items,
      startIdx,
      endIdx,
      cacheKey: `horizontal:body-base:v1:${startIdx}:${endIdx}`,
      resolveItemKind: (item) => {
        if (item.kind === 'split-line') return 'row';
        if (item.kind === 'split-collapse') return 'collapse';
        return 'hidden-rows';
      },
      resolveItemHeight: () => ROW_H,
      resolveRow: (item) => item.kind === 'split-line' ? item.row : null,
      buildStaticRow: (item) => ({
        row: (item as Extract<WorkbookHorizontalRenderItem, { kind: 'split-line' }>).row,
      }),
    }),
    [endIdx, items, startIdx],
  );

  return useMemo(() => ({
    bodySegments: bodyBaseLayout.segments.map((segment) => {
      if (segment.kind === 'collapse') {
        return {
          kind: 'collapse',
          item: segment.item as Extract<WorkbookHorizontalRenderItem, { kind: 'split-collapse' }>,
          top: segment.top,
          height: segment.height,
          sourceItemIndex: segment.sourceItemIndex,
        };
      }
      if (segment.kind === 'hidden-rows') {
        return {
          kind: 'hidden-rows',
          item: segment.item as Extract<WorkbookHorizontalRenderItem, { kind: 'hidden-rows' }>,
          top: segment.top,
          height: segment.height,
        };
      }
      if (segment.kind === 'rows') {
        return {
          kind: 'rows',
          rows: mapWorkbookProjectedBodyRows({
            rows: segment.rows,
            sourceItems: items,
            resolveSourceRow: (sourceItem) => sourceItem.kind === 'split-line' ? sourceItem.row : null,
            guidedHunkRange,
            activeSearchLineIdx,
            searchMatchSet,
            decorateRow: (entry, state) => ({
              ...entry.staticRow,
              ...state,
            } as WorkbookPaneCanvasRow),
          }),
          top: segment.top,
          height: segment.height,
        };
      }
      throw new Error(`Unknown workbook horizontal body segment kind: ${String(segment.kind)}`);
    }),
    rowFramesByKey: bodyBaseLayout.rowFramesByKey,
  }), [
    activeSearchLineIdx,
    bodyBaseLayout,
    guidedHunkRange,
    items,
    searchMatchSet,
  ]);
}
