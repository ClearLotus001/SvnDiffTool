import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { scrollElementForNavigation } from '@/utils/navigation/animatedScroll';

export interface VariableVirtualDebugInfo {
  viewportHeight: number;
  overscan: number;
  rangeUpdates: number;
  lastCalcMs: number;
}

export interface VariableVirtualResult {
  totalH: number;
  startIdx: number;
  endIdx: number;
  offsetTop: number;
  scrollToIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  debug: VariableVirtualDebugInfo;
}

interface UseVariableVirtualOptions {
  overscanMin?: number;
  overscanFactor?: number;
  syncKey?: string | number | null;
  getScrollFollowers?: (() => readonly HTMLElement[]) | undefined;
}

const DEFAULT_OVERSCAN_MIN = 12;
const DEFAULT_OVERSCAN_FACTOR = 1.5;

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function findIndexForOffset(prefixSums: number[], offset: number): number {
  let low = 0;
  let high = prefixSums.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((prefixSums[mid] ?? 0) <= offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
}

function computeVariableRange(params: {
  heightsLength: number;
  prefixSums: number[];
  totalH: number;
  averageHeight: number;
  scrollTop: number;
  viewH: number;
  overscanMin: number;
  overscanFactor: number;
}) {
  const {
    heightsLength,
    prefixSums,
    totalH,
    averageHeight,
    scrollTop,
    viewH,
    overscanMin,
    overscanFactor,
  } = params;
  const maxScrollTop = Math.max(0, totalH - Math.max(0, viewH));
  const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
  const visibleItemCount = Math.max(1, Math.ceil(viewH / Math.max(averageHeight, 1)));
  const overscan = Math.max(overscanMin, Math.ceil(visibleItemCount * overscanFactor));
  const overscanPx = overscan * averageHeight;
  const startOffset = Math.max(0, clampedScrollTop - overscanPx);
  const endOffset = Math.min(totalH, clampedScrollTop + viewH + overscanPx);
  const startIdx = Math.max(0, Math.min(heightsLength, findIndexForOffset(prefixSums, startOffset)));
  const endIdx = Math.max(
    startIdx,
    Math.min(heightsLength, findIndexForOffset(prefixSums, endOffset) + 1),
  );
  const offsetTop = prefixSums[startIdx] ?? 0;

  return {
    startIdx,
    endIdx,
    offsetTop,
    overscan,
  };
}

export function useVariableVirtual(
  heights: number[],
  scrollRef: RefObject<HTMLDivElement | null>,
  options: UseVariableVirtualOptions = {},
): VariableVirtualResult {
  const overscanMin = options.overscanMin ?? DEFAULT_OVERSCAN_MIN;
  const overscanFactor = options.overscanFactor ?? DEFAULT_OVERSCAN_FACTOR;
  const syncKey = options.syncKey ?? null;
  const getScrollFollowers = options.getScrollFollowers;
  const [viewH, setViewH] = useState(600);
  const [rangeState, setRangeState] = useState({ startIdx: 0, endIdx: 0, offsetTop: 0, overscan: overscanMin });
  const latestScrollTopRef = useRef(0);
  const viewHRef = useRef(600);
  const rafRef = useRef<number>(0);
  const rangeUpdateCountRef = useRef(1);
  const lastCalcMsRef = useRef(0);
  const rangeRef = useRef(rangeState);
  const syncKeyRef = useRef(syncKey);

  const prefixSums = useMemo(() => {
    const sums = new Array<number>(heights.length + 1).fill(0);
    for (let index = 0; index < heights.length; index += 1) {
      sums[index + 1] = sums[index]! + (heights[index] ?? 0);
    }
    return sums;
  }, [heights]);

  const totalH = prefixSums[prefixSums.length - 1] ?? 0;
  const averageHeight = heights.length > 0 ? totalH / heights.length : 21;

  const applyRange = useCallback((nextScrollTop: number, nextViewH: number) => {
    const calcStart = getNow();
    const next = computeVariableRange({
      heightsLength: heights.length,
      prefixSums,
      totalH,
      averageHeight,
      scrollTop: nextScrollTop,
      viewH: nextViewH,
      overscanMin,
      overscanFactor,
    });
    lastCalcMsRef.current = getNow() - calcStart;

    const prev = rangeRef.current;
    if (
      prev.startIdx === next.startIdx
      && prev.endIdx === next.endIdx
      && prev.offsetTop === next.offsetTop
      && prev.overscan === next.overscan
    ) {
      return;
    }

    rangeRef.current = next;
    rangeUpdateCountRef.current += 1;
    setRangeState(next);
  }, [averageHeight, heights.length, overscanFactor, overscanMin, prefixSums, totalH]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const nextViewH = Math.max(0, Math.round(entries[0]?.contentRect.height ?? el.clientHeight));
      viewHRef.current = nextViewH;
      setViewH(prev => (prev === nextViewH ? prev : nextViewH));
      applyRange(latestScrollTopRef.current, nextViewH);
    });
    ro.observe(el);

    const nextViewH = Math.max(0, el.clientHeight);
    viewHRef.current = nextViewH;
    setViewH(prev => (prev === nextViewH ? prev : nextViewH));
    applyRange(Math.max(0, Math.round(el.scrollTop)), nextViewH);

    return () => ro.disconnect();
  }, [applyRange, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      latestScrollTopRef.current = Math.max(0, Math.round(el.scrollTop));
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyRange(latestScrollTopRef.current, viewHRef.current);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyRange, scrollRef]);

  useEffect(() => {
    applyRange(latestScrollTopRef.current, viewHRef.current);
  }, [applyRange]);

  useLayoutEffect(() => {
    if (syncKeyRef.current === syncKey) return;
    syncKeyRef.current = syncKey;
    latestScrollTopRef.current = 0;
    const el = scrollRef.current;
    if (el && el.scrollTop !== 0) {
      scrollElementForNavigation(el, {
        top: 0,
        behavior: 'auto',
        linkedElements: getScrollFollowers?.(),
      });
    }
    applyRange(0, viewHRef.current);
  }, [applyRange, getScrollFollowers, scrollRef, syncKey]);

  const effectiveRangeState = useMemo(() => (
    syncKeyRef.current !== syncKey
      ? computeVariableRange({
        heightsLength: heights.length,
        prefixSums,
        totalH,
        averageHeight,
        scrollTop: 0,
        viewH: viewHRef.current,
        overscanMin,
        overscanFactor,
      })
      : rangeState
  ), [averageHeight, heights.length, overscanFactor, overscanMin, prefixSums, rangeState, syncKey, totalH]);

  const scrollToIndex = useCallback((idx: number, align: 'start' | 'center' = 'start', behavior: 'auto' | 'smooth' | 'smart' = 'smart') => {
    const el = scrollRef.current;
    if (!el) return;

    const itemTop = prefixSums[Math.max(0, Math.min(idx, heights.length))] ?? 0;
    const itemHeight = heights[Math.max(0, Math.min(idx, heights.length - 1))] ?? averageHeight;
    const offset = align === 'center'
      ? Math.max(0, (viewH / 2) - (itemHeight / 2))
      : 60;
    const nextTop = Math.max(0, itemTop - offset);
    scrollElementForNavigation(el, {
      top: nextTop,
      behavior,
      linkedElements: getScrollFollowers?.(),
    });
  }, [averageHeight, getScrollFollowers, heights, prefixSums, scrollRef, viewH]);

  return {
    totalH,
    startIdx: effectiveRangeState.startIdx,
    endIdx: effectiveRangeState.endIdx,
    offsetTop: effectiveRangeState.offsetTop,
    scrollToIndex,
    debug: {
      viewportHeight: viewH,
      overscan: effectiveRangeState.overscan,
      rangeUpdates: rangeUpdateCountRef.current,
      lastCalcMs: lastCalcMsRef.current,
    },
  };
}
