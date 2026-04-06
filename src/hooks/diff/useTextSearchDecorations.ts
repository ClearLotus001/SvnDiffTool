import { useMemo } from 'react';

import type { SearchMatch } from '@/types';
import {
  buildTextSearchDecorations,
  type TextSearchDecorations,
} from '@/utils/diff/textSearchDecorations';

export function useTextSearchDecorations(
  searchMatches: readonly SearchMatch[],
  activeSearchIdx: number,
): TextSearchDecorations {
  return useMemo(
    () => buildTextSearchDecorations(searchMatches, activeSearchIdx),
    [activeSearchIdx, searchMatches],
  );
}
