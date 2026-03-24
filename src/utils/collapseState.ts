export type CollapseExpansionState = Record<string, number>;

export function getExpandedHiddenCount(
  state: CollapseExpansionState,
  blockId: string,
): number {
  return state[blockId] ?? 0;
}

export function getNextExpandedHiddenCount(
  hiddenCount: number,
  _currentExpandedCount: number,
): number {
  return hiddenCount;
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
