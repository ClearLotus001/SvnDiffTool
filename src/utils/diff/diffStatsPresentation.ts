import type { TextDiffStats } from '@/types';

export interface DisplayedDiffStats {
  added: number;
  removed: number;
  modified: number;
}

/**
 * A modification occupies one removed line and one added line in the rendered
 * diff, while also remaining visible as its own semantic category.
 */
export function resolveDisplayedDiffStats(stats: TextDiffStats): DisplayedDiffStats {
  return {
    added: stats.add + stats.chg,
    removed: stats.del + stats.chg,
    modified: stats.chg,
  };
}
