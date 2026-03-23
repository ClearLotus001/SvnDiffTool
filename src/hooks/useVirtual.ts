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

import { useState, useEffect, useCallback, RefObject, useRef } from 'react';
import type { VirtualState } from '../types';

/**
 * Row height in pixels. MUST match the `height: ROW_H` in every row component.
 * If you change this, update all inline `style={{ height: ROW_H }}` usages too.
 */
export const ROW_H = 21;
const OVERSCAN_MIN = 80;

interface UseVirtualReturn extends VirtualState {
  scrollToIndex: (idx: number, align?: 'start' | 'center') => void;
}

export function useVirtual(
  count: number,
  scrollRef: RefObject<HTMLDivElement>,
  rowHeight: number = ROW_H,
): UseVirtualReturn {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH]         = useState(600);
  const latestScrollTopRef = useRef(0);
  const rafRef = useRef<number>(0);

  // ResizeObserver — stable ref, runs once
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const nextViewH = Math.max(0, Math.round(entries[0]?.contentRect.height ?? el.clientHeight));
      setViewH(prev => (prev === nextViewH ? prev : nextViewH));
    });
    ro.observe(el);
    setViewH(prev => {
      const nextViewH = Math.max(0, el.clientHeight);
      return prev === nextViewH ? prev : nextViewH;
    });
    return () => ro.disconnect();
  }, [scrollRef]);

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
        setScrollTop(prev => (prev === latestScrollTopRef.current ? prev : latestScrollTopRef.current));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef]);

  const totalH  = count * rowHeight;
  const visibleRowCount = Math.max(1, Math.ceil(viewH / Math.max(rowHeight, 1)));
  const overscan = Math.max(OVERSCAN_MIN, visibleRowCount * 3);
  const startIdx = Math.max(0, Math.floor((scrollTop - overscan * rowHeight) / rowHeight));
  const endIdx   = Math.min(count, Math.ceil((scrollTop + viewH + overscan * rowHeight) / rowHeight));

  const scrollToIndex = useCallback(
    (idx: number, align: 'start' | 'center' = 'start') => {
      const el = scrollRef.current;
      if (!el) return;
      const targetTop = idx * rowHeight;
      // FIX: Math.max(0,...) prevents negative scroll when viewH is 0 at mount
      const offset = align === 'center'
        ? Math.max(0, viewH / 2 - rowHeight / 2)
        : 60;
      const nextTop = Math.max(0, targetTop - offset);
      const distance = Math.abs(el.scrollTop - nextTop);
      el.scrollTo({
        top: nextTop,
        behavior: distance > Math.max(viewH * 4, rowHeight * 200) ? 'auto' : 'smooth',
      });
    },
    [scrollRef, viewH, rowHeight],
  );

  return { totalH, startIdx, endIdx, scrollToIndex };
}
