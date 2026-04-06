import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { Hunk, SplitRow } from '@/types';
import type { WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import { rowTouchesGuidedHunk } from '@/utils/workbook/workbookPanelHelpers';

export type WorkbookHorizontalRenderItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; blockId: string; count: number; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number; rowNumberStart: number | null; rowNumberEnd: number | null }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[]; count: number }
  | { kind: 'sparse-gap'; rowNumberStart: number; rowNumberEnd: number; count: number };

export type WorkbookHorizontalBodySegment =
  | { kind: 'rows'; rows: WorkbookPaneCanvasRow[]; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookHorizontalRenderItem, { kind: 'split-collapse' }>; top: number; height: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookHorizontalRenderItem, { kind: 'hidden-rows' }>; top: number; height: number }
  | { kind: 'sparse-gap'; item: Extract<WorkbookHorizontalRenderItem, { kind: 'sparse-gap' }>; top: number; height: number };

interface UseWorkbookHorizontalBodyLayoutParams {
  items: WorkbookHorizontalRenderItem[];
  startIdx: number;
  endIdx: number;
  guidedHunkRange: Hunk | null;
  activeSearchLineIdx: number;
  searchMatchSet: ReadonlySet<number>;
}

export function useWorkbookHorizontalBodyLayout({
  items,
  startIdx,
  endIdx,
  guidedHunkRange,
  activeSearchLineIdx,
  searchMatchSet,
}: UseWorkbookHorizontalBodyLayoutParams): WorkbookHorizontalBodySegment[] {
  return useMemo(() => {
    const slice = items.slice(startIdx, endIdx);
    const segments: WorkbookHorizontalBodySegment[] = [];
    let currentRows: WorkbookPaneCanvasRow[] = [];
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
      if (item.kind === 'split-collapse') {
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

      if (item.kind === 'sparse-gap') {
        flushRows();
        const height = item.count * ROW_H;
        segments.push({
          kind: 'sparse-gap',
          item,
          top: cursorTop,
          height,
        });
        cursorTop += height;
        currentRowsTop = cursorTop;
        return;
      }

      if (currentRows.length === 0) currentRowsTop = cursorTop;
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = itemIndex > 0
        && items[itemIndex - 1]?.kind === 'split-line'
        && rowTouchesGuidedHunk((items[itemIndex - 1] as Extract<typeof items[number], { kind: 'split-line' }>).row, guidedHunkRange);
      const nextGuided = itemIndex + 1 < items.length
        && items[itemIndex + 1]?.kind === 'split-line'
        && rowTouchesGuidedHunk((items[itemIndex + 1] as Extract<typeof items[number], { kind: 'split-line' }>).row, guidedHunkRange);
      currentRows.push({
        row: item.row,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
        isGuided,
        isGuidedStart: isGuided && !prevGuided,
        isGuidedEnd: isGuided && !nextGuided,
      });
      cursorTop += ROW_H;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, items, searchMatchSet, startIdx]);
}
