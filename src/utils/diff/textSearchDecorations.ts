import type { SearchMatch } from '@/types';
import type { TokenSearchRange } from '@/components/shared/TokenText';

export interface TextSearchDecorations {
  searchMatchSet: Set<number>;
  activeSearchLineIdx: number;
  searchRangesByLineIdx: Map<number, TokenSearchRange[]>;
}

export function buildTextSearchDecorations(
  searchMatches: readonly SearchMatch[],
  activeSearchIdx: number,
): TextSearchDecorations {
  const searchMatchSet = new Set<number>();
  const searchRangesByLineIdx = new Map<number, TokenSearchRange[]>();

  searchMatches.forEach((match, index) => {
    searchMatchSet.add(match.lineIdx);
    const ranges = searchRangesByLineIdx.get(match.lineIdx) ?? [];
    ranges.push({
      start: match.start,
      end: match.end,
      active: index === activeSearchIdx,
    });
    searchRangesByLineIdx.set(match.lineIdx, ranges);
  });

  return {
    searchMatchSet,
    activeSearchLineIdx: activeSearchIdx >= 0
      ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
      : -1,
    searchRangesByLineIdx,
  };
}
