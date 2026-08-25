export const SEARCH_RESULTS_PANEL_WIDTH_STORAGE_KEY = 'versora.searchResultsPanelWidthRatio';
export const SEARCH_RESULTS_PANEL_HEIGHT_STORAGE_KEY = 'versora.searchResultsPanelHeightRatio';
const SEARCH_RESULTS_PANEL_DEFAULT_WIDTH = 920;
const SEARCH_RESULTS_PANEL_DEFAULT_HEIGHT = 460;
const SEARCH_RESULTS_PANEL_MIN_WIDTH = 520;
const SEARCH_RESULTS_PANEL_MIN_HEIGHT = 280;
const SEARCH_RESULTS_PANEL_VIEWPORT_PADDING = 16;

export interface SearchResultsPanelSize {
  width: number;
  height: number;
}

export interface SearchResultsPanelPosition {
  left: number;
  top: number;
}

export function parseSearchResultsPanelWidthRatio(value: string | null | undefined): number | null {
  if (!value) return null;
  const ratio = Number.parseFloat(value);
  return Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : null;
}

export function getSearchResultsPanelWidthBounds(viewportWidth: number): {
  minWidth: number;
  maxWidth: number;
} {
  const safeViewportWidth = Math.max(280, viewportWidth);
  const maxWidth = Math.max(
    280,
    safeViewportWidth - (SEARCH_RESULTS_PANEL_VIEWPORT_PADDING * 2),
  );
  return {
    minWidth: Math.min(SEARCH_RESULTS_PANEL_MIN_WIDTH, maxWidth),
    maxWidth,
  };
}

export function getSearchResultsPanelHeightBounds(viewportHeight: number): {
  minHeight: number;
  maxHeight: number;
} {
  const safeViewportHeight = Math.max(240, viewportHeight);
  const maxHeight = Math.max(
    240,
    safeViewportHeight - (SEARCH_RESULTS_PANEL_VIEWPORT_PADDING * 2),
  );
  return {
    minHeight: Math.min(SEARCH_RESULTS_PANEL_MIN_HEIGHT, maxHeight),
    maxHeight,
  };
}

export function clampSearchResultsPanelWidth(width: number, viewportWidth: number): number {
  const { minWidth, maxWidth } = getSearchResultsPanelWidthBounds(viewportWidth);
  const safeWidth = Number.isFinite(width) ? width : SEARCH_RESULTS_PANEL_DEFAULT_WIDTH;
  return Math.round(Math.max(minWidth, Math.min(maxWidth, safeWidth)));
}

export function resolveSearchResultsPanelWidth(
  widthRatio: number | null,
  viewportWidth: number,
): number {
  const preferredWidth = widthRatio == null
    ? SEARCH_RESULTS_PANEL_DEFAULT_WIDTH
    : viewportWidth * widthRatio;
  return clampSearchResultsPanelWidth(preferredWidth, viewportWidth);
}

export function clampSearchResultsPanelHeight(height: number, viewportHeight: number): number {
  const { minHeight, maxHeight } = getSearchResultsPanelHeightBounds(viewportHeight);
  const safeHeight = Number.isFinite(height) ? height : SEARCH_RESULTS_PANEL_DEFAULT_HEIGHT;
  return Math.round(Math.max(minHeight, Math.min(maxHeight, safeHeight)));
}

export function resolveSearchResultsPanelHeight(
  heightRatio: number | null,
  viewportHeight: number,
): number {
  const preferredHeight = heightRatio == null
    ? SEARCH_RESULTS_PANEL_DEFAULT_HEIGHT
    : viewportHeight * heightRatio;
  return clampSearchResultsPanelHeight(preferredHeight, viewportHeight);
}

export function getSearchResultsPanelWidthRatio(width: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return 1;
  return Math.max(0, Math.min(1, width / viewportWidth));
}

export function getSearchResultsPanelHeightRatio(height: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 1;
  return Math.max(0, Math.min(1, height / viewportHeight));
}

export function clampSearchResultsPanelLeft(
  left: number,
  panelWidth: number,
  viewportWidth: number,
): number {
  const minLeft = SEARCH_RESULTS_PANEL_VIEWPORT_PADDING;
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - panelWidth - SEARCH_RESULTS_PANEL_VIEWPORT_PADDING,
  );
  return Math.max(minLeft, Math.min(maxLeft, left));
}

export function clampSearchResultsPanelTop(
  top: number,
  panelHeight: number,
  viewportHeight: number,
): number {
  const minTop = SEARCH_RESULTS_PANEL_VIEWPORT_PADDING;
  const maxTop = Math.max(
    minTop,
    viewportHeight - panelHeight - SEARCH_RESULTS_PANEL_VIEWPORT_PADDING,
  );
  return Math.max(minTop, Math.min(maxTop, top));
}

export function clampSearchResultsPanelPosition(
  position: SearchResultsPanelPosition,
  size: SearchResultsPanelSize,
  viewportWidth: number,
  viewportHeight: number,
): SearchResultsPanelPosition {
  return {
    left: clampSearchResultsPanelLeft(position.left, size.width, viewportWidth),
    top: clampSearchResultsPanelTop(position.top, size.height, viewportHeight),
  };
}

export function resizeSearchResultsPanelProportionally(
  startSize: SearchResultsPanelSize,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): SearchResultsPanelSize {
  const { minWidth, maxWidth } = getSearchResultsPanelWidthBounds(viewportWidth);
  const { minHeight, maxHeight } = getSearchResultsPanelHeightBounds(viewportHeight);
  const widthDeltaRatio = deltaX / Math.max(1, startSize.width);
  const heightDeltaRatio = deltaY / Math.max(1, startSize.height);
  const requestedScale = Math.abs(widthDeltaRatio) >= Math.abs(heightDeltaRatio)
    ? 1 + widthDeltaRatio
    : 1 + heightDeltaRatio;
  const minScale = Math.max(
    minWidth / startSize.width,
    minHeight / startSize.height,
  );
  const maxScale = Math.min(
    maxWidth / startSize.width,
    maxHeight / startSize.height,
  );
  const scale = Math.max(minScale, Math.min(maxScale, requestedScale));
  return {
    width: Math.round(startSize.width * scale),
    height: Math.round(startSize.height * scale),
  };
}
