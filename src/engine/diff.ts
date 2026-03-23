// src/engine/diff.ts  —  Line-level diff (Patience LCS)  [v4 — typecheck clean]
//
// noUncheckedIndexedAccess fixes:
//  - All array[index] accesses now use !  where bounds are guaranteed, or
//    explicit undefined guards where they aren't.

import type { DiffLine, SplitRow } from '../types';
import { computeCharDiff } from './myers';

const MAX_LINES_FOR_DIFF    = 50_000;
const CHAR_DIFF_LINE_LIMIT  = 1000;

// ── Patience LCS ──────────────────────────────────────────────────────────────

interface LCSNode {
  bi: number;
  mi: number;
  prev: LCSNode | null;
}

interface LCSEntry { biIdx: number; miIdx: number; }

function patienceLCS(a: string[], b: string[]): LCSEntry[] {
  if (a.length === 0 || b.length === 0) return [];

  const bIndex = new Map<string, number[]>();
  b.forEach((line, i) => {
    const list = bIndex.get(line);
    if (list) list.push(i);
    else bIndex.set(line, [i]);
  });

  const piles: LCSNode[] = [];
  const tails: number[]  = [];

  for (let bi = 0; bi < a.length; bi++) {
    // a[bi] is guaranteed in-bounds (bi < a.length)
    const rawPositions = bIndex.get(a[bi]!);
    if (!rawPositions) continue;

    const positions = rawPositions.slice().sort((x, y) => x - y);

    for (const mi of positions) {
      let lo = 0, hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        // tails[mid]: mid < tails.length — guaranteed by binary search bounds
        if ((tails[mid] ?? 0) < mi) lo = mid + 1;
        else hi = mid;
      }
      // tails[lo-1]: lo > 0 guarantees lo-1 >= 0
      if (lo > 0 && (tails[lo - 1] ?? 0) >= mi) continue;

      const node: LCSNode = {
        bi,
        mi,
        // piles[lo-1]: lo > 0 guarantees existence; undefined treated as null
        prev: lo > 0 ? (piles[lo - 1] ?? null) : null,
      };
      piles[lo] = node;
      tails[lo] = mi;
    }
  }

  const result: LCSEntry[] = [];
  let node: LCSNode | null = piles[piles.length - 1] ?? null;
  while (node) {
    result.unshift({ biIdx: node.bi, miIdx: node.mi });
    node = node.prev;
  }
  return result;
}

// ── Main diff ─────────────────────────────────────────────────────────────────

export function computeDiff(baseText: string, mineText: string): DiffLine[] {
  const baseLines = splitLines(baseText);
  const mineLines = splitLines(mineText);
  const result: DiffLine[] = [];

  if (baseLines.length > MAX_LINES_FOR_DIFF || mineLines.length > MAX_LINES_FOR_DIFF) {
    baseLines.forEach((line, i) => result.push(makeLine('delete', line, null, i + 1, null)));
    mineLines.forEach((line, i) => result.push(makeLine('add', null, line, null, i + 1)));
    return result;
  }

  const lcs = patienceLCS(baseLines, mineLines);
  let bi = 0, mi = 0, li = 0;

  while (bi < baseLines.length || mi < mineLines.length) {
    const anchor = li < lcs.length ? lcs[li] : null;

    if (anchor && bi === anchor.biIdx && mi === anchor.miIdx) {
      // In-bounds: bi < baseLines.length and mi < mineLines.length guaranteed by anchor
      result.push(makeLine('equal', baseLines[bi]!, mineLines[mi]!, bi + 1, mi + 1));
      bi++; mi++; li++;
    } else {
      const delEnd    = anchor ? anchor.biIdx : baseLines.length;
      const addEnd    = anchor ? anchor.miIdx : mineLines.length;
      const safeDelEnd = Math.max(bi, delEnd);
      const safeAddEnd = Math.max(mi, addEnd);

      emitChangeBlock(result, baseLines.slice(bi, safeDelEnd), mineLines.slice(mi, safeAddEnd), bi, mi);
      bi = safeDelEnd;
      mi = safeAddEnd;
    }
  }

  return result;
}

function emitChangeBlock(
  result: DiffLine[],
  delLines: string[],
  addLines: string[],
  biBase: number,
  miBase: number,
): void {
  const pairCount = Math.min(delLines.length, addLines.length);
  const pairedCharSpans = Array.from({ length: pairCount }, () => ({
    baseSpans: null as DiffLine['baseCharSpans'],
    mineSpans: null as DiffLine['mineCharSpans'],
  }));

  for (let i = 0; i < pairCount; i++) {
    // i < pairCount <= delLines.length and addLines.length — guaranteed in-bounds
    const baseLine = delLines[i]!;
    const mineLine = addLines[i]!;

    if (baseLine.length <= CHAR_DIFF_LINE_LIMIT && mineLine.length <= CHAR_DIFF_LINE_LIMIT) {
      const r = computeCharDiff(baseLine, mineLine);
      if (r) {
        pairedCharSpans[i] = {
          baseSpans: r.baseSpans,
          mineSpans: r.mineSpans,
        };
      }
    }
  }

  for (let i = 0; i < delLines.length; i++) {
    result.push({
      type: 'delete',
      base: delLines[i]!,
      mine: null,
      baseLineNo: biBase + i + 1,
      mineLineNo: null,
      baseCharSpans: pairedCharSpans[i]?.baseSpans ?? null,
      mineCharSpans: null,
    });
  }

  for (let i = 0; i < addLines.length; i++) {
    result.push({
      type: 'add',
      base: null,
      mine: addLines[i]!,
      baseLineNo: null,
      mineLineNo: miBase + i + 1,
      baseCharSpans: null,
      mineCharSpans: pairedCharSpans[i]?.mineSpans ?? null,
    });
  }
}

function makeLine(
  type: DiffLine['type'],
  base: string | null,
  mine: string | null,
  baseLineNo: number | null,
  mineLineNo: number | null,
): DiffLine {
  return { type, base, mine, baseLineNo, mineLineNo, baseCharSpans: null, mineCharSpans: null };
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '' || lines[lines.length - 1] === '\r') lines.pop();
  return lines.map(l => l.endsWith('\r') ? l.slice(0, -1) : l);
}

// ── Hunk detection ────────────────────────────────────────────────────────────

export interface Hunk {
  startIdx: number;
  endIdx: number;
  addCount: number;
  delCount: number;
}

export function computeHunks(diffLines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < diffLines.length) {
    // i < diffLines.length — guaranteed in-bounds
    if (diffLines[i]!.type === 'equal') { i++; continue; }
    const start = i;
    let addCount = 0, delCount = 0;
    while (i < diffLines.length && diffLines[i]!.type !== 'equal') {
      if (diffLines[i]!.type === 'add') addCount++;
      else delCount++;
      i++;
    }
    hunks.push({ startIdx: start, endIdx: i - 1, addCount, delCount });
  }
  return hunks;
}

// ── Split-view alignment ──────────────────────────────────────────────────────

export function buildSplitRows(diffLines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;

  while (i < diffLines.length) {
    // i < diffLines.length — guaranteed
    const line = diffLines[i]!;

    if (line.type === 'equal') {
      rows.push({ left: line, right: line, lineIdx: i, lineIdxs: [i] });
      i++;
      continue;
    }

    const blockStart = i;
    while (i < diffLines.length && diffLines[i]!.type === 'delete') i++;
    const addStart = i;
    while (i < diffLines.length && diffLines[i]!.type === 'add') i++;

    const delLines = diffLines.slice(blockStart, addStart);
    const addLines = diffLines.slice(addStart, i);
    const maxLen   = Math.max(delLines.length, addLines.length);

    for (let j = 0; j < maxLen; j++) {
      const left = delLines[j] ?? null;
      const right = addLines[j] ?? null;
      const leftLineIdx = left ? blockStart + j : null;
      const rightLineIdx = right ? addStart + j : null;
      const lineIdxs = [leftLineIdx, rightLineIdx].filter((idx): idx is number => idx != null);

      rows.push({
        left,
        right,
        lineIdx: lineIdxs[0] ?? blockStart,
        lineIdxs,
      });
    }

    if (i === blockStart) i++; // infinite-loop guard
  }

  return rows;
}
