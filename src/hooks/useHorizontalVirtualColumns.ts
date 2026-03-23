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
  overscanMin?: number;
  overscanFactor?: number;
}

interface HorizontalVirtualColumnsResult {
  columnEntries: HorizontalVirtualColumnEntry[];
  totalWidth: number;
  leadingSpacerWidth: number;
  trailingSpacerWidth: number;
  debug: {
    viewportWidth: number;
    scrollLeft: number;
    visibleColumnCount: number;
    overscan: number;
    rangeUpdates: number;
    lastCalcMs: number;
  };
}

const DEFAULT_MIN_OVERSCAN_COLUMNS = 12;
const DEFAULT_OVERSCAN_FACTOR = 2;

interface PositionedMergedColumnRange {
  startPosition: number;
  endPosition: number;
}

interface HorizontalWindow {
  startIndex: number;
  endIndex: number;
  visibleColumnCount: number;
  overscan: number;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function preparePositionedMergedColumnRanges(
  columns: number[],
  mergedRanges: WorkbookMergeRange[],
): PositionedMergedColumnRange[] {
  if (columns.length === 0 || mergedRanges.length === 0) return [];

  const positionByColumn = new Map<number, number>();
  columns.forEach((column, position) => {
    positionByColumn.set(column, position);
  });

  return mergedRanges.flatMap((range) => {
    let startPosition = Number.POSITIVE_INFINITY;
    let endPosition = Number.NEGATIVE_INFINITY;

    for (let column = range.startCol; column <= range.endCol; column += 1) {
      const position = positionByColumn.get(column);
      if (position == null) continue;
      if (position < startPosition) startPosition = position;
      if (position > endPosition) endPosition = position;
    }

    if (!Number.isFinite(startPosition) || !Number.isFinite(endPosition)) return [];
    return [{ startPosition, endPosition }];
  });
}

export function computeHorizontalWindow(
  nonFrozenColumnCount: number,
  clampedFrozenCount: number,
  scrollLeft: number,
  viewportWidth: number,
  unitWidth: number,
  mergedRanges: PositionedMergedColumnRange[],
  overscanMin = DEFAULT_MIN_OVERSCAN_COLUMNS,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
): HorizontalWindow {
  if (nonFrozenColumnCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      visibleColumnCount: 0,
      overscan: overscanMin,
    };
  }

  const frozenWidth = clampedFrozenCount * unitWidth;
  const availableWidth = Math.max(unitWidth, viewportWidth - frozenWidth);
  const visibleColumnCount = Math.max(1, Math.ceil(availableWidth / unitWidth));
  const overscan = Math.max(overscanMin, Math.ceil(visibleColumnCount * overscanFactor));
  let startIndex = Math.max(0, Math.floor(scrollLeft / unitWidth) - overscan);
  let endIndex = Math.min(
    nonFrozenColumnCount,
    Math.ceil((scrollLeft + availableWidth) / unitWidth) + overscan,
  );

  if (mergedRanges.length > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      const startPos = clampedFrozenCount + startIndex;
      const endPos = clampedFrozenCount + Math.max(startIndex, endIndex - 1);

      mergedRanges.forEach((range) => {
        if (range.endPosition < clampedFrozenCount || range.startPosition > endPos || range.endPosition < startPos) {
          return;
        }

        const nextStartIndex = Math.max(0, Math.min(startIndex, range.startPosition - clampedFrozenCount));
        const nextEndIndex = Math.max(endIndex, (range.endPosition - clampedFrozenCount) + 1);
        if (nextStartIndex !== startIndex || nextEndIndex !== endIndex) {
          startIndex = nextStartIndex;
          endIndex = Math.min(nonFrozenColumnCount, nextEndIndex);
          changed = true;
        }
      });
    }
  }

  return {
    startIndex,
    endIndex,
    visibleColumnCount,
    overscan,
  };
}

export function useHorizontalVirtualColumns({
  scrollRef,
  columns,
  cellWidth,
  frozenCount,
  widthMultiplier = 1,
  mergedRanges = [],
  overscanMin = DEFAULT_MIN_OVERSCAN_COLUMNS,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
}: UseHorizontalVirtualColumnsOptions): HorizontalVirtualColumnsResult {
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [windowRange, setWindowRange] = useState<HorizontalWindow>({
    startIndex: 0,
    endIndex: 0,
    visibleColumnCount: 0,
    overscan: overscanMin,
  });
  const scrollLeftRef = useRef(0);
  const viewportWidthRef = useRef(1200);
  const windowRangeRef = useRef(windowRange);
  const rafRef = useRef(0);

  const rangeUpdateCountRef = useRef(1);
  const lastCalcMsRef = useRef(0);

  const layout = useMemo(() => {
    const unitWidth = cellWidth * widthMultiplier;
    const totalWidth = columns.length * unitWidth;
    const clampedFrozenCount = Math.min(frozenCount, columns.length);
    const frozenEntries = columns.slice(0, clampedFrozenCount).map((column, position) => ({
      column,
      position,
    }));
    const nonFrozenColumns = columns.slice(clampedFrozenCount);
    const positionedMergedRanges = preparePositionedMergedColumnRanges(columns, mergedRanges);

    return {
      unitWidth,
      totalWidth,
      clampedFrozenCount,
      frozenEntries,
      nonFrozenColumns,
      positionedMergedRanges,
    };
  }, [cellWidth, columns, frozenCount, mergedRanges, widthMultiplier]);

  const applyWindowRange = useMemo(() => (
    (scrollLeft: number, nextViewportWidth: number) => {
      const calcStart = getNow();
      const nextRange = computeHorizontalWindow(
        layout.nonFrozenColumns.length,
        layout.clampedFrozenCount,
        scrollLeft,
        nextViewportWidth,
        layout.unitWidth,
        layout.positionedMergedRanges,
        overscanMin,
        overscanFactor,
      );
      lastCalcMsRef.current = getNow() - calcStart;

      const prevRange = windowRangeRef.current;
      if (
        prevRange.startIndex === nextRange.startIndex
        && prevRange.endIndex === nextRange.endIndex
        && prevRange.visibleColumnCount === nextRange.visibleColumnCount
        && prevRange.overscan === nextRange.overscan
      ) {
        return;
      }

      windowRangeRef.current = nextRange;
      rangeUpdateCountRef.current += 1;
      setWindowRange(nextRange);
    }
  ), [layout.clampedFrozenCount, layout.nonFrozenColumns.length, layout.positionedMergedRanges, layout.unitWidth, overscanFactor, overscanMin]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => {
      const nextViewportWidth = Math.max(0, Math.round(el.clientWidth));
      viewportWidthRef.current = nextViewportWidth;
      setViewportWidth(prev => (prev === nextViewportWidth ? prev : nextViewportWidth));
      applyWindowRange(scrollLeftRef.current, nextViewportWidth);
    };

    const onScroll = () => {
      scrollLeftRef.current = Math.max(0, Math.round(el.scrollLeft));
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
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
  }, [applyWindowRange, scrollRef]);

  useEffect(() => {
    applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
  }, [applyWindowRange]);

  return useMemo(() => {
    const {
      unitWidth,
      totalWidth,
      clampedFrozenCount,
      frozenEntries,
      nonFrozenColumns,
    } = layout;
    if (columns.length === 0) {
      return {
        columnEntries: [],
        totalWidth,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          visibleColumnCount: 0,
          overscan: windowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
    }

    if (nonFrozenColumns.length === 0) {
      return {
        columnEntries: frozenEntries,
        totalWidth,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          visibleColumnCount: 0,
          overscan: windowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
    }

    const virtualEntries = nonFrozenColumns
      .slice(windowRange.startIndex, windowRange.endIndex)
      .map((column, index) => ({
        column,
        position: clampedFrozenCount + windowRange.startIndex + index,
      }));

    return {
      columnEntries: [...frozenEntries, ...virtualEntries],
      totalWidth,
      leadingSpacerWidth: windowRange.startIndex * unitWidth,
      trailingSpacerWidth: Math.max(0, (nonFrozenColumns.length - windowRange.endIndex) * unitWidth),
      debug: {
        viewportWidth,
        scrollLeft: scrollLeftRef.current,
        visibleColumnCount: windowRange.visibleColumnCount,
        overscan: windowRange.overscan,
        rangeUpdates: rangeUpdateCountRef.current,
        lastCalcMs: lastCalcMsRef.current,
      },
    };
  }, [columns.length, layout, viewportWidth, windowRange]);
}
