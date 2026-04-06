import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type {
  WorkbookSelectedCell,
  WorkbookSelectionMode,
  WorkbookSelectionRequest,
} from '@/types';
import { buildWorkbookSelectionKey } from '@/utils/workbook/workbookSelectionState';

const DRAG_SELECTION_THRESHOLD_PX = 4;
const DRAG_AUTO_SCROLL_EDGE_PX = 36;
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 28;
const registeredSelectionCanvasResolvers = new WeakMap<HTMLCanvasElement, (
  clientX: number,
  clientY: number,
  clampToBounds?: boolean,
) => CanvasSelectionHit | null>();

interface CanvasSelectionHit {
  selection: WorkbookSelectedCell;
}

interface SelectionDragState {
  pointerId: number;
  canvas: HTMLCanvasElement;
  initialSelection: WorkbookSelectedCell;
  initialMode: WorkbookSelectionMode;
  originClientX: number;
  originClientY: number;
  lastSelectionKey: string;
  hasDragged: boolean;
}

function getSelectionModeFromPointerEvent(
  event: Pick<React.PointerEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
}

function canDragMergeSelection(
  anchor: WorkbookSelectedCell,
  target: WorkbookSelectedCell,
): boolean {
  if (anchor.sheetName !== target.sheetName || anchor.kind !== target.kind) return false;
  if (anchor.kind === 'cell') return anchor.side === target.side;
  return true;
}

interface UseWorkbookCanvasSelectionInteractionsArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  resolveHit: (x: number, y: number, canvasRect: DOMRect) => CanvasSelectionHit | null;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  clearHover: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDragSelectingChange?: ((active: boolean) => void) | undefined;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeAutoScrollDelta(
  pointerPosition: number,
  viewportStart: number,
  viewportSize: number,
  scrollPosition: number,
  maxScrollPosition: number,
): number {
  if (viewportSize <= 0 || maxScrollPosition <= 0) return 0;

  const edgeThreshold = Math.min(DRAG_AUTO_SCROLL_EDGE_PX, viewportSize / 2);
  const leadingEdge = viewportStart + edgeThreshold;
  if (pointerPosition < leadingEdge && scrollPosition > 0) {
    const ratio = Math.min(1, (leadingEdge - pointerPosition) / edgeThreshold);
    return -Math.max(1, Math.round(DRAG_AUTO_SCROLL_MAX_STEP_PX * ratio * ratio));
  }

  const trailingEdge = viewportStart + viewportSize - edgeThreshold;
  if (pointerPosition > trailingEdge && scrollPosition < maxScrollPosition) {
    const ratio = Math.min(1, (pointerPosition - trailingEdge) / edgeThreshold);
    return Math.max(1, Math.round(DRAG_AUTO_SCROLL_MAX_STEP_PX * ratio * ratio));
  }

  return 0;
}

function findRegisteredSelectionCanvasAtPoint(
  clientX: number,
  clientY: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const element of elements) {
    if (element instanceof HTMLCanvasElement && registeredSelectionCanvasResolvers.has(element)) {
      return element;
    }
  }
  return null;
}

function useWorkbookCanvasSelectionInteractions({
  canvasRef,
  resolveHit,
  onSelectionRequest,
  clearHover,
  scrollRef,
  onDragSelectingChange,
}: UseWorkbookCanvasSelectionInteractionsArgs) {
  const dragStateRef = useRef<SelectionDragState | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pointerDirtyRef = useRef(false);
  const rafRef = useRef(0);

  const clearPendingFrame = useCallback(() => {
    pendingPointerRef.current = null;
    pointerDirtyRef.current = false;
    if (!rafRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const finishDrag = useCallback((pointerId?: number, releaseCapture = true) => {
    const dragState = dragStateRef.current;
    if (!dragState || (pointerId != null && dragState.pointerId !== pointerId)) return;
    clearPendingFrame();
    onDragSelectingChange?.(false);
    if (releaseCapture && dragState.canvas.isConnected && dragState.canvas.hasPointerCapture?.(dragState.pointerId)) {
      dragState.canvas.releasePointerCapture(dragState.pointerId);
    }
    dragStateRef.current = null;
  }, [clearPendingFrame, onDragSelectingChange]);

  const resolveHitAtClientPoint = useCallback((
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    clampToBounds = false,
  ) => {
    const canvasRect = canvas.getBoundingClientRect();
    const maxLocalX = Math.max(0, canvasRect.width - 1);
    const maxLocalY = Math.max(0, canvasRect.height - 1);
    return resolveHit(
      clampToBounds
        ? clamp(clientX - canvasRect.left, 0, maxLocalX)
        : clientX - canvasRect.left,
      clampToBounds
        ? clamp(clientY - canvasRect.top, 0, maxLocalY)
        : clientY - canvasRect.top,
      canvasRect,
    );
  }, [resolveHit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    registeredSelectionCanvasResolvers.set(
      canvas,
      (clientX, clientY, clampToBounds = false) => resolveHitAtClientPoint(
        canvas,
        clientX,
        clientY,
        clampToBounds,
      ),
    );
    return () => {
      registeredSelectionCanvasResolvers.delete(canvas);
    };
  }, [canvasRef, resolveHitAtClientPoint]);

  const applyPendingDragSelection = useCallback(() => {
    const dragState = dragStateRef.current;
    const pointer = pendingPointerRef.current;
    if (!dragState || !pointer) return;

    const resolverCanvas = findRegisteredSelectionCanvasAtPoint(pointer.clientX, pointer.clientY) ?? dragState.canvas;
    const registeredResolver = registeredSelectionCanvasResolvers.get(resolverCanvas);
    const hit = registeredResolver
      ? registeredResolver(pointer.clientX, pointer.clientY, true)
      : resolveHitAtClientPoint(dragState.canvas, pointer.clientX, pointer.clientY, true);
    if (!hit || !canDragMergeSelection(dragState.initialSelection, hit.selection)) return;

    if (!dragState.hasDragged) {
      const deltaX = pointer.clientX - dragState.originClientX;
      const deltaY = pointer.clientY - dragState.originClientY;
      if (Math.hypot(deltaX, deltaY) < DRAG_SELECTION_THRESHOLD_PX) return;
      dragState.hasDragged = true;
      onDragSelectingChange?.(true);
    }

    const nextSelectionKey = buildWorkbookSelectionKey(hit.selection);
    if (nextSelectionKey === dragState.lastSelectionKey) return;

    dragState.lastSelectionKey = nextSelectionKey;
    onSelectionRequest({
      target: hit.selection,
      mode: 'range',
      reason: 'drag',
    });
  }, [onDragSelectingChange, onSelectionRequest, resolveHitAtClientPoint]);

  const applyDragAutoScroll = useCallback(() => {
    const pointer = pendingPointerRef.current;
    const scroller = scrollRef.current;
    if (!pointer || !scroller) return false;

    const scrollerRect = scroller.getBoundingClientRect();
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const deltaX = computeAutoScrollDelta(
      pointer.clientX,
      scrollerRect.left,
      scrollerRect.width,
      scroller.scrollLeft,
      maxScrollLeft,
    );
    const deltaY = computeAutoScrollDelta(
      pointer.clientY,
      scrollerRect.top,
      scrollerRect.height,
      scroller.scrollTop,
      maxScrollTop,
    );

    if (!deltaX && !deltaY) return false;

    const nextScrollLeft = clamp(scroller.scrollLeft + deltaX, 0, maxScrollLeft);
    const nextScrollTop = clamp(scroller.scrollTop + deltaY, 0, maxScrollTop);
    if (nextScrollLeft === scroller.scrollLeft && nextScrollTop === scroller.scrollTop) return false;

    scroller.scrollTo({
      left: nextScrollLeft,
      top: nextScrollTop,
    });
    return true;
  }, [scrollRef]);

  const processDragFrame = useCallback(() => {
    rafRef.current = 0;
    const dragState = dragStateRef.current;
    if (!dragState || dragState.initialMode === 'toggle') return;

    const didScroll = applyDragAutoScroll();
    if (pointerDirtyRef.current || didScroll) {
      pointerDirtyRef.current = false;
      applyPendingDragSelection();
    }

    if (didScroll && dragStateRef.current) {
      rafRef.current = requestAnimationFrame(processDragFrame);
    }
  }, [applyDragAutoScroll, applyPendingDragSelection]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;

    const hit = resolveHitAtClientPoint(event.currentTarget, event.clientX, event.clientY);
    if (!hit) return;

    clearHover();
    const initialMode = getSelectionModeFromPointerEvent(event);
    onSelectionRequest({
      target: hit.selection,
      mode: initialMode,
      reason: 'click',
    });

    dragStateRef.current = {
      pointerId: event.pointerId,
      canvas: event.currentTarget,
      initialSelection: hit.selection,
      initialMode,
      originClientX: event.clientX,
      originClientY: event.clientY,
      lastSelectionKey: buildWorkbookSelectionKey(hit.selection),
      hasDragged: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [clearHover, onSelectionRequest, resolveHitAtClientPoint]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (dragState.initialMode === 'toggle') return;

    pendingPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    pointerDirtyRef.current = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(processDragFrame);
  }, [processDragFrame]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    finishDrag(event.pointerId);
  }, [finishDrag]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    finishDrag(event.pointerId);
  }, [finishDrag]);

  const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    finishDrag(event.pointerId, false);
  }, [finishDrag]);

  useEffect(() => () => {
    finishDrag(undefined, false);
  }, [finishDrag]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    isPointerSelectingRef: dragStateRef,
  };
}

export default useWorkbookCanvasSelectionInteractions;
