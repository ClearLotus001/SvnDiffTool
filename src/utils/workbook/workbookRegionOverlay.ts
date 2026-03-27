import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookDiffRegion } from '@/types';
import {
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

export function buildWorkbookRegionOverlayBox(
  options: WorkbookRegionOverlayGeometryOptions,
): WorkbookRegionOverlayBox | null {
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

  const visibleRows = Array.from(visibleRowFrames.entries())
    .filter(([rowIndex]) => rowIndex >= region.startRowIndex && rowIndex <= region.endRowIndex)
    .sort((left, right) => left[0] - right[0]);
  if (visibleRows.length === 0 || boundsModes.length === 0) return null;

  const firstVisibleRowIndex = visibleRows[0]?.[0] ?? region.startRowIndex;
  const lastVisibleRowIndex = visibleRows[visibleRows.length - 1]?.[0] ?? region.endRowIndex;
  const top = Math.min(...visibleRows.map(([, frame]) => frame.top));
  const bottom = Math.max(...visibleRows.map(([, frame]) => frame.top + frame.height));
  const geometries = boundsModes.flatMap((mode) => {
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
    return geometry ? [geometry] : [];
  });

  if (geometries.length === 0) return null;

  const left = Math.min(...geometries.map((geometry) => geometry.left));
  const right = Math.max(...geometries.map((geometry) => geometry.right));

  return {
    key,
    top: Math.max(0, top),
    left: Math.max(0, left),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    openTop: firstVisibleRowIndex > region.startRowIndex,
    openBottom: lastVisibleRowIndex < region.endRowIndex,
  };
}
