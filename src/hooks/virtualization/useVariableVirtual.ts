import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

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

export function useVariableVirtual(
  heights: number[],
  scrollRef: RefObject<HTMLDivElement>,
  options: UseVariableVirtualOptions = {},
): VariableVirtualResult {
  const overscanMin = options.overscanMin ?? DEFAULT_OVERSCAN_MIN;
  const overscanFactor = options.overscanFactor ?? DEFAULT_OVERSCAN_FACTOR;
  const [viewH, setViewH] = useState(600);
  const [rangeState, setRangeState] = useState({ startIdx: 0, endIdx: 0, offsetTop: 0, overscan: overscanMin });
  const latestScrollTopRef = useRef(0);
  const viewHRef = useRef(600);
  const rafRef = useRef<number>(0);
  const rangeUpdateCountRef = useRef(1);
  const lastCalcMsRef = useRef(0);
  const rangeRef = useRef(rangeState);

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
    const visibleItemCount = Math.max(1, Math.ceil(nextViewH / Math.max(averageHeight, 1)));
    const overscan = Math.max(overscanMin, Math.ceil(visibleItemCount * overscanFactor));
    const overscanPx = overscan * averageHeight;
    const startOffset = Math.max(0, nextScrollTop - overscanPx);
    const endOffset = Math.min(totalH, nextScrollTop + nextViewH + overscanPx);
    const startIdx = Math.max(0, Math.min(heights.length, findIndexForOffset(prefixSums, startOffset)));
    const endIdx = Math.max(
      startIdx,
      Math.min(heights.length, findIndexForOffset(prefixSums, endOffset) + 1),
    );
    const offsetTop = prefixSums[startIdx] ?? 0;
    lastCalcMsRef.current = getNow() - calcStart;

    const prev = rangeRef.current;
    if (
      prev.startIdx === startIdx
      && prev.endIdx === endIdx
      && prev.offsetTop === offsetTop
      && prev.overscan === overscan
    ) {
      return;
    }

    const next = { startIdx, endIdx, offsetTop, overscan };
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

  const scrollToIndex = useCallback((idx: number, align: 'start' | 'center' = 'start', behavior: 'auto' | 'smooth' | 'smart' = 'smart') => {
    const el = scrollRef.current;
    if (!el) return;

    const itemTop = prefixSums[Math.max(0, Math.min(idx, heights.length))] ?? 0;
    const itemHeight = heights[Math.max(0, Math.min(idx, heights.length - 1))] ?? averageHeight;
    const offset = align === 'center'
      ? Math.max(0, (viewH / 2) - (itemHeight / 2))
      : 60;
    const nextTop = Math.max(0, itemTop - offset);
    const distance = Math.abs(el.scrollTop - nextTop);
    const resolvedBehavior = behavior === 'smart'
      ? (distance > Math.max(viewH * 4, itemHeight * 200) ? 'auto' : 'smooth')
      : behavior;
    el.scrollTo({
      top: nextTop,
      behavior: resolvedBehavior,
    });
  }, [averageHeight, heights, prefixSums, scrollRef, viewH]);

  return {
    totalH,
    startIdx: rangeState.startIdx,
    endIdx: rangeState.endIdx,
    offsetTop: rangeState.offsetTop,
    scrollToIndex,
    debug: {
      viewportHeight: viewH,
      overscan: rangeState.overscan,
      rangeUpdates: rangeUpdateCountRef.current,
      lastCalcMs: lastCalcMsRef.current,
    },
  };
}
