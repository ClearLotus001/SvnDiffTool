import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  SEARCH_RESULTS_PANEL_HEIGHT_STORAGE_KEY,
  SEARCH_RESULTS_PANEL_WIDTH_STORAGE_KEY,
  clampSearchResultsPanelHeight,
  clampSearchResultsPanelPosition,
  clampSearchResultsPanelWidth,
  getSearchResultsPanelHeightBounds,
  getSearchResultsPanelHeightRatio,
  getSearchResultsPanelWidthBounds,
  getSearchResultsPanelWidthRatio,
  parseSearchResultsPanelWidthRatio,
  resizeSearchResultsPanelProportionally,
  resolveSearchResultsPanelHeight,
  resolveSearchResultsPanelWidth,
  type SearchResultsPanelPosition,
  type SearchResultsPanelSize,
} from '@/utils/diff/searchResultsPanelLayout';

type SearchResultsPanelResizeMode = 'width' | 'height' | 'proportional';

interface UseSearchResultsPanelSizeOptions {
  panelRef: MutableRefObject<HTMLDivElement | null>;
  currentPositionRef: MutableRefObject<SearchResultsPanelPosition>;
  onPositionChange: (position: SearchResultsPanelPosition) => void;
}

interface SearchResultsPanelResizeStart {
  mode: SearchResultsPanelResizeMode;
  clientX: number;
  clientY: number;
  size: SearchResultsPanelSize;
}

function readStoredRatio(storageKey: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseSearchResultsPanelWidthRatio(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function saveStoredRatio(storageKey: string, ratio: number): void {
  try {
    window.localStorage.setItem(storageKey, String(ratio));
  } catch {
    // Keep resizing available when storage is blocked.
  }
}

export default function useSearchResultsPanelSize({
  panelRef,
  currentPositionRef,
  onPositionChange,
}: UseSearchResultsPanelSizeOptions) {
  const [initialRatios] = useState(() => ({
    width: readStoredRatio(SEARCH_RESULTS_PANEL_WIDTH_STORAGE_KEY),
    height: readStoredRatio(SEARCH_RESULTS_PANEL_HEIGHT_STORAGE_KEY),
  }));
  const initialViewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const initialViewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const [panelSize, setPanelSize] = useState<SearchResultsPanelSize>(() => ({
    width: resolveSearchResultsPanelWidth(initialRatios.width, initialViewportWidth),
    height: resolveSearchResultsPanelHeight(initialRatios.height, initialViewportHeight),
  }));
  const panelSizeRef = useRef(panelSize);
  const widthRatioRef = useRef(
    initialRatios.width ?? getSearchResultsPanelWidthRatio(panelSize.width, initialViewportWidth),
  );
  const heightRatioRef = useRef(
    initialRatios.height ?? getSearchResultsPanelHeightRatio(panelSize.height, initialViewportHeight),
  );
  const resizeStartRef = useRef<SearchResultsPanelResizeStart | null>(null);
  const pendingSizeRef = useRef(panelSize);
  const resizeFrameRef = useRef(0);
  const [activeResizeMode, setActiveResizeMode] = useState<SearchResultsPanelResizeMode | null>(null);

  const applySize = useCallback((nextSize: SearchResultsPanelSize, persist: boolean) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clampedSize = {
      width: clampSearchResultsPanelWidth(nextSize.width, viewportWidth),
      height: clampSearchResultsPanelHeight(nextSize.height, viewportHeight),
    };
    panelSizeRef.current = clampedSize;
    pendingSizeRef.current = clampedSize;
    widthRatioRef.current = getSearchResultsPanelWidthRatio(clampedSize.width, viewportWidth);
    heightRatioRef.current = getSearchResultsPanelHeightRatio(clampedSize.height, viewportHeight);
    const nextPosition = clampSearchResultsPanelPosition(
      currentPositionRef.current,
      clampedSize,
      viewportWidth,
      viewportHeight,
    );
    currentPositionRef.current = nextPosition;
    const panel = panelRef.current;
    if (panel) {
      panel.style.width = `${clampedSize.width}px`;
      panel.style.height = `${clampedSize.height}px`;
      panel.style.left = `${nextPosition.left}px`;
      panel.style.top = `${nextPosition.top}px`;
    }
    setPanelSize(clampedSize);
    if (persist) {
      saveStoredRatio(SEARCH_RESULTS_PANEL_WIDTH_STORAGE_KEY, widthRatioRef.current);
      saveStoredRatio(SEARCH_RESULTS_PANEL_HEIGHT_STORAGE_KEY, heightRatioRef.current);
      onPositionChange(nextPosition);
    }
  }, [currentPositionRef, onPositionChange, panelRef]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) return;
      const deltaX = event.clientX - resizeStart.clientX;
      const deltaY = event.clientY - resizeStart.clientY;
      if (resizeStart.mode === 'width') {
        pendingSizeRef.current = {
          width: clampSearchResultsPanelWidth(
            resizeStart.size.width + deltaX,
            window.innerWidth,
          ),
          height: resizeStart.size.height,
        };
      } else if (resizeStart.mode === 'height') {
        pendingSizeRef.current = {
          width: resizeStart.size.width,
          height: clampSearchResultsPanelHeight(
            resizeStart.size.height + deltaY,
            window.innerHeight,
          ),
        };
      } else {
        pendingSizeRef.current = resizeSearchResultsPanelProportionally(
          resizeStart.size,
          deltaX,
          deltaY,
          window.innerWidth,
          window.innerHeight,
        );
      }
      if (resizeFrameRef.current) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = 0;
        applySize(pendingSizeRef.current, false);
      });
    };
    const stopResizing = () => {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      setActiveResizeMode(null);
      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = 0;
      }
      applySize(pendingSizeRef.current, true);
    };
    const handleViewportResize = () => {
      applySize({
        width: resolveSearchResultsPanelWidth(widthRatioRef.current, window.innerWidth),
        height: resolveSearchResultsPanelHeight(heightRatioRef.current, window.innerHeight),
      }, true);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    window.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      window.removeEventListener('resize', handleViewportResize);
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = 0;
      resizeStartRef.current = null;
    };
  }, [applySize]);

  const startResize = useCallback((
    mode: SearchResultsPanelResizeMode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = {
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      size: panelSizeRef.current,
    };
    pendingSizeRef.current = panelSizeRef.current;
    setActiveResizeMode(mode);
  }, []);

  const handleWidthResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    startResize('width', event);
  }, [startResize]);
  const handleHeightResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    startResize('height', event);
  }, [startResize]);
  const handleProportionalResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    startResize('proportional', event);
  }, [startResize]);

  const handleWidthResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { minWidth, maxWidth } = getSearchResultsPanelWidthBounds(window.innerWidth);
    let nextWidth: number | null = null;
    if (event.key === 'ArrowLeft') nextWidth = panelSizeRef.current.width - 32;
    if (event.key === 'ArrowRight') nextWidth = panelSizeRef.current.width + 32;
    if (event.key === 'Home') nextWidth = minWidth;
    if (event.key === 'End') nextWidth = maxWidth;
    if (nextWidth == null) return;
    event.preventDefault();
    event.stopPropagation();
    applySize({ ...panelSizeRef.current, width: nextWidth }, true);
  }, [applySize]);

  const handleHeightResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { minHeight, maxHeight } = getSearchResultsPanelHeightBounds(window.innerHeight);
    let nextHeight: number | null = null;
    if (event.key === 'ArrowUp') nextHeight = panelSizeRef.current.height - 28;
    if (event.key === 'ArrowDown') nextHeight = panelSizeRef.current.height + 28;
    if (event.key === 'Home') nextHeight = minHeight;
    if (event.key === 'End') nextHeight = maxHeight;
    if (nextHeight == null) return;
    event.preventDefault();
    event.stopPropagation();
    applySize({ ...panelSizeRef.current, height: nextHeight }, true);
  }, [applySize]);

  const handleProportionalResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    let delta: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') delta = -40;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') delta = 40;
    if (event.key === 'Home') delta = -1_000_000;
    if (event.key === 'End') delta = 1_000_000;
    if (delta == null) return;
    event.preventDefault();
    event.stopPropagation();
    applySize(resizeSearchResultsPanelProportionally(
      panelSizeRef.current,
      delta,
      delta,
      window.innerWidth,
      window.innerHeight,
    ), true);
  }, [applySize]);

  return {
    panelSize,
    panelSizeRef,
    activeResizeMode,
    handleWidthResizePointerDown,
    handleHeightResizePointerDown,
    handleProportionalResizePointerDown,
    handleWidthResizeKeyDown,
    handleHeightResizeKeyDown,
    handleProportionalResizeKeyDown,
  };
}
