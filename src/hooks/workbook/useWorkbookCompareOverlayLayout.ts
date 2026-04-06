import { useCallback, useMemo, type ComponentProps, type RefObject } from 'react';

import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { WorkbookDiffRegion, SplitRow } from '@/types';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { FrozenStackedCanvasRun } from '@/hooks/workbook/useWorkbookFrozenPaneState';
import type {
  WorkbookCompareColumnsBodySegment,
  WorkbookCompareStackedBodySegment,
} from '@/hooks/workbook/useWorkbookCompareBodyLayout';
import type { WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import {
  getWorkbookRowKey as getWorkbookCompareRowKey,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookRegionOverlayBoundsMode } from '@/utils/workbook/workbookRegionOverlay';

interface UseWorkbookCompareOverlayLayoutParams {
  sectionRows: SplitRow[];
  showColumnHeader: boolean;
  mode: CompareMode;
  stickyHeaderHeight: number;
  rowWindowOffsetTop: number;
  visibleFrozenStackedCanvasRuns: FrozenStackedCanvasRun[];
  visibleFrozenColumnsCanvasRows: WorkbookColumnsCanvasRow[];
  bodySegments: WorkbookCompareStackedBodySegment[];
  columnsBodySegments: WorkbookCompareColumnsBodySegment[] | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  viewportWidth: number;
  activeDiffRegion: WorkbookDiffRegion | null;
  activeSheetName: string | null;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  pulseNonce: number;
  label: string;
}

export function useWorkbookCompareOverlayLayout({
  sectionRows,
  showColumnHeader,
  mode,
  stickyHeaderHeight,
  rowWindowOffsetTop,
  visibleFrozenStackedCanvasRuns,
  visibleFrozenColumnsCanvasRows,
  bodySegments,
  columnsBodySegments,
  scrollRef,
  viewportWidth,
  activeDiffRegion,
  activeSheetName,
  columnLayoutByColumn,
  contentLeft,
  frozenWidth,
  freezeColumnCount,
  pulseNonce,
  label,
}: UseWorkbookCompareOverlayLayoutParams): ComponentProps<typeof WorkbookActiveRegionOverlayLayer> {
  const sectionRowIndexByKey = useMemo(
    () => new Map(sectionRows.map((row, index) => [getWorkbookCompareRowKey(row), index])),
    [sectionRows],
  );

  const visibleRowFrames = useMemo(() => {
    const next = new Map<number, { top: number; height: number }>();
    let frozenCursorTop = showColumnHeader ? ROW_H : 0;

    if (mode === 'stacked') {
      visibleFrozenStackedCanvasRuns.forEach((run) => {
        let cursorTop = frozenCursorTop + run.top;
        run.groups.forEach((group) => {
          group.rows.forEach((renderRow) => {
            const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
            if (rowIndex == null) {
              cursorTop += renderRow.height;
              return;
            }
            next.set(rowIndex, { top: cursorTop, height: renderRow.height });
            cursorTop += renderRow.height;
          });
        });
      });
    } else {
      visibleFrozenColumnsCanvasRows.forEach((renderRow) => {
        const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
        if (rowIndex == null) {
          frozenCursorTop += ROW_H;
          return;
        }
        next.set(rowIndex, { top: frozenCursorTop, height: ROW_H });
        frozenCursorTop += ROW_H;
      });
    }

    if (mode === 'stacked') {
      bodySegments.forEach((segment) => {
        if (segment.kind !== 'rows') return;
        let cursorTop = stickyHeaderHeight + rowWindowOffsetTop + segment.top;
        segment.group.rows.forEach((renderRow) => {
          const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
          if (rowIndex == null) {
            cursorTop += renderRow.height;
            return;
          }
          next.set(rowIndex, { top: cursorTop, height: renderRow.height });
          cursorTop += renderRow.height;
        });
      });
    } else {
      (columnsBodySegments ?? []).forEach((segment) => {
        if (segment.kind !== 'rows') return;
        let cursorTop = stickyHeaderHeight + rowWindowOffsetTop + segment.top;
        segment.rows.forEach((renderRow) => {
          const rowIndex = sectionRowIndexByKey.get(getWorkbookCompareRowKey(renderRow.row));
          if (rowIndex == null) {
            cursorTop += ROW_H;
            return;
          }
          next.set(rowIndex, { top: cursorTop, height: ROW_H });
          cursorTop += ROW_H;
        });
      });
    }

    return next;
  }, [
    bodySegments,
    columnsBodySegments,
    mode,
    rowWindowOffsetTop,
    sectionRowIndexByKey,
    showColumnHeader,
    stickyHeaderHeight,
    visibleFrozenColumnsCanvasRows,
    visibleFrozenStackedCanvasRuns,
  ]);

  const resolvePatchBoundsModes = useCallback((
    patch: WorkbookDiffRegion['patches'][number],
  ): WorkbookRegionOverlayBoundsMode[] => {
    if (mode === 'stacked') return ['single'];
    if (patch.hasBaseSide && patch.hasMineSide) return ['paired-shared'];
    if (patch.hasBaseSide) return ['paired-base'];
    if (patch.hasMineSide) return ['paired-mine'];
    return [];
  }, [mode]);

  const fallbackBoundsModes = useMemo<WorkbookRegionOverlayBoundsMode[]>(() => {
    if (mode === 'stacked') return ['single'];
    if (activeDiffRegion?.hasBaseSide && activeDiffRegion?.hasMineSide) return ['paired-shared'];
    if (activeDiffRegion?.hasBaseSide) return ['paired-base'];
    if (activeDiffRegion?.hasMineSide) return ['paired-mine'];
    return ['paired-shared'];
  }, [activeDiffRegion?.hasBaseSide, activeDiffRegion?.hasMineSide, mode]);

  return useMemo(() => ({
    scrollRef,
    viewportWidth,
    stickyHeaderHeight,
    activeDiffRegion,
    activeSheetName,
    visibleRowFrames,
    columnLayoutByColumn,
    contentLeft,
    frozenWidth,
    freezeColumnCount,
    resolvePatchBoundsModes,
    fallbackBoundsModes,
    pulseNonce,
    label,
  }), [
    activeDiffRegion,
    activeSheetName,
    columnLayoutByColumn,
    contentLeft,
    fallbackBoundsModes,
    freezeColumnCount,
    frozenWidth,
    label,
    pulseNonce,
    resolvePatchBoundsModes,
    scrollRef,
    stickyHeaderHeight,
    viewportWidth,
    visibleRowFrames,
  ]);
}
