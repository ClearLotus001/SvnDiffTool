export interface LineRangeSelection {
  anchorLineIdx: number;
  focusLineIdx: number;
}

export interface NormalizedLineRangeSelection extends LineRangeSelection {
  startLineIdx: number;
  endLineIdx: number;
}

export function normalizeLineRangeSelection(
  selection: LineRangeSelection,
): NormalizedLineRangeSelection {
  return {
    ...selection,
    startLineIdx: Math.min(selection.anchorLineIdx, selection.focusLineIdx),
    endLineIdx: Math.max(selection.anchorLineIdx, selection.focusLineIdx),
  };
}

export function updateLineRangeSelection(
  current: LineRangeSelection | null,
  lineIdx: number,
  extend: boolean,
) : LineRangeSelection | null {
  if (!extend || !current) {
    if (
      !extend
      && current
      && current.anchorLineIdx === current.focusLineIdx
      && current.focusLineIdx === lineIdx
    ) {
      return null;
    }

    return {
      anchorLineIdx: lineIdx,
      focusLineIdx: lineIdx,
    };
  }

  if (current.anchorLineIdx === current.focusLineIdx && current.focusLineIdx === lineIdx) {
    return current;
  }

  return {
    anchorLineIdx: current.anchorLineIdx,
    focusLineIdx: lineIdx,
  };
}

export function isLineIdxWithinSelection(
  selection: LineRangeSelection | null,
  lineIdx: number | null | undefined,
): boolean {
  if (!selection || lineIdx == null) return false;
  const normalized = normalizeLineRangeSelection(selection);
  return lineIdx >= normalized.startLineIdx && lineIdx <= normalized.endLineIdx;
}

export function getSelectedLineCount(
  selection: LineRangeSelection | null,
): number {
  if (!selection) return 0;
  const normalized = normalizeLineRangeSelection(selection);
  return normalized.endLineIdx - normalized.startLineIdx + 1;
}

export function doesSelectionIntersectLineRange(
  selection: LineRangeSelection | null,
  startLineIdx: number | null | undefined,
  endLineIdx: number | null | undefined,
): boolean {
  if (!selection || startLineIdx == null || endLineIdx == null) return false;
  const normalized = normalizeLineRangeSelection(selection);
  return startLineIdx <= normalized.endLineIdx && endLineIdx >= normalized.startLineIdx;
}
