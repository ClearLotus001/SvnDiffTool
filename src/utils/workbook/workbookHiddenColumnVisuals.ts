const HIDDEN_COLUMN_MARKER_MIN_WIDTH = 36;
const HIDDEN_COLUMN_MARKER_FREEZE_GAP = 4;

export type WorkbookHiddenColumnMarkerLayer = 'frozen' | 'scroll';

export function formatWorkbookHiddenColumnMarkerCount(count: number): string {
  return String(Math.max(0, Math.floor(count)));
}

export function getWorkbookHiddenColumnMarkerWidth(count: number): number {
  const label = formatWorkbookHiddenColumnMarkerCount(count);
  return Math.max(HIDDEN_COLUMN_MARKER_MIN_WIDTH, 29 + (label.length * 7));
}

export function resolveWorkbookHiddenColumnMarkerLeft(params: {
  boundaryX: number;
  width: number;
  contentLeft: number;
  contentRight: number;
  frozenBoundaryX: number;
  layer: WorkbookHiddenColumnMarkerLayer;
}): number {
  const {
    boundaryX,
    width,
    contentLeft,
    contentRight,
    frozenBoundaryX,
    layer,
  } = params;
  const centeredLeft = boundaryX - (width / 2);
  const viewportMin = layer === 'scroll'
    ? frozenBoundaryX + HIDDEN_COLUMN_MARKER_FREEZE_GAP
    : contentLeft;
  const viewportMax = layer === 'frozen'
    ? frozenBoundaryX - width - HIDDEN_COLUMN_MARKER_FREEZE_GAP
    : contentRight - width;
  const safeMin = Math.min(viewportMin, viewportMax);
  const safeMax = Math.max(viewportMin, viewportMax);
  return Math.max(safeMin, Math.min(centeredLeft, safeMax));
}
