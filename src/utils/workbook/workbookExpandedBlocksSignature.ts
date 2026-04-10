import type { CollapseExpansionState } from '@/utils/collapse/collapseState';

export function buildWorkbookExpandedBlocksSignature(state: CollapseExpansionState): string {
  const keys = Object.keys(state).sort();
  if (keys.length === 0) return '';
  return keys.map((key) => {
    const ranges = state[key] ?? [];
    return `${key}:${ranges.map((range) => `${range.start}-${range.end}`).join(',')}`;
  }).join('|');
}
