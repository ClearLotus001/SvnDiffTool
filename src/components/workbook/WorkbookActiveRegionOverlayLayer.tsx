import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
import { isWorkbookDebugEnabled, workbookDebugLog } from '@/utils/workbook/workbookDebug';
import { resolveWorkbookRegionTone } from '@/utils/workbook/workbookRowVisuals';
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
} from '@/components/workbook/WorkbookDiffRegionOverlay';

interface WorkbookActiveRegionOverlayLayerProps {
  scrollRef: RefObject<HTMLDivElement>;
  viewportWidth: number;
  stickyHeaderHeight: number;
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
const OVERLAY_DEBUG_THROTTLE_MS = 120;

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

function summarizeOverlayBoxes(boxes: ReturnType<typeof mergeWorkbookDiffRegionOverlayBoxes>) {
  return boxes.slice(0, 8).map((box) => ({
    key: box.key,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    tone: box.tone ?? null,
    openTop: Boolean(box.openTop),
    openBottom: Boolean(box.openBottom),
  }));
}

const CANVAS_BUFFER_FACTOR = 1;

function computeCanvasAnchor(
  scrollTop: number,
  viewportHeight: number,
): { anchorTop: number; canvasHeight: number } {
  const buffer = viewportHeight * CANVAS_BUFFER_FACTOR;
  const anchorTop = Math.max(0, scrollTop - buffer);
  const canvasHeight = viewportHeight + (buffer * 2);
  return { anchorTop, canvasHeight };
}

const WorkbookActiveRegionOverlayLayer = memo(({
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
  filterPatch,
  pulseNonce = 0,
  label,
}: WorkbookActiveRegionOverlayLayerProps) => {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [canvasAnchorTop, setCanvasAnchorTop] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const lastDebugLogAtRef = useRef(0);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const applyViewportHeight = () => {
      const nextViewportHeight = Math.max(0, scroller.clientHeight);
      setViewportHeight((current) => (
        current === nextViewportHeight ? current : nextViewportHeight
      ));
      const anchor = computeCanvasAnchor(
        Math.max(0, scroller.scrollTop),
        nextViewportHeight,
      );
      setCanvasAnchorTop(anchor.anchorTop);
      setCanvasHeight(anchor.canvasHeight);
    };

    const resizeObserver = new ResizeObserver(() => applyViewportHeight());
    resizeObserver.observe(scroller);
    applyViewportHeight();
    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollRef]);

  const sortedVisibleRows = useMemo(
    () => Array.from(visibleRowFrames.entries()).sort((left, right) => left[0] - right[0]),
    [visibleRowFrames],
  );

  const resolveBoxes = useCallback((scrollLeft: number) => {
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
      // NOTE:
      // visibleRowFrames stores overlay content-space row coordinates. The
      // canvas is now positioned at canvasAnchorTop in content-space, so box
      // coordinates are mapped to canvas-space by subtracting canvasAnchorTop
      // in the WorkbookDiffRegionOverlay draw function.

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
    sortedVisibleRows,
    viewportWidth,
    visibleRowFrames,
  ]);

  const handleRepositionNeeded = useCallback((scrollTop: number) => {
    const anchor = computeCanvasAnchor(scrollTop, viewportHeight);
    setCanvasAnchorTop(anchor.anchorTop);
    setCanvasHeight(anchor.canvasHeight);
  }, [viewportHeight]);

  useEffect(() => {
    if (!isWorkbookDebugEnabled()) return;
    if (!activeDiffRegion || activeDiffRegion.sheetName !== activeSheetName) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastDebugLogAtRef.current < OVERLAY_DEBUG_THROTTLE_MS) return;
    lastDebugLogAtRef.current = now;

    const scroller = scrollRef.current;
    const scrollLeft = Math.max(0, scroller?.scrollLeft ?? 0);
    const scrollTop = Math.max(0, scroller?.scrollTop ?? 0);
    const resolvedBoxes = resolveBoxes(scrollLeft);
    const visibleRowFrameSample = Array.from(visibleRowFrames.entries())
      .filter(([rowIndex]) => (
        rowIndex >= Math.max(0, activeDiffRegion.startRowIndex - 2)
        && rowIndex <= activeDiffRegion.endRowIndex + 2
      ))
      .sort((left, right) => left[0] - right[0])
      .slice(0, 12)
      .map(([rowIndex, frame]) => ({
        rowIndex,
        top: frame.top,
        height: frame.height,
      }));

    workbookDebugLog('WorkbookActiveRegionOverlayLayer/state', {
      region: {
        id: activeDiffRegion.id,
        sheetName: activeDiffRegion.sheetName,
        startRowIndex: activeDiffRegion.startRowIndex,
        endRowIndex: activeDiffRegion.endRowIndex,
        startCol: activeDiffRegion.startCol,
        endCol: activeDiffRegion.endCol,
      },
      scroll: {
        top: scrollTop,
        left: scrollLeft,
        clientHeight: scroller?.clientHeight ?? 0,
        clientWidth: scroller?.clientWidth ?? 0,
      },
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        stickyHeaderHeight,
      },
      patches: activeDiffRegion.patches.slice(0, 12).map((patch, index) => ({
        index,
        startRowIndex: patch.startRowIndex,
        endRowIndex: patch.endRowIndex,
        startCol: patch.startCol,
        endCol: patch.endCol,
        hasBaseSide: patch.hasBaseSide,
        hasMineSide: patch.hasMineSide,
        baseRowStart: patch.baseRowStart,
        baseRowEnd: patch.baseRowEnd,
        mineRowStart: patch.mineRowStart,
        mineRowEnd: patch.mineRowEnd,
      })),
      visibleRowFrameSample,
      resolvedBoxCount: resolvedBoxes.length,
      resolvedBoxes: summarizeOverlayBoxes(resolvedBoxes),
      label: label ?? null,
      pulseNonce,
    });
  }, [
    activeDiffRegion,
    activeSheetName,
    label,
    pulseNonce,
    resolveBoxes,
    scrollRef,
    stickyHeaderHeight,
    viewportHeight,
    viewportWidth,
    visibleRowFrames,
  ]);

  if (!activeDiffRegion || activeDiffRegion.sheetName !== activeSheetName || viewportHeight <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 6,
      }}>
      {/* Vertical positioning layer: places the canvas at the correct
          content-space Y offset. Uses left:0/right:0 so it spans the full
          scrollable content width, giving the inner sticky div room to slide. */}
      <div
        style={{
          position: 'absolute',
          top: canvasAnchorTop,
          left: 0,
          right: 0,
          minWidth: '100%',
          height: canvasHeight,
          pointerEvents: 'none',
        }}>
        {/* Horizontal sticky layer: sticks to the viewport left edge during
            horizontal scroll, exactly like the WorkbookPaneCanvasStrip wrappers.
            This eliminates the 1-frame desync that JS-driven left updates cause. */}
        <div
          style={{
            position: 'sticky',
            left: 0,
            width: viewportWidth,
            height: canvasHeight,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
          <WorkbookDiffRegionOverlay
            scrollRef={scrollRef}
            resolveBoxes={resolveBoxes}
            viewportWidth={viewportWidth}
            viewportHeight={viewportHeight}
            stickyHeaderHeight={stickyHeaderHeight}
            debugRegionId={activeDiffRegion.id}
            pulseNonce={pulseNonce}
            canvasAnchorTop={canvasAnchorTop}
            canvasHeight={canvasHeight}
            onRepositionNeeded={handleRepositionNeeded}
            {...(label ? { label } : {})}
          />
        </div>
      </div>
    </div>
  );
});

export default WorkbookActiveRegionOverlayLayer;
