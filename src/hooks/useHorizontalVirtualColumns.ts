import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { WorkbookMergeRange } from '../utils/workbookMeta';

export interface HorizontalVirtualColumnEntry {
  column: number;
  position: number;
}

interface UseHorizontalVirtualColumnsOptions {
  scrollRef: RefObject<HTMLDivElement>;
  columns: number[];
  cellWidth: number;
  frozenCount: number;
  widthMultiplier?: number;
  mergedRanges?: WorkbookMergeRange[];
}

interface HorizontalVirtualColumnsResult {
  columnEntries: HorizontalVirtualColumnEntry[];
  totalWidth: number;
  leadingSpacerWidth: number;
  trailingSpacerWidth: number;
}

const MIN_OVERSCAN_COLUMNS = 12;

export function useHorizontalVirtualColumns({
  scrollRef,
  columns,
  cellWidth,
  frozenCount,
  widthMultiplier = 1,
  mergedRanges = [],
}: UseHorizontalVirtualColumnsOptions): HorizontalVirtualColumnsResult {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const scrollLeftRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => {
      const nextViewportWidth = Math.max(0, Math.round(el.clientWidth));
      setViewportWidth(prev => (prev === nextViewportWidth ? prev : nextViewportWidth));
    };

    const onScroll = () => {
      scrollLeftRef.current = Math.max(0, Math.round(el.scrollLeft));
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setScrollLeft(prev => (prev === scrollLeftRef.current ? prev : scrollLeftRef.current));
      });
    };

    const ro = new ResizeObserver(updateViewport);
    ro.observe(el);
    updateViewport();
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef]);

  return useMemo(() => {
    const unitWidth = cellWidth * widthMultiplier;
    const totalWidth = columns.length * unitWidth;
    if (columns.length === 0) {
      return {
        columnEntries: [],
        totalWidth,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
      };
    }

    const clampedFrozenCount = Math.min(frozenCount, columns.length);
    const frozenEntries = columns.slice(0, clampedFrozenCount).map((column, position) => ({
      column,
      position,
    }));
    const nonFrozenColumns = columns.slice(clampedFrozenCount);
    if (nonFrozenColumns.length === 0) {
      return {
        columnEntries: frozenEntries,
        totalWidth,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
      };
    }

    const frozenWidth = clampedFrozenCount * unitWidth;
    const availableWidth = Math.max(unitWidth, viewportWidth - frozenWidth);
    const visibleColumnCount = Math.max(1, Math.ceil(availableWidth / unitWidth));
    const overscan = Math.max(MIN_OVERSCAN_COLUMNS, visibleColumnCount * 2);
    let startIndex = Math.max(0, Math.floor(scrollLeft / unitWidth) - overscan);
    let endIndex = Math.min(
      nonFrozenColumns.length,
      Math.ceil((scrollLeft + availableWidth) / unitWidth) + overscan,
    );

    if (mergedRanges.length > 0) {
      const positionedColumns = columns.map((column, position) => ({ column, position }));

      let changed = true;
      while (changed) {
        changed = false;
        const startPos = clampedFrozenCount + startIndex;
        const endPos = clampedFrozenCount + Math.max(startIndex, endIndex - 1);

        mergedRanges.forEach((range) => {
          const positionsInRange = positionedColumns
            .filter(entry => entry.column >= range.startCol && entry.column <= range.endCol)
            .map(entry => entry.position);

          if (positionsInRange.length === 0) return;
          const minPos = positionsInRange[0]!;
          const maxPos = positionsInRange[positionsInRange.length - 1]!;
          if (maxPos < clampedFrozenCount || minPos > endPos || maxPos < startPos) return;

          const nextStartIndex = Math.max(0, Math.min(startIndex, minPos - clampedFrozenCount));
          const nextEndIndex = Math.max(endIndex, (maxPos - clampedFrozenCount) + 1);
          if (nextStartIndex !== startIndex || nextEndIndex !== endIndex) {
            startIndex = nextStartIndex;
            endIndex = Math.min(nonFrozenColumns.length, nextEndIndex);
            changed = true;
          }
        });
      }
    }

    const virtualEntries = nonFrozenColumns
      .slice(startIndex, endIndex)
      .map((column, index) => ({
        column,
        position: clampedFrozenCount + startIndex + index,
      }));

    return {
      columnEntries: [...frozenEntries, ...virtualEntries],
      totalWidth,
      leadingSpacerWidth: startIndex * unitWidth,
      trailingSpacerWidth: Math.max(0, (nonFrozenColumns.length - endIndex) * unitWidth),
    };
  }, [cellWidth, columns, frozenCount, mergedRanges, scrollLeft, viewportWidth, widthMultiplier]);
}
