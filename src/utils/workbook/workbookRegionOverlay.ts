import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookDiffRegion, WorkbookRowDeltaTone } from '@/types';
import {
  type WorkbookColumnSpanBounds,
  type WorkbookCanvasSpanGeometry,
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
} from '@/utils/workbook/workbookMergeLayout';
import {
  mergeWorkbookSemanticTone,
  resolveWorkbookRegionTone,
  type WorkbookRowSemanticTone,
} from '@/utils/workbook/workbookRowVisuals';

export interface WorkbookRegionOverlayBox {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
  tone?: WorkbookRowSemanticTone;
  openTop?: boolean;
  openBottom?: boolean;
}

export type WorkbookRegionOverlayBoundsMode = 'single' | 'paired-shared' | 'paired-base' | 'paired-mine';

export interface WorkbookRegionHorizontalBounds {
  leftOffset: number;
  rightOffset: number;
  width: number;
}

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

function mergeWorkbookRegionHorizontalBounds(
  bounds: WorkbookColumnSpanBounds[],
): WorkbookRegionHorizontalBounds | null {
  if (bounds.length === 0) return null;

  const leftOffset = Math.min(...bounds.map((entry) => entry.leftOffset));
  const rightOffset = Math.max(...bounds.map((entry) => entry.rightOffset));
  return {
    leftOffset,
    rightOffset,
    width: Math.max(0, rightOffset - leftOffset),
  };
}

export function resolveWorkbookRegionHorizontalBounds(params: {
  region: WorkbookDiffRegion;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  freezeColumnCount: number;
  resolvePatchBoundsModes: (patch: WorkbookDiffRegion['patches'][number]) => WorkbookRegionOverlayBoundsMode[];
  fallbackBoundsModes?: WorkbookRegionOverlayBoundsMode[];
  filterPatch?: ((patch: WorkbookDiffRegion['patches'][number]) => boolean) | undefined;
}): WorkbookRegionHorizontalBounds | null {
  const {
    region,
    columnLayoutByColumn,
    freezeColumnCount,
    resolvePatchBoundsModes,
    fallbackBoundsModes = [],
    filterPatch,
  } = params;

  const patchBounds = region.patches.flatMap((patch) => {
    if (filterPatch && !filterPatch(patch)) return [];

    return resolvePatchBoundsModes(patch)
      .map((boundsMode) => getWorkbookColumnSpanBounds(
        patch.startCol,
        patch.endCol,
        columnLayoutByColumn,
        boundsMode,
        freezeColumnCount,
      ))
      .filter((bounds): bounds is WorkbookColumnSpanBounds => bounds != null);
  });

  if (patchBounds.length > 0) {
    return mergeWorkbookRegionHorizontalBounds(patchBounds);
  }

  const fallbackBounds = fallbackBoundsModes
    .map((boundsMode) => getWorkbookColumnSpanBounds(
      region.startCol,
      region.endCol,
      columnLayoutByColumn,
      boundsMode,
      freezeColumnCount,
    ))
    .filter((bounds): bounds is WorkbookColumnSpanBounds => bounds != null);

  return mergeWorkbookRegionHorizontalBounds(fallbackBounds);
}

export function buildWorkbookRegionOverlayBoxesFromGeometry(params: {
  geometry: WorkbookCanvasSpanGeometry;
  keyPrefix: string;
  top: number;
  bottom: number;
  tone?: WorkbookRowDeltaTone;
  openTop?: boolean;
  openBottom?: boolean;
}): WorkbookRegionOverlayBox[] {
  const {
    geometry,
    keyPrefix,
    top,
    bottom,
    tone,
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
      ...(tone ? { tone } : {}),
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
          tone: resolveWorkbookRegionTone(region.hasBaseSide, region.hasMineSide),
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
  const tone = boxes.reduce<WorkbookRowSemanticTone | undefined>((mergedTone, box) => (
    mergeWorkbookSemanticTone(mergedTone, box.tone)
  ), undefined);

  return {
    key: options.key,
    top: Math.max(0, top),
    left: Math.max(0, left),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    ...(tone ? { tone } : {}),
    openTop,
    openBottom,
  };
}
