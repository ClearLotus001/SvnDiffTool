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
import {
  buildWorkbookGroupedBodyLayoutBase,
  buildWorkbookLinearBodyLayoutBase,
  mapWorkbookProjectedBodyRows,
} from '@/utils/workbook/workbookBodyLayoutProjection';
import { buildWorkbookCanvasRuns } from '@/utils/workbook/workbookCanvasRuns';
import type { WorkbookRowFrame } from '@/utils/workbook/workbookVisibleRowFrames';

const STACKED_BODY_CANVAS_RUN_MAX_HEIGHT = ROW_H * 128;

export type WorkbookCompareStackedBodySegment =
  | { kind: 'rows'; group: WorkbookCanvasRenderGroup; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; top: number; height: number; sourceItemIndex: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; top: number; height: number };

export type WorkbookCompareColumnsBodySegment =
  | { kind: 'rows'; rows: WorkbookColumnsCanvasRow[]; top: number; height: number }
  | { kind: 'collapse'; item: Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>; top: number; height: number; sourceItemIndex: number }
  | { kind: 'hidden-rows'; item: Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>; top: number; height: number };

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

export interface WorkbookCompareBodyLayoutResult {
  bodySegments: WorkbookCompareStackedBodySegment[];
  stackedCanvasRuns: WorkbookCompareStackedCanvasRun[];
  stackedVisibleMergeGroupCount: number;
  columnsBodySegments: WorkbookCompareColumnsBodySegment[] | null;
  rowFramesByKey: Map<string, WorkbookRowFrame>;
}

const EMPTY_ROW_FRAMES_BY_KEY = new Map<string, WorkbookRowFrame>();

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
}: UseWorkbookCompareBodyLayoutParams): WorkbookCompareBodyLayoutResult {
  const stackedBodyBaseLayout = useMemo(() => {
    if (mode !== 'stacked') {
      return {
        segments: [],
        rowFramesByKey: EMPTY_ROW_FRAMES_BY_KEY,
      };
    }

    return buildWorkbookGroupedBodyLayoutBase({
      items: stackedVirtualItems,
      startIdx,
      endIdx,
      cacheKey: `compare:stacked-body-base:v1:${startIdx}:${endIdx}`,
      resolveItemKind: (item) => item.kind,
      resolveItemHeight: (item) => item.height,
      resolveRows: (item) => item.kind === 'rows'
        ? item.rows.map((renderRow, localIndex) => ({
          row: renderRow.row,
          height: renderRow.height,
          sourceItemIndex: item.sourceStartItemIndex + localIndex,
          staticRow: renderRow,
        }))
        : [],
    });
  }, [endIdx, mode, stackedVirtualItems, startIdx]);

  const stackedBodyLayout = useMemo<{
    segments: WorkbookCompareStackedBodySegment[];
    rowFramesByKey: Map<string, WorkbookRowFrame>;
  }>(() => {
    if (mode !== 'stacked') {
      return {
        segments: [],
        rowFramesByKey: EMPTY_ROW_FRAMES_BY_KEY,
      };
    }

    const segments: WorkbookCompareStackedBodySegment[] = [];
    stackedBodyBaseLayout.segments.forEach((segment) => {
      if (segment.kind === 'collapse') {
        segments.push({
          kind: 'collapse',
          item: (segment.item as Extract<WorkbookStackedVirtualItem, { kind: 'collapse' }>).item,
          top: segment.top,
          height: segment.height,
          sourceItemIndex: segment.sourceItemIndex,
        });
        return;
      }

      if (segment.kind === 'hidden-rows') {
        segments.push({
          kind: 'hidden-rows',
          item: (segment.item as Extract<WorkbookStackedVirtualItem, { kind: 'hidden-rows' }>).item,
          top: segment.top,
          height: segment.height,
        });
        return;
      }

      if (segment.kind !== 'rows') return;
      const item = segment.item as Extract<WorkbookStackedVirtualItem, { kind: 'rows' }>;
      const rows = mapWorkbookProjectedBodyRows({
        rows: segment.rows,
        sourceItems: items,
        resolveSourceRow: (sourceItem) => sourceItem.kind === 'row' ? sourceItem.row : null,
        guidedHunkRange,
        activeSearchLineIdx,
        searchMatchSet,
        decorateRow: (entry, state) => ({
          ...entry.staticRow,
          ...state,
        }),
      });

      segments.push({
        kind: 'rows',
        group: {
          key: item.groupKey,
          rows,
          height: item.height,
          hasVerticalMerge: item.hasVerticalMerge,
          baseTrack: item.baseTrack,
          mineTrack: item.mineTrack,
        },
        top: segment.top,
        height: segment.height,
      });
    });

    return {
      segments,
      rowFramesByKey: stackedBodyBaseLayout.rowFramesByKey,
    };
  }, [
    activeSearchLineIdx,
    guidedHunkRange,
    items,
    mode,
    searchMatchSet,
    stackedBodyBaseLayout,
  ]);

  const bodySegments = stackedBodyLayout.segments;

  const stackedCanvasRuns = useMemo<WorkbookCompareStackedCanvasRun[]>(() => {
    if (mode !== 'stacked') return [];
    return buildWorkbookCanvasRuns(
      bodySegments.flatMap((segment) => (
        segment.kind === 'rows'
          ? [{ ...segment.group, top: segment.top }]
          : []
      )),
      {
        keyPrefix: 'compare:stacked-body-run:v1',
        maxRunHeight: STACKED_BODY_CANVAS_RUN_MAX_HEIGHT,
      },
    );
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

  const columnsBodyBaseLayout = useMemo(() => {
    if (mode !== 'columns') {
      return {
        segments: null,
        rowFramesByKey: EMPTY_ROW_FRAMES_BY_KEY,
      };
    }

    return buildWorkbookLinearBodyLayoutBase({
      items,
      startIdx,
      endIdx,
      cacheKey: `compare:columns-body-base:v1:${startIdx}:${endIdx}`,
      resolveItemKind: (item) => {
        if (item.kind === 'row') return 'row';
        if (item.kind === 'collapse') return 'collapse';
        return 'hidden-rows';
      },
      resolveItemHeight: () => ROW_H,
      resolveRow: (item) => item.kind === 'row' ? item.row : null,
      buildStaticRow: (item) => ({
        row: (item as Extract<WorkbookCompareRenderItem, { kind: 'row' }>).row,
        renderMode: getWorkbookColumnsRenderMode(
          (item as Extract<WorkbookCompareRenderItem, { kind: 'row' }>).row,
        ),
      }),
    });
  }, [endIdx, items, mode, startIdx]);

  const columnsBodyLayout = useMemo<{
    segments: WorkbookCompareColumnsBodySegment[] | null;
    rowFramesByKey: Map<string, WorkbookRowFrame>;
  }>(() => {
    if (mode !== 'columns') {
      return {
        segments: null,
        rowFramesByKey: EMPTY_ROW_FRAMES_BY_KEY,
      };
    }

    const segments: WorkbookCompareColumnsBodySegment[] = [];
    columnsBodyBaseLayout.segments?.forEach((segment) => {
      if (segment.kind === 'collapse') {
        segments.push({
          kind: 'collapse',
          item: segment.item as Extract<WorkbookCompareRenderItem, { kind: 'collapse' }>,
          top: segment.top,
          height: segment.height,
          sourceItemIndex: segment.sourceItemIndex,
        });
        return;
      }

      if (segment.kind === 'hidden-rows') {
        segments.push({
          kind: 'hidden-rows',
          item: segment.item as Extract<WorkbookCompareRenderItem, { kind: 'hidden-rows' }>,
          top: segment.top,
          height: segment.height,
        });
        return;
      }

      if (segment.kind !== 'rows') return;

      segments.push({
        kind: 'rows',
        rows: mapWorkbookProjectedBodyRows({
          rows: segment.rows,
          sourceItems: items,
          resolveSourceRow: (sourceItem) => sourceItem.kind === 'row' ? sourceItem.row : null,
          guidedHunkRange,
          activeSearchLineIdx,
          searchMatchSet,
          decorateRow: (entry, state) => ({
            ...entry.staticRow,
            ...state,
          } as WorkbookColumnsCanvasRow),
        }),
        top: segment.top,
        height: segment.height,
      });
    });

    return {
      segments,
      rowFramesByKey: columnsBodyBaseLayout.rowFramesByKey,
    };
  }, [
    activeSearchLineIdx,
    columnsBodyBaseLayout,
    guidedHunkRange,
    items,
    mode,
    searchMatchSet,
  ]);

  const columnsBodySegments = columnsBodyLayout.segments;

  return {
    bodySegments,
    stackedCanvasRuns,
    stackedVisibleMergeGroupCount,
    columnsBodySegments,
    rowFramesByKey: mode === 'stacked'
      ? stackedBodyLayout.rowFramesByKey
      : columnsBodyLayout.rowFramesByKey,
  };
}
