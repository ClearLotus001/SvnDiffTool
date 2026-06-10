import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import { clampWorkbookColumnWidth } from '@/utils/workbook/workbookColumnWidths';
import { resolveWorkbookFrozenPaneViewport } from '@/utils/workbook/workbookFrozenPane';

export interface HorizontalVirtualColumnEntry {
  column: number;
  position: number;
  width: number;
  displayWidth: number;
  offset: number;
  absoluteOffset?: number;
}

export interface HorizontalVirtualColumnEntriesCache {
  key: string;
  layout: object | null;
  entries: HorizontalVirtualColumnEntry[];
}

interface UseHorizontalVirtualColumnsOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  frozenScrollRef?: RefObject<HTMLDivElement | null>;
  columns: number[];
  cellWidth: number;
  frozenCount: number;
  widthMultiplier?: number;
  getColumnWidth?: ((column: number) => number) | undefined;
  mergedRanges?: WorkbookMergeRange[];
  overscanMin?: number;
  overscanFactor?: number;
  syncKey?: string | number | null;
  minScrollableViewport?: number;
  maxFrozenViewportRatio?: number;
  minFrozenViewport?: number;
  disableVirtualizationBelow?: number;
}

interface HorizontalVirtualColumnsResult {
  columnEntries: HorizontalVirtualColumnEntry[];
  totalWidth: number;
  frozenWidth: number;
  fullFrozenWidth: number;
  frozenScrollLeft: number;
  isFrozenOverflowing: boolean;
  leadingSpacerWidth: number;
  trailingSpacerWidth: number;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  debug: {
    viewportWidth: number;
    scrollLeft: number;
    frozenScrollLeft: number;
    visibleColumnCount: number;
    overscan: number;
    rangeUpdates: number;
    lastCalcMs: number;
  };
}

const DEFAULT_MIN_OVERSCAN_COLUMNS = 12;
const DEFAULT_OVERSCAN_FACTOR = 2;
const DEFAULT_MIN_SCROLLABLE_VIEWPORT = 320;
const DEFAULT_MAX_FROZEN_VIEWPORT_RATIO = 0.6;

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

export function createFullHorizontalWindow(columnCount: number): HorizontalWindow {
  const count = Math.max(0, columnCount);
  return {
    startIndex: 0,
    endIndex: count,
    visibleColumnCount: count,
    overscan: count,
  };
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

function resolveVisibleFrozenWidth(params: {
  fullFrozenWidth: number;
  viewportWidth: number;
  minScrollableViewport: number;
  maxFrozenViewportRatio: number;
  minFrozenViewport: number;
}) {
  return resolveWorkbookFrozenPaneViewport({
    totalFrozenSize: params.fullFrozenWidth,
    viewportSize: params.viewportWidth,
    minBodyViewportSize: params.minScrollableViewport,
    maxViewportRatio: params.maxFrozenViewportRatio,
    minViewportSize: params.minFrozenViewport,
  });
}

export function resolveStableHorizontalColumnEntries(
  cache: HorizontalVirtualColumnEntriesCache,
  cacheKey: string,
  layoutIdentity: object,
  nextEntries: HorizontalVirtualColumnEntry[],
): HorizontalVirtualColumnEntriesCache {
  if (cache.key === cacheKey && cache.layout === layoutIdentity) {
    return cache;
  }

  return {
    key: cacheKey,
    layout: layoutIdentity,
    entries: nextEntries,
  };
}

export function useHorizontalVirtualColumns({
  scrollRef,
  frozenScrollRef,
  columns,
  cellWidth,
  frozenCount,
  widthMultiplier = 1,
  getColumnWidth,
  mergedRanges = [],
  overscanMin = DEFAULT_MIN_OVERSCAN_COLUMNS,
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
  syncKey = null,
  minScrollableViewport = DEFAULT_MIN_SCROLLABLE_VIEWPORT,
  maxFrozenViewportRatio = DEFAULT_MAX_FROZEN_VIEWPORT_RATIO,
  minFrozenViewport,
  disableVirtualizationBelow = 0,
}: UseHorizontalVirtualColumnsOptions): HorizontalVirtualColumnsResult {
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [windowRange, setWindowRange] = useState<HorizontalWindow>({
    startIndex: 0,
    endIndex: 0,
    visibleColumnCount: 0,
    overscan: overscanMin,
  });
  const [frozenScrollLeftState, setFrozenScrollLeftState] = useState(0);
  const scrollLeftRef = useRef(0);
  const frozenScrollLeftRef = useRef(0);
  const viewportWidthRef = useRef(1200);
  const windowRangeRef = useRef(windowRange);
  const rafRef = useRef(0);
  const frozenRafRef = useRef(0);
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
        absoluteOffset: runningOffset,
      };
      runningOffset += displayWidth;
      return entry;
    });
    const clampedFrozenCount = Math.min(frozenCount, columns.length);
    const frozenEntries = columnMetrics.slice(0, clampedFrozenCount);
    const nonFrozenEntries = columnMetrics.slice(clampedFrozenCount);
    const frozenDisplayWidths = frozenEntries.map((entry) => entry.displayWidth);
    const nonFrozenDisplayWidths = nonFrozenEntries.map((entry) => entry.displayWidth);
    const nonFrozenPrefixSums = buildPrefixSums(nonFrozenDisplayWidths);
    const fullFrozenWidth = frozenEntries.reduce((sum, entry) => sum + entry.displayWidth, 0);
    const totalNonFrozenWidth = nonFrozenPrefixSums[nonFrozenPrefixSums.length - 1] ?? 0;
    const positionedMergedRanges = preparePositionedMergedColumnRanges(columns, mergedRanges);

    return {
      clampedFrozenCount,
      frozenEntries,
      frozenDisplayWidths,
      nonFrozenEntries,
      nonFrozenDisplayWidths,
      nonFrozenPrefixSums,
      fullFrozenWidth,
      totalNonFrozenWidth,
      positionedMergedRanges,
      allEntries: columnMetrics,
    };
  }, [cellWidth, columns, frozenCount, getColumnWidth, mergedRanges, widthMultiplier]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const shouldRenderAllColumns = disableVirtualizationBelow > 0
    && columns.length <= disableVirtualizationBelow;

  const overscanMinRef = useRef(overscanMin);
  overscanMinRef.current = overscanMin;
  const overscanFactorRef = useRef(overscanFactor);
  overscanFactorRef.current = overscanFactor;

  const resolvePaneState = useCallback((nextViewportWidth: number) => {
    const currentLayout = layoutRef.current;
    const visibleFrozen = resolveVisibleFrozenWidth({
      fullFrozenWidth: currentLayout.fullFrozenWidth,
      viewportWidth: nextViewportWidth,
      minScrollableViewport,
      maxFrozenViewportRatio,
      minFrozenViewport: Math.max(0, minFrozenViewport ?? Math.round(cellWidth * widthMultiplier)),
    });
    const maxFrozenScrollLeft = Math.max(0, currentLayout.fullFrozenWidth - visibleFrozen.viewportSize);
    const clampedFrozenScrollLeft = Math.max(0, Math.min(frozenScrollLeftRef.current, maxFrozenScrollLeft));
    return {
      visibleFrozenWidth: visibleFrozen.viewportSize,
      isFrozenOverflowing: visibleFrozen.isOverflowing,
      clampedFrozenScrollLeft,
    };
  }, [cellWidth, maxFrozenViewportRatio, minFrozenViewport, minScrollableViewport, widthMultiplier]);

  const applyWindowRange = useCallback(
    (scrollLeft: number, nextViewportWidth: number) => {
      const currentLayout = layoutRef.current;
      const paneState = resolvePaneState(nextViewportWidth);
      const prevRange = windowRangeRef.current;
      if (shouldRetainHorizontalWindow(
        currentLayout.nonFrozenPrefixSums,
        prevRange,
        scrollLeft,
        nextViewportWidth,
        paneState.visibleFrozenWidth,
      )) {
        return;
      }

      const calcStart = getNow();
      const nextRange = shouldRenderAllColumns
        ? createFullHorizontalWindow(currentLayout.nonFrozenEntries.length)
        : computeHorizontalWindow(
            currentLayout.nonFrozenDisplayWidths,
            currentLayout.clampedFrozenCount,
            scrollLeft,
            nextViewportWidth,
            paneState.visibleFrozenWidth,
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
    [resolvePaneState, shouldRenderAllColumns],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => {
      const nextViewportWidth = Math.max(0, Math.round(el.clientWidth));
      viewportWidthRef.current = nextViewportWidth;
      setViewportWidth((prev) => (prev === nextViewportWidth ? prev : nextViewportWidth));
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

  useEffect(() => {
    const el = frozenScrollRef?.current;
    if (!el) {
      frozenScrollLeftRef.current = 0;
      setFrozenScrollLeftState(0);
      return;
    }

    const onScroll = () => {
      const nextScrollLeft = Math.max(0, Math.round(el.scrollLeft));
      if (nextScrollLeft === frozenScrollLeftRef.current) return;
      frozenScrollLeftRef.current = nextScrollLeft;
      if (frozenRafRef.current) return;
      frozenRafRef.current = requestAnimationFrame(() => {
        frozenRafRef.current = 0;
        setFrozenScrollLeftState(frozenScrollLeftRef.current);
        applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
      });
    };

    frozenScrollLeftRef.current = Math.max(0, Math.round(el.scrollLeft));
    setFrozenScrollLeftState(frozenScrollLeftRef.current);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frozenRafRef.current) cancelAnimationFrame(frozenRafRef.current);
    };
  }, [applyWindowRange, frozenScrollRef]);

  useEffect(() => {
    applyWindowRange(scrollLeftRef.current, viewportWidthRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, frozenScrollLeftState]);

  useLayoutEffect(() => {
    if (syncKeyRef.current === syncKey) return;
    syncKeyRef.current = syncKey;
    scrollLeftRef.current = 0;
    frozenScrollLeftRef.current = 0;
    const el = scrollRef.current;
    if (el && el.scrollLeft !== 0) {
      el.scrollTo({ left: 0, behavior: 'auto' });
    }
    const frozenEl = frozenScrollRef?.current;
    if (frozenEl && frozenEl.scrollLeft !== 0) {
      frozenEl.scrollTo({ left: 0, behavior: 'auto' });
    }
    setFrozenScrollLeftState(0);
    const paneState = resolvePaneState(viewportWidthRef.current);
    const currentLayout = layoutRef.current;
    const nextRange = shouldRenderAllColumns
      ? createFullHorizontalWindow(currentLayout.nonFrozenEntries.length)
      : computeHorizontalWindow(
          currentLayout.nonFrozenDisplayWidths,
          currentLayout.clampedFrozenCount,
          0,
          viewportWidthRef.current,
          paneState.visibleFrozenWidth,
          currentLayout.positionedMergedRanges,
          overscanMinRef.current,
          overscanFactorRef.current,
          currentLayout.nonFrozenPrefixSums,
        );
    windowRangeRef.current = nextRange;
    setWindowRange(nextRange);
  }, [frozenScrollRef, resolvePaneState, scrollRef, shouldRenderAllColumns, syncKey]);

  const paneState = resolvePaneState(viewportWidth);
  const effectiveWindowRange = useMemo(() => (
    shouldRenderAllColumns
      ? createFullHorizontalWindow(layout.nonFrozenEntries.length)
      : syncKeyRef.current !== syncKey
      ? computeHorizontalWindow(
        layout.nonFrozenDisplayWidths,
        layout.clampedFrozenCount,
        0,
        viewportWidthRef.current,
        paneState.visibleFrozenWidth,
        layout.positionedMergedRanges,
        overscanMin,
        overscanFactor,
        layout.nonFrozenPrefixSums,
      )
      : windowRange
  ), [layout, overscanFactor, overscanMin, paneState.visibleFrozenWidth, shouldRenderAllColumns, syncKey, windowRange]);

  const effectiveFrozenWindowRange = useMemo(() => (
    shouldRenderAllColumns
      ? createFullHorizontalWindow(layout.frozenEntries.length)
      : computeHorizontalWindow(
          layout.frozenDisplayWidths,
          0,
          paneState.clampedFrozenScrollLeft,
          paneState.visibleFrozenWidth,
          0,
          layout.positionedMergedRanges,
          overscanMin,
          overscanFactor,
          buildPrefixSums(layout.frozenDisplayWidths),
        )
  ), [layout.frozenDisplayWidths, layout.frozenEntries.length, layout.positionedMergedRanges, overscanFactor, overscanMin, paneState.clampedFrozenScrollLeft, paneState.visibleFrozenWidth, shouldRenderAllColumns]);

  const columnEntriesCacheRef = useRef<HorizontalVirtualColumnEntriesCache>({
    key: '',
    layout: null,
    entries: [],
  });

  return useMemo(() => {
    if (columns.length === 0) {
      return {
        columnEntries: [],
        totalWidth: 0,
        frozenWidth: 0,
        fullFrozenWidth: 0,
        frozenScrollLeft: 0,
        isFrozenOverflowing: false,
        leadingSpacerWidth: 0,
        trailingSpacerWidth: 0,
        columnLayoutByColumn: new Map<number, HorizontalVirtualColumnEntry>(),
        debug: {
          viewportWidth,
          scrollLeft: scrollLeftRef.current,
          frozenScrollLeft: frozenScrollLeftRef.current,
          visibleColumnCount: 0,
          overscan: effectiveWindowRange.overscan,
          rangeUpdates: rangeUpdateCountRef.current,
          lastCalcMs: lastCalcMsRef.current,
        },
      };
    }

    const {
      allEntries,
      frozenEntries,
      nonFrozenEntries,
      nonFrozenPrefixSums,
      fullFrozenWidth,
      totalNonFrozenWidth,
    } = layout;

    const dynamicColumnLayoutByColumn = new Map<number, HorizontalVirtualColumnEntry>(
      allEntries.map((entry) => {
        const absoluteOffset = entry.absoluteOffset ?? entry.offset;
        const offset = entry.position < layout.clampedFrozenCount
          ? absoluteOffset - paneState.clampedFrozenScrollLeft
          : paneState.visibleFrozenWidth + (absoluteOffset - fullFrozenWidth);
        return [entry.column, {
          ...entry,
          absoluteOffset,
          offset,
        }];
      }),
    );

    const visibleFrozenEntries = frozenEntries.length > 0
      ? frozenEntries
        .slice(effectiveFrozenWindowRange.startIndex, effectiveFrozenWindowRange.endIndex)
        .map((entry) => dynamicColumnLayoutByColumn.get(entry.column) ?? entry)
      : [];

    const virtualEntries = nonFrozenEntries.length > 0
      ? nonFrozenEntries
        .slice(effectiveWindowRange.startIndex, effectiveWindowRange.endIndex)
        .map((entry) => dynamicColumnLayoutByColumn.get(entry.column) ?? entry)
      : [];

    const leadingSpacerWidth = nonFrozenPrefixSums[effectiveWindowRange.startIndex] ?? 0;
    const trailingSpacerWidth = Math.max(
      0,
      (nonFrozenPrefixSums[nonFrozenPrefixSums.length - 1] ?? 0) - (nonFrozenPrefixSums[effectiveWindowRange.endIndex] ?? 0),
    );

    const cacheKey = [
      columns.length,
      effectiveFrozenWindowRange.startIndex,
      effectiveFrozenWindowRange.endIndex,
      effectiveWindowRange.startIndex,
      effectiveWindowRange.endIndex,
      layout.clampedFrozenCount,
      paneState.visibleFrozenWidth,
      paneState.clampedFrozenScrollLeft,
    ].join(':');
    const nextCache = resolveStableHorizontalColumnEntries(
      columnEntriesCacheRef.current,
      cacheKey,
      layout,
      [...visibleFrozenEntries, ...virtualEntries],
    );
    columnEntriesCacheRef.current = nextCache;
    const columnEntries = nextCache.entries;

    return {
      columnEntries,
      totalWidth: paneState.visibleFrozenWidth + totalNonFrozenWidth,
      frozenWidth: paneState.visibleFrozenWidth,
      fullFrozenWidth,
      frozenScrollLeft: paneState.clampedFrozenScrollLeft,
      isFrozenOverflowing: paneState.isFrozenOverflowing,
      leadingSpacerWidth,
      trailingSpacerWidth,
      columnLayoutByColumn: dynamicColumnLayoutByColumn,
      debug: {
        viewportWidth,
        scrollLeft: scrollLeftRef.current,
        frozenScrollLeft: paneState.clampedFrozenScrollLeft,
        visibleColumnCount: effectiveWindowRange.visibleColumnCount,
        overscan: Math.max(effectiveWindowRange.overscan, effectiveFrozenWindowRange.overscan),
        rangeUpdates: rangeUpdateCountRef.current,
        lastCalcMs: lastCalcMsRef.current,
      },
    };
  }, [
    columns.length,
    effectiveFrozenWindowRange.endIndex,
    effectiveFrozenWindowRange.overscan,
    effectiveFrozenWindowRange.startIndex,
    effectiveWindowRange,
    layout,
    paneState.clampedFrozenScrollLeft,
    paneState.isFrozenOverflowing,
    paneState.visibleFrozenWidth,
    viewportWidth,
  ]);
}
