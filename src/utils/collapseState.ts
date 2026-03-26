export interface CollapseRevealRange {
  start: number;
  end: number;
}

export type CollapseExpansionState = Record<string, CollapseRevealRange[]>;

const TARGET_REVEAL_RADIUS = 24;

function normalizeRevealRanges(
  ranges: CollapseRevealRange[],
  hiddenCount: number | null = null,
): CollapseRevealRange[] {
  const upperBound = hiddenCount == null ? Number.POSITIVE_INFINITY : Math.max(0, hiddenCount - 1);
  const normalized = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, upperBound)),
      end: Math.max(0, Math.min(range.end, upperBound)),
    }))
    .filter((range) => range.start <= range.end)
    .sort((left, right) => left.start - right.start);

  if (normalized.length <= 1) return normalized;

  const merged: CollapseRevealRange[] = [normalized[0]!];
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index]!;
    const previous = merged[merged.length - 1]!;
    if (current.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}

function areRangesEqual(left: CollapseRevealRange[], right: CollapseRevealRange[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]!.start !== right[index]!.start || left[index]!.end !== right[index]!.end) {
      return false;
    }
  }
  return true;
}

function mergeRangesIntoState(
  state: CollapseExpansionState,
  blockId: string,
  addedRanges: CollapseRevealRange[],
): CollapseExpansionState {
  const currentRanges = state[blockId] ?? [];
  const nextRanges = normalizeRevealRanges([...currentRanges, ...addedRanges]);
  if (areRangesEqual(currentRanges, nextRanges)) return state;
  return {
    ...state,
    [blockId]: nextRanges,
  };
}

function buildSegmentEdgeRanges(
  segmentStart: number,
  segmentEnd: number,
  revealCount: number,
): CollapseRevealRange[] {
  const segmentLength = segmentEnd - segmentStart + 1;
  if (revealCount >= segmentLength) {
    return [{ start: segmentStart, end: segmentEnd }];
  }

  const leadingCount = Math.ceil(revealCount / 2);
  const trailingCount = Math.floor(revealCount / 2);

  return normalizeRevealRanges([
    { start: segmentStart, end: segmentStart + leadingCount - 1 },
    { start: segmentEnd - trailingCount + 1, end: segmentEnd },
  ]);
}

export function getCollapseRevealRanges(
  state: CollapseExpansionState,
  blockId: string,
  hiddenCount: number,
): CollapseRevealRange[] {
  if (hiddenCount <= 0) return [];
  return normalizeRevealRanges(state[blockId] ?? [], hiddenCount);
}

export function getCollapseExpandStep(totalHiddenCount: number): number {
  if (totalHiddenCount <= 500) return totalHiddenCount;
  if (totalHiddenCount <= 5_000) return 500;
  if (totalHiddenCount <= 50_000) return 2_000;
  return 5_000;
}

export function getCollapseLeadingRevealCount(
  hiddenCount: number,
  revealCount: number,
): number {
  if (hiddenCount <= 0 || revealCount <= 0 || revealCount >= hiddenCount) return 0;
  return Math.ceil(revealCount / 2);
}

export function getExpandedHiddenCount(
  state: CollapseExpansionState,
  blockId: string,
): number {
  return normalizeRevealRanges(state[blockId] ?? []).reduce((sum, range) => (
    sum + (range.end - range.start + 1)
  ), 0);
}

export function expandCollapseBlock(
  state: CollapseExpansionState,
  blockId: string,
  segmentStart: number,
  segmentEnd: number,
  revealCount: number,
): CollapseExpansionState {
  if (segmentEnd < segmentStart || revealCount <= 0) return state;
  return mergeRangesIntoState(
    state,
    blockId,
    buildSegmentEdgeRanges(segmentStart, segmentEnd, revealCount),
  );
}

export function expandCollapseBlockFully(
  state: CollapseExpansionState,
  blockId: string,
  segmentStart: number,
  segmentEnd: number,
): CollapseExpansionState {
  if (segmentEnd < segmentStart) return state;
  return mergeRangesIntoState(state, blockId, [{ start: segmentStart, end: segmentEnd }]);
}

export function revealCollapsedLine(
  state: CollapseExpansionState,
  blockId: string,
  segmentStart: number,
  segmentEnd: number,
  targetIndex: number,
  radius = TARGET_REVEAL_RADIUS,
): CollapseExpansionState {
  if (segmentEnd < segmentStart) return state;
  if (targetIndex < segmentStart || targetIndex > segmentEnd) return state;

  const start = Math.max(segmentStart, targetIndex - radius);
  const end = Math.min(segmentEnd, targetIndex + radius);
  return mergeRangesIntoState(state, blockId, [{ start, end }]);
}
