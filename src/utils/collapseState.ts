export type CollapseExpansionState = Record<string, number>;

export const COLLAPSE_EXPAND_CHUNK = 320;
export const COLLAPSE_EXPAND_DIRECT_THRESHOLD = 480;

export function getExpandedHiddenCount(
  state: CollapseExpansionState,
  blockId: string,
): number {
  return state[blockId] ?? 0;
}

export function getNextExpandedHiddenCount(
  hiddenCount: number,
  currentExpandedCount: number,
): number {
  if (hiddenCount <= COLLAPSE_EXPAND_DIRECT_THRESHOLD) return hiddenCount;
  const nextExpandedCount = currentExpandedCount > 0
    ? currentExpandedCount + COLLAPSE_EXPAND_CHUNK
    : COLLAPSE_EXPAND_CHUNK;
  return Math.min(hiddenCount, nextExpandedCount);
}

export function expandCollapseBlock(
  state: CollapseExpansionState,
  blockId: string,
  hiddenCount: number,
): CollapseExpansionState {
  const currentExpandedCount = getExpandedHiddenCount(state, blockId);
  const nextExpandedCount = getNextExpandedHiddenCount(hiddenCount, currentExpandedCount);
  if (nextExpandedCount === currentExpandedCount) return state;
  return {
    ...state,
    [blockId]: nextExpandedCount,
  };
}
