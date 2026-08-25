import { useCallback, useMemo, type ComponentProps, type RefObject } from 'react';

import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { WorkbookDiffRegion, SplitRow } from '@/types';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import type { WorkbookRegionOverlayBoundsMode } from '@/utils/workbook/workbookRegionOverlay';
import type { WorkbookRowFrame } from '@/utils/workbook/workbookVisibleRowFrames';
import {
  resolveWorkbookVisibleRowFrames,
} from '@/utils/workbook/workbookVisibleRowFrames';

interface UseWorkbookCompareOverlayLayoutParams {
  sectionRows: SplitRow[];
  showColumnHeader: boolean;
  mode: CompareMode;
  stickyHeaderHeight: number;
  rowWindowOffsetTop: number;
  frozenRowFramesByKey: ReadonlyMap<string, WorkbookRowFrame>;
  bodyRowFramesByKey: ReadonlyMap<string, WorkbookRowFrame>;
  scrollRef: RefObject<HTMLDivElement | null>;
  viewportWidth: number;
  viewportHeight: number;
  activeDiffRegion: WorkbookDiffRegion | null;
  activeSheetName: string | null;
  columnLayoutByColumn: ReadonlyMap<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  pulseTriggerKey: string | null;
  label: string;
  deemphasizeOutline?: boolean;
}

export function useWorkbookCompareOverlayLayout({
  sectionRows,
  showColumnHeader,
  mode,
  stickyHeaderHeight,
  rowWindowOffsetTop,
  frozenRowFramesByKey,
  bodyRowFramesByKey,
  scrollRef,
  viewportWidth,
  viewportHeight,
  activeDiffRegion,
  activeSheetName,
  columnLayoutByColumn,
  contentLeft,
  frozenWidth,
  freezeColumnCount,
  pulseTriggerKey,
  label,
  deemphasizeOutline = false,
}: UseWorkbookCompareOverlayLayoutParams): ComponentProps<typeof WorkbookActiveRegionOverlayLayer> {
  const visibleRowFrames = useMemo(() => {
    return resolveWorkbookVisibleRowFrames(sectionRows, [
      {
        framesByKey: frozenRowFramesByKey,
        topOffset: showColumnHeader ? ROW_H : 0,
      },
      {
        framesByKey: bodyRowFramesByKey,
        topOffset: stickyHeaderHeight + rowWindowOffsetTop,
      },
    ]);
  }, [
    bodyRowFramesByKey,
    frozenRowFramesByKey,
    rowWindowOffsetTop,
    sectionRows,
    showColumnHeader,
    stickyHeaderHeight,
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

  const resolveFocusPatchBoundsModes = useCallback((
    patch: WorkbookDiffRegion['patches'][number],
  ): WorkbookRegionOverlayBoundsMode[] => {
    if (mode === 'stacked') return ['single'];
    if (patch.hasBaseSide || patch.hasMineSide) return ['paired-shared'];
    return [];
  }, [mode]);

  return useMemo(() => ({
    scrollRef,
    viewportWidth,
    viewportHeight,
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
    resolveFocusPatchBoundsModes,
    pulseTriggerKey,
    label,
    deemphasizeOutline,
  }), [
    activeDiffRegion,
    activeSheetName,
    columnLayoutByColumn,
    contentLeft,
    fallbackBoundsModes,
    freezeColumnCount,
    frozenWidth,
    label,
    deemphasizeOutline,
    pulseTriggerKey,
    resolveFocusPatchBoundsModes,
    resolvePatchBoundsModes,
    scrollRef,
    stickyHeaderHeight,
    viewportHeight,
    viewportWidth,
    visibleRowFrames,
  ]);
}
