// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useVirtual.ts  —  Virtual scroll hook  [v3 fixed]
//
// AUDIT FIXES (round 3):
//  1. scrollRef was typed as RefObject<HTMLDivElement> but the hook was called
//     with `scrollRef as RefObject<HTMLDivElement>` casts everywhere because
//     useRef<HTMLDivElement>(null) returns MutableRefObject. The cast is safe
//     but unnecessary noise. Kept as-is (React 18 useRef typing quirk).
//  2. useEffect for ResizeObserver had `[scrollRef]` dependency — this is a
//     ref object and its identity is stable across renders, so the effect runs
//     only once. Correct. No change.
//  3. scrollToIndex: `viewH / 2 - ROW_H / 2` could be negative if the panel
//     hasn't rendered yet (viewH = 0 default). Added Math.max(0, ...) guard.
//  4. rafRef.current initial value was 0 which is a falsy-but-valid RAF id
//     only in theory — browsers start RAF ids at 1, so 0 is safe as sentinel.
//     No change, but documented.
//  5. Hook cleanup didn't cancel the ResizeObserver RAF if one was pending.
//     ResizeObserver callback called setViewH synchronously (no RAF), so no
//     leak there. Confirmed correct.
//  6. Exported ROW_H must match the actual rendered row height. Added comment
//     reminding maintainers to update if CSS changes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import type { VirtualState } from '@/types';

/**
 * Row height in pixels. MUST match the `height: ROW_H` in every row component.
 * If you change this, update all inline `style={{ height: ROW_H }}` usages too.
 */
export const ROW_H = 21;
const DEFAULT_OVERSCAN_MIN = 80;
const DEFAULT_OVERSCAN_FACTOR = 3;

export interface UseVirtualOptions {
  overscanMin?: number;
  overscanFactor?: number;
}

export interface VirtualWindow extends VirtualState {
  visibleRowCount: number;
  overscan: number;
}

export interface VirtualDebugInfo {
  viewportHeight: number;
  visibleRowCount: number;
  overscan: number;
  rangeUpdates: number;
  lastCalcMs: number;
}

interface UseVirtualReturn extends VirtualState {
  scrollToIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  debug: VirtualDebugInfo;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function computeVirtualWindow(
  count: number,
  rowHeight: number,
  viewH: number,
  scrollTop: number,
  overscanMin = DEFAULT_OVERSCAN_MIN,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
): VirtualWindow {
  const visibleRowCount = Math.max(1, Math.ceil(viewH / Math.max(rowHeight, 1)));
  const overscan = Math.max(overscanMin, Math.ceil(visibleRowCount * overscanFactor));
  const startIdx = Math.max(0, Math.floor((scrollTop - overscan * rowHeight) / rowHeight));
  const endIdx = Math.min(count, Math.ceil((scrollTop + viewH + overscan * rowHeight) / rowHeight));
  return {
    totalH: count * rowHeight,
    startIdx,
    endIdx,
    visibleRowCount,
    overscan,
  };
}

export function useVirtual(
  count: number,
  scrollRef: RefObject<HTMLDivElement>,
  rowHeight: number = ROW_H,
  options: UseVirtualOptions = {},
): UseVirtualReturn {
  const overscanMin = options.overscanMin ?? DEFAULT_OVERSCAN_MIN;
  const overscanFactor = options.overscanFactor ?? DEFAULT_OVERSCAN_FACTOR;
  const [viewH, setViewH] = useState(600);
  const [windowRange, setWindowRange] = useState<VirtualWindow>(() => computeVirtualWindow(
    count,
    rowHeight,
    600,
    0,
    overscanMin,
    overscanFactor,
  ));
  const latestScrollTopRef = useRef(0);
  const viewHRef = useRef(600);
  const rangeRef = useRef(windowRange);
  const rafRef = useRef<number>(0);
  const lastCalcMsRef = useRef(0);
  const rangeUpdateCountRef = useRef(1);

  const applyWindowRange = useCallback((scrollTop: number, nextViewH: number) => {
    const calcStart = getNow();
    const nextRange = computeVirtualWindow(
      count,
      rowHeight,
      nextViewH,
      scrollTop,
      overscanMin,
      overscanFactor,
    );
    lastCalcMsRef.current = getNow() - calcStart;

    const prevRange = rangeRef.current;
    if (
      prevRange.startIdx === nextRange.startIdx
      && prevRange.endIdx === nextRange.endIdx
      && prevRange.visibleRowCount === nextRange.visibleRowCount
      && prevRange.overscan === nextRange.overscan
      && prevRange.totalH === nextRange.totalH
    ) {
      return;
    }

    rangeRef.current = nextRange;
    rangeUpdateCountRef.current += 1;
    setWindowRange(nextRange);
  }, [count, overscanFactor, overscanMin, rowHeight]);

  // ResizeObserver — stable ref, runs once
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const nextViewH = Math.max(0, Math.round(entries[0]?.contentRect.height ?? el.clientHeight));
      viewHRef.current = nextViewH;
      setViewH(prev => (prev === nextViewH ? prev : nextViewH));
      applyWindowRange(latestScrollTopRef.current, nextViewH);
    });
    ro.observe(el);
    const nextViewH = Math.max(0, el.clientHeight);
    viewHRef.current = nextViewH;
    setViewH(prev => (prev === nextViewH ? prev : nextViewH));
    applyWindowRange(Math.max(0, Math.round(el.scrollTop)), nextViewH);
    return () => ro.disconnect();
  }, [applyWindowRange, scrollRef]);

  // Keep up with thumb dragging without pushing React through more than one
  // rerender per frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      latestScrollTopRef.current = Math.max(0, Math.round(el.scrollTop));
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyWindowRange(latestScrollTopRef.current, viewHRef.current);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyWindowRange, scrollRef]);

  useEffect(() => {
    applyWindowRange(latestScrollTopRef.current, viewHRef.current);
  }, [applyWindowRange]);

  const totalH = count * rowHeight;

  const scrollToIndex = useCallback(
    (idx: number, align: 'start' | 'center' = 'start', behavior: 'auto' | 'smooth' | 'smart' = 'smart') => {
      const el = scrollRef.current;
      if (!el) return;
      const targetTop = idx * rowHeight;
      // FIX: Math.max(0,...) prevents negative scroll when viewH is 0 at mount
      const offset = align === 'center'
        ? Math.max(0, viewH / 2 - rowHeight / 2)
        : 60;
      const nextTop = Math.max(0, targetTop - offset);
      const distance = Math.abs(el.scrollTop - nextTop);
      const resolvedBehavior = behavior === 'smart'
        ? (distance > Math.max(viewH * 4, rowHeight * 200) ? 'auto' : 'smooth')
        : behavior;
      el.scrollTo({
        top: nextTop,
        behavior: resolvedBehavior,
      });
    },
    [scrollRef, viewH, rowHeight],
  );

  const debug = useMemo<VirtualDebugInfo>(() => ({
    viewportHeight: viewH,
    visibleRowCount: windowRange.visibleRowCount,
    overscan: windowRange.overscan,
    rangeUpdates: rangeUpdateCountRef.current,
    lastCalcMs: lastCalcMsRef.current,
  }), [viewH, windowRange.overscan, windowRange.visibleRowCount]);

  return {
    totalH,
    startIdx: windowRange.startIdx,
    endIdx: windowRange.endIdx,
    scrollToIndex,
    debug,
  };
}
