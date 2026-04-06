import { useMemo } from 'react';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { Hunk } from '@/types';
import type {
  CompareMode,
  WorkbookCompareRenderItem,
  WorkbookStackedVirtualItem,
} from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { FrozenStackedCanvasRun } from '@/hooks/workbook/useWorkbookFrozenPaneState';
import type { WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import type { WorkbookCanvasRenderGroup } from '@/components/workbook/WorkbookStackedCanvasStrip';
import { getWorkbookColumnsRenderMode } from '@/utils/workbook/workbookRowBehavior';
import { rowTouchesGuidedHunk } from '@/utils/workbook/workbookPanelHelpers';

export type WorkbookCompareStackedBodySegment =
  | { kind: 'rows'; group: WorkbookCanvasRenderGroup; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; top: number; height: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; top: number; height: number }
  | { kind: 'sparse-gap'; item: Extract<WorkbookCompareRenderItem, { kind: 'sparse-gap' }>; top: number; height: number };

export type WorkbookCompareColumnsBodySegment =
  | { kind: 'rows'; rows: WorkbookColumnsCanvasRow[]; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; top: number; height: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; top: number; height: number }
  | { kind: 'sparse-gap'; item: Extract<WorkbookCompareRenderItem, { kind: 'sparse-gap' }>; top: number; height: number };

export interface WorkbookCompareStackedCanvasRun {
  key: string;
  groups: WorkbookCanvasRenderGroup[];
  top: number;
  height: number;
}

interface UseWorkbookCompareBodyLayoutParams {
  mode: CompareMode;
  stackedVirtualItems: WorkbookStackedVirtualItem[];
  startIdx: number;
  endIdx: number;
  items: WorkbookCompareRenderItem[];
  guidedHunkRange: Hunk | null;
  activeSearchLineIdx: number;
  searchMatchSet: ReadonlySet<number>;
  visibleFrozenStackedCanvasRuns: FrozenStackedCanvasRun[];
}

interface UseWorkbookCompareBodyLayoutResult {
  bodySegments: WorkbookCompareStackedBodySegment[];
  stackedCanvasRuns: WorkbookCompareStackedCanvasRun[];
  stackedVisibleMergeGroupCount: number;
  columnsBodySegments: WorkbookCompareColumnsBodySegment[] | null;
}

export function useWorkbookCompareBodyLayout({
  mode,
  stackedVirtualItems,
  startIdx,
  endIdx,
  items,
  guidedHunkRange,
  activeSearchLineIdx,
  searchMatchSet,
  visibleFrozenStackedCanvasRuns,
}: UseWorkbookCompareBodyLayoutParams): UseWorkbookCompareBodyLayoutResult {
  const bodySegments = useMemo<WorkbookCompareStackedBodySegment[]>(() => {
    if (mode !== 'stacked') return [];

    const slice = stackedVirtualItems.slice(startIdx, endIdx);
    const segments: WorkbookCompareStackedBodySegment[] = [];
    let cursorTop = 0;

    slice.forEach((item) => {
      if (item.kind === 'collapse') {
        segments.push({
          kind: 'collapse',
          item: item.item,
          top: cursorTop,
          height: item.height,
        });
        cursorTop += item.height;
        return;
      }

      if (item.kind === 'hidden-rows') {
        segments.push({
          kind: 'hidden-rows',
          item: item.item,
          top: cursorTop,
          height: item.height,
        });
        cursorTop += item.height;
        return;
      }

      if (item.kind === 'sparse-gap') {
        segments.push({
          kind: 'sparse-gap',
          item: item.item,
          top: cursorTop,
          height: item.height,
        });
        cursorTop += item.height;
        return;
      }

      segments.push({
        kind: 'rows',
        group: {
          key: item.groupKey,
          rows: item.rows.map((renderRow, localIndex) => {
            const sourceItemIndex = item.sourceStartItemIndex + localIndex;
            const isGuided = rowTouchesGuidedHunk(renderRow.row, guidedHunkRange);
            const prevGuided = sourceItemIndex > 0
              && items[sourceItemIndex - 1]?.kind === 'row'
              && rowTouchesGuidedHunk((items[sourceItemIndex - 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
            const nextGuided = sourceItemIndex + 1 < items.length
              && items[sourceItemIndex + 1]?.kind === 'row'
              && rowTouchesGuidedHunk((items[sourceItemIndex + 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
            return {
              ...renderRow,
              isSearchMatch: renderRow.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
              isActiveSearch: renderRow.row.lineIdxs.includes(activeSearchLineIdx),
              isGuided,
              isGuidedStart: isGuided && !prevGuided,
              isGuidedEnd: isGuided && !nextGuided,
            };
          }),
          height: item.height,
          hasVerticalMerge: item.hasVerticalMerge,
          baseTrack: item.baseTrack,
          mineTrack: item.mineTrack,
        },
        top: cursorTop,
        height: item.height,
      });
      cursorTop += item.height;
    });

    return segments;
  }, [
    activeSearchLineIdx,
    endIdx,
    guidedHunkRange,
    items,
    mode,
    searchMatchSet,
    stackedVirtualItems,
    startIdx,
  ]);

  const stackedCanvasRuns = useMemo<WorkbookCompareStackedCanvasRun[]>(() => {
    if (mode !== 'stacked') return [];
    return bodySegments.flatMap((segment) => (
      segment.kind === 'rows'
        ? [{
          key: segment.group.key,
          groups: [segment.group],
          top: segment.top,
          height: segment.height,
        }]
        : []
    ));
  }, [bodySegments, mode]);

  const stackedVisibleMergeGroupCount = useMemo(() => {
    if (mode !== 'stacked') return 0;

    const visibleKeys = new Set<string>();
    visibleFrozenStackedCanvasRuns.forEach((run) => {
      run.groups.forEach((group) => {
        if (group.hasVerticalMerge) visibleKeys.add(group.key);
      });
    });
    bodySegments.forEach((segment) => {
      if (segment.kind !== 'rows') return;
      if (segment.group.hasVerticalMerge) visibleKeys.add(segment.group.key);
    });

    return visibleKeys.size;
  }, [bodySegments, mode, visibleFrozenStackedCanvasRuns]);

  const columnsBodySegments = useMemo<WorkbookCompareColumnsBodySegment[] | null>(() => {
    if (mode !== 'columns') return null;

    const slice = items.slice(startIdx, endIdx);
    const segments: WorkbookCompareColumnsBodySegment[] = [];
    let currentRows: WorkbookColumnsCanvasRow[] = [];
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
      if (item.kind === 'collapse') {
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
      const renderMode = getWorkbookColumnsRenderMode(item.row);
      const isGuided = rowTouchesGuidedHunk(item.row, guidedHunkRange);
      const prevGuided = itemIndex > 0
        && items[itemIndex - 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex - 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      const nextGuided = itemIndex + 1 < items.length
        && items[itemIndex + 1]?.kind === 'row'
        && rowTouchesGuidedHunk((items[itemIndex + 1] as Extract<typeof items[number], { kind: 'row' }>).row, guidedHunkRange);
      currentRows.push({
        row: item.row,
        renderMode,
        isSearchMatch: item.row.lineIdxs.some(idx => searchMatchSet.has(idx)),
        isActiveSearch: item.row.lineIdxs.includes(activeSearchLineIdx),
        isGuided,
        isGuidedStart: isGuided && !prevGuided,
        isGuidedEnd: isGuided && !nextGuided,
      } as WorkbookColumnsCanvasRow);
      cursorTop += ROW_H;
    });

    flushRows();
    return segments;
  }, [activeSearchLineIdx, endIdx, guidedHunkRange, items, mode, searchMatchSet, startIdx]);

  return {
    bodySegments,
    stackedCanvasRuns,
    stackedVisibleMergeGroupCount,
    columnsBodySegments,
  };
}
