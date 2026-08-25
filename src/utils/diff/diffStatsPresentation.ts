import type { TextDiffStats } from '@/types';

export interface DisplayedDiffStats {
  added: number;
  removed: number;
  modified: number;
}

/** Mutually exclusive product-facing difference categories. */
export function resolveDisplayedDiffStats(stats: TextDiffStats): DisplayedDiffStats {
  return {
    added: stats.add,
    removed: stats.del,
    modified: stats.chg,
  };
}
