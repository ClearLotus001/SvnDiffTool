export interface MiniMapViewportMetrics {
  top: number;
  height: number;
  maxScrollTop: number;
  trackHeight: number;
}

export interface ComputeMiniMapViewportMetricsOptions {
  scrollTop: number;
  viewportHeight: number;
  contentHeight: number;
  minimapHeight: number;
  minViewportHeight?: number;
}

export interface ComputeMiniMapDragScrollTopOptions {
  pointerDeltaY: number;
  startScrollTop: number;
  maxScrollTop: number;
  trackHeight: number;
}

export interface ComputeMiniMapWheelScrollTopOptions {
  deltaY: number;
  deltaMode: number;
  currentScrollTop: number;
  maxScrollTop: number;
  viewportHeight: number;
  lineHeight?: number;
}

const DEFAULT_MINIMAP_VIEWPORT_HEIGHT = 20;
const WHEEL_DELTA_PIXEL = 0;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const DEFAULT_WHEEL_LINE_HEIGHT = 40;

function clamp(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.max(min, Math.min(max, value));
}

export function resolveMiniMapContentHeight(
  declaredContentHeight: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  return Math.max(declaredContentHeight, scrollHeight, viewportHeight, 1);
}

export function resolveMiniMapTrackHeight(
  minimapHeight: number,
  scrollerViewportHeight: number,
): number {
  const railHeight = Math.max(1, minimapHeight);
  const scrollbarTrackHeight = Math.max(1, scrollerViewportHeight);
  return Math.min(railHeight, scrollbarTrackHeight);
}

export function computeMiniMapViewportMetrics({
  scrollTop,
  viewportHeight,
  contentHeight,
  minimapHeight,
  minViewportHeight = DEFAULT_MINIMAP_VIEWPORT_HEIGHT,
}: ComputeMiniMapViewportMetricsOptions): MiniMapViewportMetrics {
  const mapHeight = Math.max(1, minimapHeight);
  const visibleHeight = Math.max(0, viewportHeight);
  const totalHeight = Math.max(contentHeight, visibleHeight, 1);
  const maxScrollTop = Math.max(0, totalHeight - visibleHeight);
  const rawViewportHeight = visibleHeight > 0
    ? (visibleHeight / totalHeight) * mapHeight
    : mapHeight;
  const height = Math.min(mapHeight, Math.max(minViewportHeight, rawViewportHeight));
  const trackHeight = Math.max(0, mapHeight - height);
  const scrollRatio = maxScrollTop > 0
    ? clamp(scrollTop / maxScrollTop, 0, 1)
    : 0;

  return {
    top: trackHeight > 0 ? scrollRatio * trackHeight : 0,
    height,
    maxScrollTop,
    trackHeight,
  };
}

export function computeMiniMapDragScrollTop({
  pointerDeltaY,
  startScrollTop,
  maxScrollTop,
  trackHeight,
}: ComputeMiniMapDragScrollTopOptions): number {
  if (maxScrollTop <= 0 || trackHeight <= 0) return 0;
  return clamp(
    startScrollTop + ((pointerDeltaY / trackHeight) * maxScrollTop),
    0,
    maxScrollTop,
  );
}

export function computeMiniMapWheelScrollTop({
  deltaY,
  deltaMode,
  currentScrollTop,
  maxScrollTop,
  viewportHeight,
  lineHeight = DEFAULT_WHEEL_LINE_HEIGHT,
}: ComputeMiniMapWheelScrollTopOptions): number {
  if (maxScrollTop <= 0 || deltaY === 0) return clamp(currentScrollTop, 0, maxScrollTop);

  const multiplier = deltaMode === WHEEL_DELTA_LINE
    ? lineHeight
    : deltaMode === WHEEL_DELTA_PAGE
      ? Math.max(1, viewportHeight)
      : deltaMode === WHEEL_DELTA_PIXEL
        ? 1
        : 1;

  return clamp(currentScrollTop + (deltaY * multiplier), 0, maxScrollTop);
}
