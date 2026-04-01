import { useCallback, useEffect, useRef } from 'react';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';

const WORKBOOK_HOVER_OPEN_DELAY_MS = 140;

interface PendingPointerState {
  canvas: HTMLCanvasElement;
  clientX: number;
  clientY: number;
}

function useWorkbookCanvasHoverController(
  resolveHover: (canvas: HTMLCanvasElement, clientX: number, clientY: number) => WorkbookCanvasHoverCell | null,
  onHoverChange?: (hover: WorkbookCanvasHoverCell | null) => void,
) {
  const resolveHoverRef = useRef(resolveHover);
  const onHoverChangeRef = useRef(onHoverChange);
  const openHoverKeyRef = useRef('');
  const pendingHoverRef = useRef<WorkbookCanvasHoverCell | null>(null);
  const pendingHoverKeyRef = useRef('');
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
    pendingHoverRef.current = null;
    pendingHoverKeyRef.current = '';
  }, []);

  const commitHover = useCallback((nextHover: WorkbookCanvasHoverCell | null) => {
    clearPendingHover();
    const nextKey = nextHover?.key ?? '';
    if (openHoverKeyRef.current === nextKey) return;
    openHoverKeyRef.current = nextKey;
    onHoverChangeRef.current?.(nextHover);
  }, [clearPendingHover]);

  const scheduleHover = useCallback((nextHover: WorkbookCanvasHoverCell | null) => {
    const nextKey = nextHover?.key ?? '';
    if (nextKey === openHoverKeyRef.current) {
      clearPendingHover();
      return;
    }

    if (!nextHover) {
      commitHover(null);
      return;
    }

    if (openHoverKeyRef.current) {
      commitHover(nextHover);
      return;
    }

    if (pendingHoverKeyRef.current === nextKey) return;

    clearPendingHover();
    pendingHoverRef.current = nextHover;
    pendingHoverKeyRef.current = nextKey;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      const pendingHover = pendingHoverRef.current;
      if (!pendingHover) return;
      commitHover(pendingHover);
    }, WORKBOOK_HOVER_OPEN_DELAY_MS);
  }, [clearPendingHover, commitHover]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    pendingPointerRef.current = {
      canvas: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const pointer = pendingPointerRef.current;
      if (!pointer) return;
      scheduleHover(resolveHoverRef.current(pointer.canvas, pointer.clientX, pointer.clientY));
    });
  }, [scheduleHover]);

  const clearHover = useCallback(() => {
    pendingPointerRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    commitHover(null);
  }, [commitHover]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  return {
    handleMouseMove,
    clearHover,
  };
}

export default useWorkbookCanvasHoverController;
