import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookDiffRegion } from '@/types';
import {
  buildWorkbookPatchOverlayBoxes,
  buildWorkbookRegionOutlineOverlayBoxes,
  type WorkbookRegionOverlayBoundsMode,
} from '@/utils/workbook/workbookRegionOverlay';
import { isWorkbookDebugEnabled, workbookDebugLog } from '@/utils/workbook/workbookDebug';
import WorkbookDiffRegionOverlay, {
  mergeWorkbookDiffRegionOverlayBoxes,
} from '@/components/workbook/WorkbookDiffRegionOverlay';

interface WorkbookActiveRegionOverlayLayerProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  viewportWidth: number;
  viewportHeight: number;
  stickyHeaderHeight: number;
  activeDiffRegion: WorkbookDiffRegion | null;
  activeSheetName: string | null;
  visibleRowFrames: Map<number, { top: number; height: number }>;
  columnLayoutByColumn: ReadonlyMap<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  resolvePatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  fallbackBoundsModes: WorkbookRegionOverlayBoundsMode[];
  resolveFocusPatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  filterPatch?: ((patch: WorkbookDiffRegion['patches'][number]) => boolean) | undefined;
  pulseTriggerKey?: string | null;
  label?: string;
  deemphasizeOutline?: boolean;
}

const MIN_OVERLAY_BOX_SIZE = 4;
const OVERLAY_DEBUG_THROTTLE_MS = 120;

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

export interface WorkbookActiveRegionOverlayBoxSet {
  fillBoxes: ReturnType<typeof mergeWorkbookDiffRegionOverlayBoxes>;
  outlineBoxes: ReturnType<typeof mergeWorkbookDiffRegionOverlayBoxes>;
  focusOutlineBoxes: ReturnType<typeof mergeWorkbookDiffRegionOverlayBoxes>;
}

interface BuildWorkbookActiveRegionOverlayBoxSetParams {
  activeDiffRegion: WorkbookDiffRegion | null;
  activeSheetName: string | null;
  visibleRows: Array<[number, { top: number; height: number }]>;
  columnLayoutByColumn: ReadonlyMap<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  scrollLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  viewportWidth: number;
  resolvePatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  fallbackBoundsModes: WorkbookRegionOverlayBoundsMode[];
  resolveFocusPatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  filterPatch?: ((patch: WorkbookDiffRegion['patches'][number]) => boolean) | undefined;
}

function filterRenderableOverlayBoxes(boxes: ReturnType<typeof mergeWorkbookDiffRegionOverlayBoxes>) {
  return boxes.filter((box) => box.width > MIN_OVERLAY_BOX_SIZE && box.height > MIN_OVERLAY_BOX_SIZE);
}

export function buildWorkbookActiveRegionOverlayBoxSet({
  activeDiffRegion,
  activeSheetName,
  visibleRows,
  columnLayoutByColumn,
  contentLeft,
  scrollLeft,
  frozenWidth,
  freezeColumnCount,
  viewportWidth,
  resolvePatchBoundsModes,
  fallbackBoundsModes,
  resolveFocusPatchBoundsModes,
  filterPatch,
}: BuildWorkbookActiveRegionOverlayBoxSetParams): WorkbookActiveRegionOverlayBoxSet {
  if (
    !activeDiffRegion
    || activeDiffRegion.sheetName !== activeSheetName
    || visibleRows.length === 0
    || viewportWidth <= 0
  ) {
    return { fillBoxes: [], outlineBoxes: [], focusOutlineBoxes: [] };
  }

  const fillBoxes = filterRenderableOverlayBoxes(mergeWorkbookDiffRegionOverlayBoxes(buildWorkbookPatchOverlayBoxes({
    region: activeDiffRegion,
    visibleRows,
    columnLayoutByColumn,
    contentLeft,
    scrollLeft,
    frozenWidth,
    freezeColumnCount,
    resolvePatchBoundsModes,
    ...(filterPatch ? { filterPatch } : {}),
    keyPrefix: `${activeDiffRegion.id}:patch`,
  })));

  const outlineBoxes = fillBoxes.length > 0
    ? fillBoxes
    : filterRenderableOverlayBoxes(mergeWorkbookDiffRegionOverlayBoxes(buildWorkbookRegionOutlineOverlayBoxes({
      region: activeDiffRegion,
      visibleRows,
      columnLayoutByColumn,
      contentLeft,
      scrollLeft,
      frozenWidth,
      freezeColumnCount,
      resolvePatchBoundsModes,
      fallbackBoundsModes,
      ...(filterPatch ? { filterPatch } : {}),
      keyPrefix: `${activeDiffRegion.id}:outline`,
    })));

  const focusOutlineBoxes = filterRenderableOverlayBoxes(mergeWorkbookDiffRegionOverlayBoxes(buildWorkbookPatchOverlayBoxes({
    region: activeDiffRegion,
    visibleRows,
    columnLayoutByColumn,
    contentLeft,
    scrollLeft,
    frozenWidth,
    freezeColumnCount,
    resolvePatchBoundsModes: resolveFocusPatchBoundsModes,
    keyPrefix: `${activeDiffRegion.id}:focus`,
  })));

  return {
    fillBoxes,
    outlineBoxes,
    focusOutlineBoxes,
  };
}

const WorkbookActiveRegionOverlayLayer = memo(({
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
  filterPatch,
  pulseTriggerKey = null,
  label,
  deemphasizeOutline = false,
}: WorkbookActiveRegionOverlayLayerProps) => {
  const [canvasAnchorTop, setCanvasAnchorTop] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const lastDebugLogAtRef = useRef(0);

  useEffect(() => {
    const scrollTop = Math.max(0, scrollRef.current?.scrollTop ?? 0);
    const anchor = computeCanvasAnchor(scrollTop, viewportHeight);
    setCanvasAnchorTop(anchor.anchorTop);
    setCanvasHeight(anchor.canvasHeight);
  }, [scrollRef, viewportHeight]);

  const sortedVisibleRows = useMemo(
    () => Array.from(visibleRowFrames.entries()).sort((left, right) => left[0] - right[0]),
    [visibleRowFrames],
  );

  const resolveBoxSet = useCallback((scrollLeft: number) => {
    return buildWorkbookActiveRegionOverlayBoxSet({
      activeDiffRegion,
      activeSheetName,
      visibleRows: sortedVisibleRows,
      columnLayoutByColumn,
      contentLeft,
      scrollLeft,
      frozenWidth,
      freezeColumnCount,
      viewportWidth,
      resolvePatchBoundsModes,
      fallbackBoundsModes,
      resolveFocusPatchBoundsModes,
      ...(filterPatch ? { filterPatch } : {}),
    });
  }, [
    activeDiffRegion,
    activeSheetName,
    columnLayoutByColumn,
    contentLeft,
    fallbackBoundsModes,
    filterPatch,
    freezeColumnCount,
    frozenWidth,
    resolveFocusPatchBoundsModes,
    resolvePatchBoundsModes,
    sortedVisibleRows,
    viewportWidth,
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
    const resolvedBoxSet = resolveBoxSet(scrollLeft);
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
      fillBoxCount: resolvedBoxSet.fillBoxes.length,
      fillBoxes: summarizeOverlayBoxes(resolvedBoxSet.fillBoxes),
      outlineBoxCount: resolvedBoxSet.outlineBoxes.length,
      outlineBoxes: summarizeOverlayBoxes(resolvedBoxSet.outlineBoxes),
      focusOutlineBoxCount: resolvedBoxSet.focusOutlineBoxes.length,
      focusOutlineBoxes: summarizeOverlayBoxes(resolvedBoxSet.focusOutlineBoxes),
      label: label ?? null,
      pulseTriggerKey,
    });
  }, [
    activeDiffRegion,
    activeSheetName,
    label,
    pulseTriggerKey,
    resolveBoxSet,
    scrollRef,
    stickyHeaderHeight,
    viewportHeight,
    viewportWidth,
    visibleRowFrames,
  ]);

  if (!activeDiffRegion || activeDiffRegion.sheetName !== activeSheetName || viewportHeight <= 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[6]">
      {/* Vertical positioning layer: places the canvas at the correct
          content-space Y offset. Uses left:0/right:0 so it spans the full
          scrollable content width, giving the inner sticky div room to slide. */}
      <div
        className="absolute left-0 right-0 min-w-full pointer-events-none"
        style={{ top: canvasAnchorTop, height: canvasHeight }}>
        {/* Horizontal sticky layer: sticks to the viewport left edge during
            horizontal scroll, exactly like the WorkbookPaneCanvasStrip wrappers.
            This eliminates the 1-frame desync that JS-driven left updates cause. */}
        <div
          className="sticky left-0 overflow-hidden pointer-events-none"
          style={{ width: viewportWidth, height: canvasHeight }}>
          <WorkbookDiffRegionOverlay
            scrollRef={scrollRef}
            resolveBoxSet={resolveBoxSet}
            viewportWidth={viewportWidth}
            viewportHeight={viewportHeight}
            stickyHeaderHeight={stickyHeaderHeight}
            debugRegionId={activeDiffRegion.id}
            pulseTriggerKey={pulseTriggerKey}
            deemphasizeOutline={deemphasizeOutline}
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
