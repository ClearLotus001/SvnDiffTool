// src/engine/search.ts  —  Full-text search  [v4 — typecheck clean]

import type { DiffLine, SearchMatch } from '@/types';

export interface SearchOptions {
  isRegex: boolean;
  isCaseSensitive: boolean;
}

export function buildSearchPattern(
  query: string,
  options: SearchOptions,
): RegExp | null {
  if (!query) return null;
  const source = options.isRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(source, options.isCaseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

export function getSearchableLineContent(line: DiffLine): string {
  return line.type === 'delete'
    ? (line.base ?? '')
    : (line.mine ?? line.base ?? '');
}

export function findMatchesInSearchableLines(
  lines: readonly string[],
  pattern: RegExp | null,
): SearchMatch[] {
  if (!pattern) return [];
  const results: SearchMatch[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const content = lines[lineIdx] ?? '';
    if (!content) continue;

    pattern.lastIndex = 0;
    try {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        results.push({
          lineIdx,
          start: match.index,
          end: match.index + match[0].length,
          workbookTarget: null,
        });
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
    } catch {
      pattern.lastIndex = 0;
    }
  }

  return results;
}

export function navigateSearch(
  current: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  let next = current + direction;
  if (next < 0)      next = total - 1;
  if (next >= total) next = 0;
  return next;
}
