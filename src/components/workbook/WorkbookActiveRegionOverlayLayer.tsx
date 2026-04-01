import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookDiffRegion } from '@/types';
import {
  buildWorkbookRegionOverlayBoxes,
  buildWorkbookRegionOverlayBoxesFromGeometry,
  type WorkbookRegionOverlayBoundsMode,
} from '@/utils/workbook/workbookRegionOverlay';
import {
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
} from '@/utils/workbook/workbookMergeLayout';
import { resolveWorkbookRegionTone } from '@/utils/workbook/workbookRowVisuals';
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
} from '@/components/workbook/WorkbookDiffRegionOverlay';

interface WorkbookActiveRegionOverlayLayerProps {
  scrollRef: RefObject<HTMLDivElement>;
  viewportWidth: number;
  activeDiffRegion: WorkbookDiffRegion | null;
  activeSheetName: string | null;
  visibleRowFrames: Map<number, { top: number; height: number }>;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  resolvePatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  fallbackBoundsModes: WorkbookRegionOverlayBoundsMode[];
  filterPatch?: ((patch: WorkbookDiffRegion['patches'][number]) => boolean) | undefined;
  pulseNonce?: number;
  label?: string;
}

const MIN_OVERLAY_BOX_SIZE = 4;

function findVisibleRowBounds(
  visibleRows: Array<[number, { top: number; height: number }]>,
  startRowIndex: number,
  endRowIndex: number,
): {
  firstVisibleRowIndex: number;
  lastVisibleRowIndex: number;
  top: number;
  bottom: number;
} | null {
  if (visibleRows.length === 0) return null;

  let low = 0;
  let high = visibleRows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((visibleRows[middle]?.[0] ?? Number.POSITIVE_INFINITY) < startRowIndex) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const firstIndex = low;
  const firstRow = visibleRows[firstIndex];
  if (!firstRow || firstRow[0] > endRowIndex) return null;

  low = firstIndex;
  high = visibleRows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((visibleRows[middle]?.[0] ?? Number.NEGATIVE_INFINITY) <= endRowIndex) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const lastIndex = Math.max(firstIndex, low - 1);
  const lastRow = visibleRows[lastIndex];
  if (!lastRow) return null;

  return {
    firstVisibleRowIndex: firstRow[0],
    lastVisibleRowIndex: lastRow[0],
    top: firstRow[1].top,
    bottom: lastRow[1].top + lastRow[1].height,
  };
}

const WorkbookActiveRegionOverlayLayer = memo(({
  scrollRef,
  viewportWidth,
  activeDiffRegion,
  activeSheetName,
  visibleRowFrames,
  columnLayoutByColumn,
  contentLeft,
  frozenWidth,
  freezeColumnCount,
  resolvePatchBoundsModes,
  fallbackBoundsModes,
  filterPatch,
  pulseNonce = 0,
  label,
}: WorkbookActiveRegionOverlayLayerProps) => {
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollLeftRef = useRef(0);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const applyScrollLeft = (sync = false) => {
      const nextScrollLeft = Math.max(0, scroller.scrollLeft);
      if (Math.abs(scrollLeftRef.current - nextScrollLeft) < 0.01) return;
      scrollLeftRef.current = nextScrollLeft;
      if (sync) {
        setScrollLeft(nextScrollLeft);
        return;
      }
      flushSync(() => {
        setScrollLeft(nextScrollLeft);
      });
    };

    applyScrollLeft(true);
    const handleScroll = () => applyScrollLeft();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef]);

  const sortedVisibleRows = useMemo(
    () => Array.from(visibleRowFrames.entries()).sort((left, right) => left[0] - right[0]),
    [visibleRowFrames],
  );

  const boxes = useMemo(() => {
    if (
      !activeDiffRegion
      || activeDiffRegion.sheetName !== activeSheetName
      || visibleRowFrames.size === 0
      || viewportWidth <= 0
    ) {
      return [];
    }

    const patchBoxes = activeDiffRegion.patches.flatMap((patch, patchIndex) => {
      if (filterPatch && !filterPatch(patch)) return [];

      const boundsModes = resolvePatchBoundsModes(patch);
      if (boundsModes.length === 0) return [];

      const visibleBounds = findVisibleRowBounds(
        sortedVisibleRows,
        patch.startRowIndex,
        patch.endRowIndex,
      );
      if (!visibleBounds) return [];

      return boundsModes.flatMap((boundsMode, boundsIndex) => {
        const bounds = getWorkbookColumnSpanBounds(
          patch.startCol,
          patch.endCol,
          columnLayoutByColumn,
          boundsMode,
          freezeColumnCount,
        );
        const geometry = bounds
          ? getWorkbookCanvasSpanGeometry(bounds, contentLeft, scrollLeft, frozenWidth)
          : null;
        if (!geometry) return [];

        return buildWorkbookRegionOverlayBoxesFromGeometry({
          geometry,
          keyPrefix: `${activeDiffRegion.id}:${patchIndex}:${boundsMode}:${boundsIndex}`,
          top: visibleBounds.top,
          bottom: visibleBounds.bottom,
          tone: resolveWorkbookRegionTone(patch.hasBaseSide, patch.hasMineSide),
          openTop: visibleBounds.firstVisibleRowIndex > patch.startRowIndex,
          openBottom: visibleBounds.lastVisibleRowIndex < patch.endRowIndex,
        });
      });
    });

    const mergedPatchBoxes = mergeWorkbookDiffRegionOverlayBoxes(patchBoxes)
      .filter((box) => box.width > MIN_OVERLAY_BOX_SIZE && box.height > MIN_OVERLAY_BOX_SIZE);
    if (mergedPatchBoxes.length > 0 || fallbackBoundsModes.length === 0) {
      return mergedPatchBoxes;
    }

    return mergeWorkbookDiffRegionOverlayBoxes(buildWorkbookRegionOverlayBoxes({
      region: activeDiffRegion,
      visibleRowFrames,
      boundsModes: fallbackBoundsModes,
      columnLayoutByColumn,
      contentLeft,
      scrollLeft,
      frozenWidth,
      freezeColumnCount,
      key: `${activeDiffRegion.id}:fallback`,
    })).filter((box) => box.width > MIN_OVERLAY_BOX_SIZE && box.height > MIN_OVERLAY_BOX_SIZE);
  }, [
    activeDiffRegion,
    activeSheetName,
    columnLayoutByColumn,
    contentLeft,
    fallbackBoundsModes,
    filterPatch,
    freezeColumnCount,
    frozenWidth,
    resolvePatchBoundsModes,
    scrollLeft,
    sortedVisibleRows,
    viewportWidth,
    visibleRowFrames,
  ]);

  if (boxes.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 6,
      }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          height: '100%',
          width: viewportWidth,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
        <WorkbookDiffRegionOverlay
          boxes={boxes}
          pulseNonce={pulseNonce}
          {...(label ? { label } : {})}
        />
      </div>
    </div>
  );
});

export default WorkbookActiveRegionOverlayLayer;
