import type { SplitRow } from '../types';

export type TextVerticalRenderMode = 'single-left' | 'single-right' | 'single-equal' | 'double';

export function getTextVerticalRenderMode(row: SplitRow): TextVerticalRenderMode {
  if (row.left?.type === 'delete' && row.right == null) {
    return 'single-left';
  }

  if (row.left == null && row.right?.type === 'add') {
    return 'single-right';
  }

  if (
    row.left?.type === 'equal'
    && row.right?.type === 'equal'
    && row.left.base != null
    && row.right.mine != null
    && row.left.base === row.right.mine
  ) {
    return 'single-equal';
  }

  return 'double';
}
