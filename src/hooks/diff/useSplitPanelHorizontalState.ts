import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

interface UseSplitPanelHorizontalStateParams {
  enabled: boolean;
  initialSplitRatio: number;
  defaultSplitRatio: number;
  minSplitRatio: number;
  maxSplitRatio: number;
  dividerWidth: number;
  onWillSyncTarget?: ((targetSide: 'left' | 'right') => void) | undefined;
  onDidSync?: (() => void) | undefined;
}

interface UseSplitPanelHorizontalStateResult {
  paneContainerRef: RefObject<HTMLDivElement | null>;
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  splitRatioRef: MutableRefObject<number>;
  isResizingSplitter: boolean;
  horizontalPaneGridTemplateColumns: string;
  syncPaneScrollPosition: (source: 'left' | 'right') => void;
  handleHorizontalPaneScroll: (source: 'left' | 'right') => void;
  handleSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleSplitterKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  resetSplitRatio: () => void;
  restoreSplitRatio: (ratio: number) => number;
}

export function clampSplitRatio(
  value: number,
  minSplitRatio: number,
  maxSplitRatio: number,
  defaultSplitRatio: number,
): number {
  if (!Number.isFinite(value)) return defaultSplitRatio;
  return Math.min(maxSplitRatio, Math.max(minSplitRatio, value));
}

export function useSplitPanelHorizontalState({
  enabled,
  initialSplitRatio,
  defaultSplitRatio,
  minSplitRatio,
  maxSplitRatio,
  dividerWidth,
  onWillSyncTarget,
  onDidSync,
}: UseSplitPanelHorizontalStateParams): UseSplitPanelHorizontalStateResult {
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const leftPaneScrollRef = useRef<HTMLDivElement>(null);
  const rightPaneScrollRef = useRef<HTMLDivElement>(null);
  const splitterCleanupRef = useRef<(() => void) | null>(null);
  const splitRatioRef = useRef(initialSplitRatio);
  const splitRatioFrameRef = useRef(0);
  const pendingSplitRatioRef = useRef(initialSplitRatio);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const syncReleaseFrameRef = useRef(0);
  const [splitRatio, setSplitRatio] = useState(initialSplitRatio);
  const [isResizingSplitter, setIsResizingSplitter] = useState(false);

  const applySplitRatioStyle = useCallback((ratio: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    container.style.setProperty('--split-left', `${(ratio * 100).toFixed(3)}%`);
    container.style.setProperty('--split-right', `${((1 - ratio) * 100).toFixed(3)}%`);
  }, []);

  const resolveClampedRatio = useCallback((ratio: number) => (
    clampSplitRatio(ratio, minSplitRatio, maxSplitRatio, defaultSplitRatio)
  ), [defaultSplitRatio, maxSplitRatio, minSplitRatio]);

  const flushPendingSplitRatio = useCallback(() => {
    if (splitRatioFrameRef.current) {
      cancelAnimationFrame(splitRatioFrameRef.current);
      splitRatioFrameRef.current = 0;
    }
    const nextRatio = resolveClampedRatio(pendingSplitRatioRef.current);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    return nextRatio;
  }, [applySplitRatioStyle, resolveClampedRatio]);

  const queueSplitRatioUpdate = useCallback((ratio: number) => {
    const nextRatio = resolveClampedRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    if (splitRatioFrameRef.current) return;
    splitRatioFrameRef.current = requestAnimationFrame(() => {
      splitRatioFrameRef.current = 0;
      const frameRatio = resolveClampedRatio(pendingSplitRatioRef.current);
      splitRatioRef.current = frameRatio;
      applySplitRatioStyle(frameRatio);
    });
  }, [applySplitRatioStyle, resolveClampedRatio]);

  const restoreSplitRatio = useCallback((ratio: number) => {
    const nextRatio = resolveClampedRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    setSplitRatio((previous) => (Math.abs(previous - nextRatio) < 0.001 ? previous : nextRatio));
    return nextRatio;
  }, [applySplitRatioStyle, resolveClampedRatio]);

  const updateSplitRatioFromClientX = useCallback((clientX: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= dividerWidth) return;
    const nextRatio = resolveClampedRatio((clientX - rect.left) / rect.width);
    queueSplitRatioUpdate(nextRatio);
  }, [dividerWidth, queueSplitRatioUpdate, resolveClampedRatio]);

  const stopSplitterResize = useCallback(() => {
    splitterCleanupRef.current?.();
    splitterCleanupRef.current = null;
    setIsResizingSplitter(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopSplitterResize();
    updateSplitRatioFromClientX(event.clientX);
    setIsResizingSplitter(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSplitRatioFromClientX(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      const finalRatio = flushPendingSplitRatio();
      setSplitRatio((previous) => (Math.abs(previous - finalRatio) < 0.001 ? previous : finalRatio));
      stopSplitterResize();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    splitterCleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [flushPendingSplitRatio, stopSplitterResize, updateSplitRatioFromClientX]);

  const handleSplitterKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      restoreSplitRatio(splitRatioRef.current - 0.02);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      restoreSplitRatio(splitRatioRef.current + 0.02);
    }
  }, [restoreSplitRatio]);

  const syncPaneScrollPosition = useCallback((source: 'left' | 'right') => {
    if (!enabled) return;
    const from = source === 'left' ? leftPaneScrollRef.current : rightPaneScrollRef.current;
    const to = source === 'left' ? rightPaneScrollRef.current : leftPaneScrollRef.current;
    const targetSide = source === 'left' ? 'right' : 'left';
    if (!from || !to) return;
    if (syncOwnerRef.current && syncOwnerRef.current !== source) return;
    const syncTop = Math.abs(to.scrollTop - from.scrollTop) > 1;
    const syncLeft = Math.abs(to.scrollLeft - from.scrollLeft) > 1;
    if (!syncTop && !syncLeft) return;

    syncOwnerRef.current = source;
    onWillSyncTarget?.(targetSide);
    to.scrollTo({
      top: syncTop ? from.scrollTop : to.scrollTop,
      left: syncLeft ? from.scrollLeft : to.scrollLeft,
      behavior: 'auto',
    });
    onDidSync?.();

    if (syncReleaseFrameRef.current) cancelAnimationFrame(syncReleaseFrameRef.current);
    syncReleaseFrameRef.current = requestAnimationFrame(() => {
      syncReleaseFrameRef.current = 0;
      syncOwnerRef.current = null;
    });
  }, [enabled, onDidSync, onWillSyncTarget]);

  const handleHorizontalPaneScroll = useCallback((source: 'left' | 'right') => {
    syncPaneScrollPosition(source);
  }, [syncPaneScrollPosition]);

  const resetSplitRatio = useCallback(() => {
    restoreSplitRatio(defaultSplitRatio);
  }, [defaultSplitRatio, restoreSplitRatio]);

  const horizontalPaneGridTemplateColumns = useMemo(() => (
    `minmax(0, calc(var(--split-left, 50%) - ${dividerWidth / 2}px)) ${dividerWidth}px minmax(0, calc(var(--split-right, 50%) - ${dividerWidth / 2}px))`
  ), [dividerWidth]);

  useEffect(() => () => {
    if (splitRatioFrameRef.current) cancelAnimationFrame(splitRatioFrameRef.current);
    if (syncReleaseFrameRef.current) cancelAnimationFrame(syncReleaseFrameRef.current);
    stopSplitterResize();
  }, [stopSplitterResize]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
    pendingSplitRatioRef.current = splitRatio;
    applySplitRatioStyle(splitRatio);
  }, [applySplitRatioStyle, splitRatio]);

  return {
    paneContainerRef,
    leftPaneScrollRef,
    rightPaneScrollRef,
    splitRatio,
    splitRatioRef,
    isResizingSplitter,
    horizontalPaneGridTemplateColumns,
    syncPaneScrollPosition,
    handleHorizontalPaneScroll,
    handleSplitterPointerDown,
    handleSplitterKeyDown,
    resetSplitRatio,
    restoreSplitRatio,
  };
}
