import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import { clampWorkbookColumnWidth } from '@/utils/workbook/workbookColumnWidths';

export interface HorizontalVirtualColumnEntry {
  column: number;
  position: number;
  width: number;
  displayWidth: number;
  offset: number;
}

interface UseHorizontalVirtualColumnsOptions {
  scrollRef: RefObject<HTMLDivElement>;
  columns: number[];
  cellWidth: number;
  frozenCount: number;
  widthMultiplier?: number;
  getColumnWidth?: ((column: number) => number) | undefined;
  mergedRanges?: WorkbookMergeRange[];
  overscanMin?: number;
  overscanFactor?: number;
  syncKey?: string | number | null;
}

interface HorizontalVirtualColumnsResult {
  columnEntries: HorizontalVirtualColumnEntry[];
  totalWidth: number;
  frozenWidth: number;
  leadingSpacerWidth: number;
  trailingSpacerWidth: number;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
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

function shouldRetainHorizontalWindow(
  nonFrozenPrefixSums: number[],
  currentRange: HorizontalWindow,
  scrollLeft: number,
  viewportWidth: number,
  frozenWidth: number,
): boolean {
  if (currentRange.endIndex <= currentRange.startIndex) return false;

  const totalNonFrozenWidth = nonFrozenPrefixSums[nonFrozenPrefixSums.length - 1] ?? 0;
  const availableWidth = Math.max(1, viewportWidth - frozenWidth);
  const maxScrollLeft = Math.max(0, totalNonFrozenWidth - availableWidth);
  const clampedScrollLeft = Math.max(0, Math.min(scrollLeft, maxScrollLeft));
  const windowStart = nonFrozenPrefixSums[currentRange.startIndex] ?? 0;
  const windowEnd = nonFrozenPrefixSums[currentRange.endIndex] ?? totalNonFrozenWidth;
  const visibleStart = clampedScrollLeft;
  const visibleEnd = clampedScrollLeft + availableWidth;
  const windowWidth = Math.max(0, windowEnd - windowStart);

  if (windowWidth <= availableWidth) return true;

  const margin = Math.max(
    480,
    Math.min(windowWidth * 0.25, availableWidth * 0.5),
  );

  return visibleStart >= windowStart + margin
    && visibleEnd <= windowEnd - margin;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function buildPrefixSums(widths: number[]): number[] {
  const prefixSums = new Array<number>(widths.length + 1).fill(0);
  widths.forEach((width, index) => {
    prefixSums[index + 1] = prefixSums[index]! + width;
  });
  return prefixSums;
}

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? 0) <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
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
  nonFrozenDisplayWidths: number[],
  clampedFrozenCount: number,
  scrollLeft: number,
  viewportWidth: number,
  frozenWidth: number,
  mergedRanges: PositionedMergedColumnRange[],
  overscanMin = DEFAULT_MIN_OVERSCAN_COLUMNS,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
  precomputedPrefixSums?: number[],
): HorizontalWindow {
  if (nonFrozenDisplayWidths.length === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      visibleColumnCount: 0,
      overscan: overscanMin,
    };
  }

  const nonFrozenPrefixSums = precomputedPrefixSums ?? buildPrefixSums(nonFrozenDisplayWidths);
  const totalNonFrozenWidth = nonFrozenPrefixSums[nonFrozenPrefixSums.length - 1] ?? 0;
  const availableWidth = Math.max(1, viewportWidth - frozenWidth);
  const maxScrollLeft = Math.max(0, totalNonFrozenWidth - availableWidth);
  const clampedScrollLeft = Math.max(0, Math.min(scrollLeft, maxScrollLeft));
  const visibleStart = Math.min(
    nonFrozenDisplayWidths.length - 1,
    Math.max(0, upperBound(nonFrozenPrefixSums, clampedScrollLeft) - 1),
  );
  const visibleEnd = Math.min(
    nonFrozenDisplayWidths.length,
    Math.max(
      visibleStart + 1,
      upperBound(nonFrozenPrefixSums, clampedScrollLeft + availableWidth - 1),
    ),
  );
  const visibleColumnCount = Math.max(1, visibleEnd - visibleStart);
  const overscan = Math.max(overscanMin, Math.ceil(visibleColumnCount * overscanFactor));
  let startIndex = Math.max(0, visibleStart - overscan);
  let endIndex = Math.min(nonFrozenDisplayWidths.length, visibleEnd + overscan);

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
          endIndex = Math.min(nonFrozenDisplayWidths.length, nextEndIndex);
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
  getColumnWidth,
  mergedRanges = [],
  overscanMin = DEFAULT_MIN_OVERSCAN_COLUMNS,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
  syncKey = null,
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
  const resizeRafRef = useRef(0);
  const rangeUpdateCountRef = useRef(1);
  const lastCalcMsRef = useRef(0);
  const syncKeyRef = useRef(syncKey);

  const layout = useMemo(() => {
    let runningOffset = 0;
    const columnMetrics: HorizontalVirtualColumnEntry[] = columns.map((column, position) => {
      const width = clampWorkbookColumnWidth(getColumnWidth?.(column) ?? cellWidth);
      const displayWidth = width * widthMultiplier;
      const entry: HorizontalVirtualColumnEntry = {
        column,
        position,
        width,
        displayWidth,
        offset: runningOffset,
      };
      runningOffset += displayWidth;
      return entry;
    });
    const totalWidth = runningOffset;
    const clampedFrozenCount = Math.min(frozenCount, columns.length);
    const frozenEntries = columnMetrics.slice(0, clampedFrozenCount);
    const nonFrozenEntries = columnMetrics.slice(clampedFrozenCount);
    const nonFrozenDisplayWidths = nonFrozenEntries.map(entry => entry.displayWidth);
    const nonFrozenPrefixSums = buildPrefixSums(nonFrozenDisplayWidths);
    const frozenWidth = frozenEntries.reduce((sum, entry) => sum + entry.displayWidth, 0);
    const positionedMergedRanges = preparePositionedMergedColumnRanges(columns, mergedRanges);
    const columnLayoutByColumn = new Map(columnMetrics.map(entry => [entry.column, entry]));

    return {
      totalWidth,
      clampedFrozenCount,
      frozenEntries,
      nonFrozenEntries,
      nonFrozenDisplayWidths,
      nonFrozenPrefixSums,
      frozenWidth,
      positionedMergedRanges,
      columnLayoutByColumn,
    };
  }, [cellWidth, columns, frozenCount, getColumnWidth, mergedRanges, widthMultiplier]);

  // Use a ref so that the scroll/resize listeners (which depend on
  // applyWindowRange) are not torn down and re-attached every time `layout`
  // changes. The ref is always up-to-date because it is written synchronously
  // during render.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const overscanMinRef = useRef(overscanMin);
  overscanMinRef.current = overscanMin;
  const overscanFactorRef = useRef(overscanFactor);
  overscanFactorRef.current = overscanFactor;

  const applyWindowRange = useCallback(
    (scrollLeft: number, nextViewportWidth: number) => {
      const currentLayout = layoutRef.current;
      const prevRange = windowRangeRef.current;
      if (shouldRetainHorizontalWindow(
        currentLayout.nonFrozenPrefixSums,
        prevRange,
        scrollLeft,
        nextViewportWidth,
        currentLayout.frozenWidth,
      )) {
        return;
      }

      const calcStart = getNow();
      const nextRange = computeHorizontalWindow(
        currentLayout.nonFrozenDisplayWidths,
        currentLayout.clampedFrozenCount,
        scrollLeft,
        nextViewportWidth,
        currentLayout.frozenWidth,
        currentLayout.positionedMergedRanges,
        overscanMinRef.current,
        overscanFactorRef.current,
        currentLayout.nonFrozenPrefixSums,
      );
      lastCalcMsRef.current = getNow() - calcStart;

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
    },
    [],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => {
      const nextViewportWidth = Math.max(0, Math.round(el.clientWidth));
      viewportWidthRef.current = nextViewportWidth;
      setViewportWidth(prev => (prev === nextViewportWidth ? prev : nextViewportWidth));
      applyWindowRange(scrollLeftRef.current, nextViewportWidth);
    };

    const scheduleViewportUpdate = () => {
      if (resizeRafRef.current) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0;
        updateViewport();
      });
    };

    const onScroll = () => {
      scrollLeftRef.current = Math.max(0, Math.round(el.scrollLeft));
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
      });
    };

    const ro = new ResizeObserver(scheduleViewportUpdate);
    ro.observe(el);
    updateViewport();
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    };
  }, [applyWindowRange, scrollRef]);

  // When layout metrics change, recompute the column window once.
  // (Previously this was driven by `applyWindowRange` identity change.)
  useEffect(() => {
    applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useLayoutEffect(() => {
    if (syncKeyRef.current === syncKey) return;
    syncKeyRef.current = syncKey;
    scrollLeftRef.current = 0;
    const el = scrollRef.current;
    if (el && el.scrollLeft !== 0) {
      el.scrollTo({ left: 0, behavior: 'auto' });
    }
    const currentLayout = layoutRef.current;
    const nextRange = computeHorizontalWindow(
      currentLayout.nonFrozenDisplayWidths,
      currentLayout.clampedFrozenCount,
      0,
      viewportWidthRef.current,
      currentLayout.frozenWidth,
      currentLayout.positionedMergedRanges,
      overscanMinRef.current,
      overscanFactorRef.current,
      currentLayout.nonFrozenPrefixSums,
    );
    windowRangeRef.current = nextRange;
    setWindowRange(nextRange);
  }, [scrollRef, syncKey]);

  const effectiveWindowRange = useMemo(() => (
    syncKeyRef.current !== syncKey
      ? computeHorizontalWindow(
        layout.nonFrozenDisplayWidths,
        layout.clampedFrozenCount,
        0,
        viewportWidthRef.current,
        layout.frozenWidth,
        layout.positionedMergedRanges,
        overscanMin,
        overscanFactor,
        layout.nonFrozenPrefixSums,
      )
      : windowRange
  ), [layout, overscanFactor, overscanMin, syncKey, windowRange]);

  // Cache columnEntries to maintain referential stability when the window
  // range hasn't actually changed. Without this, every windowRange update
  // produces a new array via [...frozenEntries, ...virtualEntries], which
  // invalidates all downstream memo() components (canvas strips) and causes
  // expensive useLayoutEffect re-runs with full canvas repaints.
  const columnEntriesCacheRef = useRef<{
    key: string;
    entries: HorizontalVirtualColumnEntry[];
  }>({ key: '', entries: [] });

  return useMemo(() => {
    if (columns.length === 0) {
      return {
        columnEntries: [],
        totalWidth: 0,
        frozenWidth: 0,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
        columnLayoutByColumn: new Map<number, HorizontalVirtualColumnEntry>(),
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          visibleColumnCount: 0,
          overscan: effectiveWindowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
    }

    const {
      totalWidth,
      frozenEntries,
      nonFrozenEntries,
      nonFrozenPrefixSums,
      frozenWidth,
      columnLayoutByColumn,
    } = layout;

    if (nonFrozenEntries.length === 0) {
      return {
        columnEntries: frozenEntries,
        totalWidth,
        frozenWidth,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
        columnLayoutByColumn,
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          visibleColumnCount: 0,
          overscan: effectiveWindowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
    }

    const virtualEntries = nonFrozenEntries.slice(effectiveWindowRange.startIndex, effectiveWindowRange.endIndex);
    const leadingSpacerWidth = nonFrozenPrefixSums[effectiveWindowRange.startIndex] ?? 0;
    const trailingSpacerWidth = Math.max(
      0,
      (nonFrozenPrefixSums[nonFrozenPrefixSums.length - 1] ?? 0) - (nonFrozenPrefixSums[effectiveWindowRange.endIndex] ?? 0),
    );

    const cacheKey = `${columns.length}:${effectiveWindowRange.startIndex}:${effectiveWindowRange.endIndex}:${layout.clampedFrozenCount}`;
    let columnEntries: HorizontalVirtualColumnEntry[];
    if (columnEntriesCacheRef.current.key === cacheKey) {
      columnEntries = columnEntriesCacheRef.current.entries;
    } else {
      columnEntries = [...frozenEntries, ...virtualEntries];
      columnEntriesCacheRef.current = { key: cacheKey, entries: columnEntries };
    }

    return {
      columnEntries,
      totalWidth,
      frozenWidth,
      leadingSpacerWidth,
      trailingSpacerWidth,
      columnLayoutByColumn,
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          visibleColumnCount: effectiveWindowRange.visibleColumnCount,
          overscan: effectiveWindowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
  }, [columns.length, effectiveWindowRange, layout, viewportWidth]);
}
