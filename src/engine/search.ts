// src/engine/search.ts  —  Full-text search  [v4 — typecheck clean]

import type { DiffLine, SearchMatch } from '../types';

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

export function findMatches(
  diffLines: DiffLine[],
  pattern: RegExp | null,
): SearchMatch[] {
  if (!pattern) return [];
  const results: SearchMatch[] = [];

  for (let lineIdx = 0; lineIdx < diffLines.length; lineIdx++) {
    // lineIdx < diffLines.length — guaranteed in-bounds
    const line = diffLines[lineIdx]!;
    const content: string =
      line.type === 'delete'
        ? (line.base ?? '')
        : (line.mine ?? line.base ?? '');

    if (!content) continue;

    pattern.lastIndex = 0;
    try {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(content)) !== null) {
        results.push({ lineIdx, start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) pattern.lastIndex++;
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

export interface ContentSegment {
  text: string;
  isMatch: boolean;
  isActive: boolean;
}

export function buildHighlightSegments(
  content: string,
  lineMatches: SearchMatch[],
  activeMatchIdx: number,
): ContentSegment[] {
  if (!content || lineMatches.length === 0) {
    return [{ text: content, isMatch: false, isActive: false }];
  }
  const segs: ContentSegment[] = [];
  let pos = 0;
  lineMatches.forEach((m, i) => {
    if (pos < m.start) segs.push({ text: content.slice(pos, m.start), isMatch: false, isActive: false });
    segs.push({ text: content.slice(m.start, m.end), isMatch: true, isActive: i === activeMatchIdx });
    pos = m.end;
  });
  if (pos < content.length) segs.push({ text: content.slice(pos), isMatch: false, isActive: false });
  return segs;
}
