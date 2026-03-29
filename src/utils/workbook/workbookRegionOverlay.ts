import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookDiffRegion } from '@/types';
import {
  type WorkbookCanvasSpanGeometry,
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
} from '@/utils/workbook/workbookMergeLayout';

export interface WorkbookRegionOverlayBox {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
  openTop?: boolean;
  openBottom?: boolean;
}

export type WorkbookRegionOverlayBoundsMode = 'single' | 'paired-base' | 'paired-mine';

interface WorkbookRegionOverlayGeometryOptions {
  region: WorkbookDiffRegion;
  visibleRowFrames: Map<number, { top: number; height: number }>;
  boundsModes: WorkbookRegionOverlayBoundsMode[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  scrollLeft: number;
  frozenWidth: number;
  freezeColumnCount: number;
  key: string;
}

interface WorkbookRegionOverlayVerticalBounds {
  top: number;
  bottom: number;
  openTop: boolean;
  openBottom: boolean;
}

function getWorkbookRegionOverlayVerticalBounds(
  region: WorkbookDiffRegion,
  visibleRowFrames: Map<number, { top: number; height: number }>,
): WorkbookRegionOverlayVerticalBounds | null {
  const visibleRows = Array.from(visibleRowFrames.entries())
    .filter(([rowIndex]) => rowIndex >= region.startRowIndex && rowIndex <= region.endRowIndex)
    .sort((left, right) => left[0] - right[0]);
  if (visibleRows.length === 0) return null;

  const firstVisibleRowIndex = visibleRows[0]?.[0] ?? region.startRowIndex;
  const lastVisibleRowIndex = visibleRows[visibleRows.length - 1]?.[0] ?? region.endRowIndex;

  return {
    top: Math.min(...visibleRows.map(([, frame]) => frame.top)),
    bottom: Math.max(...visibleRows.map(([, frame]) => frame.top + frame.height)),
    openTop: firstVisibleRowIndex > region.startRowIndex,
    openBottom: lastVisibleRowIndex < region.endRowIndex,
  };
}

export function buildWorkbookRegionOverlayBoxesFromGeometry(params: {
  geometry: WorkbookCanvasSpanGeometry;
  keyPrefix: string;
  top: number;
  bottom: number;
  openTop?: boolean;
  openBottom?: boolean;
}): WorkbookRegionOverlayBox[] {
  const {
    geometry,
    keyPrefix,
    top,
    bottom,
    openTop = false,
    openBottom = false,
  } = params;

  return geometry.segments
    .filter((segment) => segment.width > 0)
    .map((segment, segmentIndex) => ({
      key: `${keyPrefix}:segment-${segmentIndex}`,
      top: Math.max(0, top),
      left: Math.max(0, segment.left),
      width: Math.max(0, segment.width),
      height: Math.max(0, bottom - top),
      openTop,
      openBottom,
    }));
}

export function buildWorkbookRegionOverlayBoxes(
  options: WorkbookRegionOverlayGeometryOptions,
): WorkbookRegionOverlayBox[] {
  const {
    region,
    visibleRowFrames,
    boundsModes,
    columnLayoutByColumn,
    contentLeft,
    scrollLeft,
    frozenWidth,
    freezeColumnCount,
    key,
  } = options;

  const verticalBounds = getWorkbookRegionOverlayVerticalBounds(region, visibleRowFrames);
  if (!verticalBounds || boundsModes.length === 0) return [];

  return boundsModes.flatMap((mode, modeIndex) => {
    const bounds = getWorkbookColumnSpanBounds(
      region.startCol,
      region.endCol,
      columnLayoutByColumn,
      mode,
      freezeColumnCount,
    );
    const geometry = bounds
      ? getWorkbookCanvasSpanGeometry(bounds, contentLeft, scrollLeft, frozenWidth)
      : null;
    return geometry
      ? buildWorkbookRegionOverlayBoxesFromGeometry({
          geometry,
          keyPrefix: `${key}:${mode}:${modeIndex}`,
          top: verticalBounds.top,
          bottom: verticalBounds.bottom,
          openTop: verticalBounds.openTop,
          openBottom: verticalBounds.openBottom,
        })
      : [];
  });
}

export function buildWorkbookRegionOverlayBox(
  options: WorkbookRegionOverlayGeometryOptions,
): WorkbookRegionOverlayBox | null {
  const boxes = buildWorkbookRegionOverlayBoxes(options);
  if (boxes.length === 0) return null;

  const left = Math.min(...boxes.map((box) => box.left));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  const openTop = boxes.some((box) => box.openTop);
  const openBottom = boxes.some((box) => box.openBottom);

  return {
    key: options.key,
    top: Math.max(0, top),
    left: Math.max(0, left),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    openTop,
    openBottom,
  };
}
