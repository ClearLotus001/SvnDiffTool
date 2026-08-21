const HIDDEN_COLUMN_MARKER_MIN_WIDTH = 36;

export function formatWorkbookHiddenColumnMarkerCount(count: number): string {
  return String(Math.max(0, Math.floor(count)));
}

export function getWorkbookHiddenColumnMarkerWidth(count: number): number {
  const label = formatWorkbookHiddenColumnMarkerCount(count);
  return Math.max(HIDDEN_COLUMN_MARKER_MIN_WIDTH, 29 + (label.length * 7));
}
