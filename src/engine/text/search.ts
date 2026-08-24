// src/engine/search.ts  —  Full-text search  [v4 — typecheck clean]

import type { DiffLine, SearchMatch } from '@/types';

export interface SearchOptions {
  isRegex: boolean;
  isCaseSensitive: boolean;
}

export interface SearchScanResult {
  matches: SearchMatch[];
  totalCount: number;
  truncated: boolean;
}

export type SearchPatternCompilation =
  | { status: 'empty'; pattern: null }
  | { status: 'ready'; pattern: RegExp }
  | { status: 'invalid'; pattern: null };

const MAX_MATERIALIZED_SEARCH_MATCHES = 100_000;

export function compileSearchPattern(
  query: string,
  options: SearchOptions,
): SearchPatternCompilation {
  if (!query) return { status: 'empty', pattern: null };
  const source = options.isRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return {
      status: 'ready',
      pattern: new RegExp(source, options.isCaseSensitive ? 'g' : 'gi'),
    };
  } catch {
    return { status: 'invalid', pattern: null };
  }
}

export function buildSearchPattern(
  query: string,
  options: SearchOptions,
): RegExp | null {
  return compileSearchPattern(query, options).pattern;
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
  return scanMatchesInSearchableLines(lines, pattern, Number.POSITIVE_INFINITY).matches;
}

export function scanMatchesInSearchableLines(
  lines: readonly string[],
  pattern: RegExp | null,
  maxMaterializedMatches = MAX_MATERIALIZED_SEARCH_MATCHES,
  lineStartOffsets: readonly number[] | null = null,
): SearchScanResult {
  if (!pattern) return { matches: [], totalCount: 0, truncated: false };
  const results: SearchMatch[] = [];
  let totalCount = 0;
  const materializedLimit = Math.max(0, Math.floor(maxMaterializedMatches));

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const content = lines[lineIdx] ?? '';
    if (!content) continue;
    const requestedStartOffset = lineStartOffsets?.[lineIdx] ?? 0;
    const startOffset = Number.isFinite(requestedStartOffset)
      ? Math.max(0, Math.min(content.length, Math.floor(requestedStartOffset)))
      : 0;
    const searchableContent = startOffset > 0 ? content.slice(startOffset) : content;
    if (!searchableContent) continue;

    pattern.lastIndex = 0;
    try {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(searchableContent)) !== null) {
        totalCount += 1;
        if (results.length < materializedLimit) {
          results.push({
            lineIdx,
            start: startOffset + match.index,
            end: startOffset + match.index + match[0].length,
            workbookTarget: null,
          });
        }
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
    } catch {
      pattern.lastIndex = 0;
    }
  }

  return {
    matches: results,
    totalCount,
    truncated: totalCount > results.length,
  };
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
