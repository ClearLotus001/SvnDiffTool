import { useCallback, useEffect, useRef } from 'react';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';

const WORKBOOK_HOVER_OPEN_DELAY_MS = 140;

interface PendingPointerState {
  canvas: HTMLCanvasElement;
  clientX: number;
  clientY: number;
}

export function isWorkbookCanvasPointerInsideHoverAnchor(
  hover: WorkbookCanvasHoverCell | null,
  clientX: number,
  clientY: number,
): boolean {
  if (!hover) return false;
  const rect = hover.anchorRect;
  return clientX >= rect.left
    && clientX < rect.right
    && clientY >= rect.top
    && clientY < rect.bottom;
}

function useWorkbookCanvasHoverController(
  resolveHover: (canvas: HTMLCanvasElement, clientX: number, clientY: number) => WorkbookCanvasHoverCell | null,
  onHoverChange?: (hover: WorkbookCanvasHoverCell | null) => void,
) {
  const resolveHoverRef = useRef(resolveHover);
  const onHoverChangeRef = useRef(onHoverChange);
  const openHoverKeyRef = useRef('');
  const openHoverRef = useRef<WorkbookCanvasHoverCell | null>(null);
  const pendingPointerRef = useRef<PendingPointerState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    resolveHoverRef.current = resolveHover;
  }, [resolveHover]);

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  const clearPendingHover = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const commitHover = useCallback((nextHover: WorkbookCanvasHoverCell | null) => {
    clearPendingHover();
    const nextKey = nextHover?.key ?? '';
    if (openHoverKeyRef.current === nextKey) return;
    openHoverKeyRef.current = nextKey;
    openHoverRef.current = nextHover;
    onHoverChangeRef.current?.(nextHover);
  }, [clearPendingHover]);

  const scheduleHoverResolve = useCallback(() => {
    clearPendingHover();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const pointer = pendingPointerRef.current;
        if (!pointer) return;
        commitHover(resolveHoverRef.current(pointer.canvas, pointer.clientX, pointer.clientY));
      });
    }, WORKBOOK_HOVER_OPEN_DELAY_MS);
  }, [clearPendingHover, commitHover]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (
      isWorkbookCanvasPointerInsideHoverAnchor(openHoverRef.current, event.clientX, event.clientY)
    ) {
      return;
    }

    if (openHoverRef.current) {
      commitHover(null);
    }
    pendingPointerRef.current = {
      canvas: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    scheduleHoverResolve();
  }, [commitHover, scheduleHoverResolve]);

  const clearHover = useCallback(() => {
    if (!openHoverRef.current && !pendingPointerRef.current && hoverTimerRef.current == null && !rafRef.current) {
      return;
    }
    pendingPointerRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    commitHover(null);
  }, [commitHover]);

  const hasActiveHover = useCallback(() => (
    Boolean(openHoverRef.current || pendingPointerRef.current || hoverTimerRef.current != null || rafRef.current)
  ), []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  return {
    handleMouseMove,
    clearHover,
    hasActiveHover,
  };
}

export default useWorkbookCanvasHoverController;
