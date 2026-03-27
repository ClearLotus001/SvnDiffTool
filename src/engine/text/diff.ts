// src/engine/diff.ts  —  Line-level diff (Patience LCS)  [v4 — typecheck clean]
//
// noUncheckedIndexedAccess fixes:
//  - All array[index] accesses now use !  where bounds are guaranteed, or
//    explicit undefined guards where they aren't.

import type { DiffLine, SplitRow } from '@/types';
import { computeCharDiff } from '@/engine/text/myers';
import { alignTextChangeBlock } from '@/engine/text/textChangeAlignment';

const MAX_LINES_FOR_DIFF = 50_000;
const MAX_LCS_CANDIDATE_PAIRS = 4_000_000;
const CHAR_DIFF_LINE_LIMIT = 1000;
const MAX_CHAR_DIFF_PAIRS_PER_BLOCK = 240;
const MAX_TOTAL_CHAR_DIFF_PAIRS = 1_500;
const MAX_TOTAL_CHAR_DIFF_CHARS = 250_000;

// ── Patience LCS ──────────────────────────────────────────────────────────────

interface LCSNode {
  bi: number;
  mi: number;
  prev: LCSNode | null;
}

interface LCSEntry { biIdx: number; miIdx: number; }

interface CharDiffBudget {
  remainingPairs: number;
  remainingChars: number;
}

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

    // `rawPositions` is already collected in ascending order, so we only need
    // to traverse it backwards to avoid chaining multiple matches from the same
    // source line into the LIS state.
    for (let pi = rawPositions.length - 1; pi >= 0; pi -= 1) {
      const mi = rawPositions[pi]!;
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

function exceedsLcsCandidatePairBudget(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;

  const [countSource, probeSource] = a.length <= b.length
    ? [a, b]
    : [b, a];
  const counts = new Map<string, number>();
  countSource.forEach((line) => {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  });

  let candidatePairs = 0;
  for (const line of probeSource) {
    candidatePairs += counts.get(line) ?? 0;
    if (candidatePairs > MAX_LCS_CANDIDATE_PAIRS) {
      return true;
    }
  }

  return false;
}

function buildAnchoredReplacementDiff(
  baseLines: string[],
  mineLines: string[],
  baseOffset = 0,
  mineOffset = 0,
): DiffLine[] {
  const result: DiffLine[] = [];
  const sharedPrefixCount = Math.min(baseLines.length, mineLines.length);
  let prefixCount = 0;

  while (prefixCount < sharedPrefixCount && baseLines[prefixCount] === mineLines[prefixCount]) {
    result.push(makeLine(
      'equal',
      baseLines[prefixCount]!,
      mineLines[prefixCount]!,
      baseOffset + prefixCount + 1,
      mineOffset + prefixCount + 1,
    ));
    prefixCount += 1;
  }

  let baseIdx = baseLines.length - 1;
  let mineIdx = mineLines.length - 1;
  const suffix: DiffLine[] = [];

  while (baseIdx >= prefixCount && mineIdx >= prefixCount && baseLines[baseIdx] === mineLines[mineIdx]) {
    suffix.push(makeLine(
      'equal',
      baseLines[baseIdx]!,
      mineLines[mineIdx]!,
      baseOffset + baseIdx + 1,
      mineOffset + mineIdx + 1,
    ));
    baseIdx -= 1;
    mineIdx -= 1;
  }

  for (let i = prefixCount; i <= baseIdx; i += 1) {
    result.push(makeLine('delete', baseLines[i]!, null, baseOffset + i + 1, null));
  }

  for (let i = prefixCount; i <= mineIdx; i += 1) {
    result.push(makeLine('add', null, mineLines[i]!, null, mineOffset + i + 1));
  }

  suffix.reverse();
  result.push(...suffix);
  return result;
}

function longestIncreasingAnchors(candidates: LCSEntry[]): LCSEntry[] {
  if (candidates.length === 0) return [];

  const piles: number[] = [];
  const previous = new Array<number>(candidates.length).fill(-1);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    let lo = 0;
    let hi = piles.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candidates[piles[mid]!]!.miIdx < candidate.miIdx) lo = mid + 1;
      else hi = mid;
    }

    if (lo > 0) previous[index] = piles[lo - 1]!;
    piles[lo] = index;
  }

  const result: LCSEntry[] = [];
  let currentIndex = piles[piles.length - 1] ?? -1;
  while (currentIndex >= 0) {
    result.unshift(candidates[currentIndex]!);
    currentIndex = previous[currentIndex]!;
  }

  return result;
}

function findUniqueCommonAnchors(baseLines: string[], mineLines: string[]): LCSEntry[] {
  if (baseLines.length === 0 || mineLines.length === 0) return [];

  const baseCounts = new Map<string, number>();
  const mineCounts = new Map<string, number>();

  baseLines.forEach((line) => {
    baseCounts.set(line, (baseCounts.get(line) ?? 0) + 1);
  });
  mineLines.forEach((line) => {
    mineCounts.set(line, (mineCounts.get(line) ?? 0) + 1);
  });

  const uniqueMinePositions = new Map<string, number>();
  mineLines.forEach((line, index) => {
    if ((mineCounts.get(line) ?? 0) === 1) {
      uniqueMinePositions.set(line, index);
    }
  });

  const candidates: LCSEntry[] = [];
  baseLines.forEach((line, index) => {
    if ((baseCounts.get(line) ?? 0) !== 1) return;
    if ((mineCounts.get(line) ?? 0) !== 1) return;

    const mineIndex = uniqueMinePositions.get(line);
    if (mineIndex == null) return;
    candidates.push({ biIdx: index, miIdx: mineIndex });
  });

  return longestIncreasingAnchors(candidates);
}

function buildFallbackDiff(baseLines: string[], mineLines: string[]): DiffLine[] {
  const anchors = findUniqueCommonAnchors(baseLines, mineLines);
  if (anchors.length === 0) {
    return buildAnchoredReplacementDiff(baseLines, mineLines);
  }

  const result: DiffLine[] = [];
  let baseStart = 0;
  let mineStart = 0;

  anchors.forEach((anchor) => {
    result.push(...buildAnchoredReplacementDiff(
      baseLines.slice(baseStart, anchor.biIdx),
      mineLines.slice(mineStart, anchor.miIdx),
      baseStart,
      mineStart,
    ));
    result.push(makeLine(
      'equal',
      baseLines[anchor.biIdx]!,
      mineLines[anchor.miIdx]!,
      anchor.biIdx + 1,
      anchor.miIdx + 1,
    ));
    baseStart = anchor.biIdx + 1;
    mineStart = anchor.miIdx + 1;
  });

  result.push(...buildAnchoredReplacementDiff(
    baseLines.slice(baseStart),
    mineLines.slice(mineStart),
    baseStart,
    mineStart,
  ));

  return result;
}

// ── Main diff ─────────────────────────────────────────────────────────────────

export function computeDiff(baseText: string, mineText: string): DiffLine[] {
  if (baseText === mineText) {
    return splitLines(baseText).map((line, index) => makeLine('equal', line, line, index + 1, index + 1));
  }

  const baseLines = splitLines(baseText);
  const mineLines = splitLines(mineText);
  const charDiffBudget: CharDiffBudget = {
    remainingPairs: MAX_TOTAL_CHAR_DIFF_PAIRS,
    remainingChars: MAX_TOTAL_CHAR_DIFF_CHARS,
  };

  if (
    baseLines.length > MAX_LINES_FOR_DIFF
    || mineLines.length > MAX_LINES_FOR_DIFF
    || exceedsLcsCandidatePairBudget(baseLines, mineLines)
  ) {
    return buildFallbackDiff(baseLines, mineLines);
  }

  const result: DiffLine[] = [];
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

      emitChangeBlock(
        result,
        baseLines.slice(bi, safeDelEnd),
        mineLines.slice(mi, safeAddEnd),
        bi,
        mi,
        charDiffBudget,
      );
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
  charDiffBudget: CharDiffBudget,
): void {
  const deleteCharSpans = Array.from(
    { length: delLines.length },
    () => null as DiffLine['baseCharSpans'],
  );
  const addCharSpans = Array.from(
    { length: addLines.length },
    () => null as DiffLine['mineCharSpans'],
  );
  const alignedPairs = alignTextChangeBlock(delLines, addLines);
  let replacementPairIndex = 0;

  alignedPairs.forEach((pair) => {
    if (!pair.isReplacement || pair.deleteIndex == null || pair.addIndex == null) return;

    const baseLine = delLines[pair.deleteIndex]!;
    const mineLine = addLines[pair.addIndex]!;
    if (!shouldComputeCharDiff(baseLine, mineLine, replacementPairIndex, charDiffBudget)) {
      replacementPairIndex += 1;
      return;
    }

    const diff = computeCharDiff(baseLine, mineLine);
    if (diff) {
      deleteCharSpans[pair.deleteIndex] = diff.baseSpans;
      addCharSpans[pair.addIndex] = diff.mineSpans;
    }
    replacementPairIndex += 1;
  });

  for (let i = 0; i < delLines.length; i++) {
    result.push({
      type: 'delete',
      base: delLines[i]!,
      mine: null,
      baseLineNo: biBase + i + 1,
      mineLineNo: null,
      baseCharSpans: deleteCharSpans[i] ?? null,
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
      mineCharSpans: addCharSpans[i] ?? null,
    });
  }
}

function shouldComputeCharDiff(
  baseLine: string,
  mineLine: string,
  pairIndex: number,
  budget: CharDiffBudget,
): boolean {
  if (pairIndex >= MAX_CHAR_DIFF_PAIRS_PER_BLOCK) return false;
  if (baseLine.length > CHAR_DIFF_LINE_LIMIT || mineLine.length > CHAR_DIFF_LINE_LIMIT) return false;

  const charCost = baseLine.length + mineLine.length;
  if (budget.remainingPairs <= 0 || budget.remainingChars < charCost) return false;

  budget.remainingPairs -= 1;
  budget.remainingChars -= charCost;
  return true;
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
    const alignedPairs = alignTextChangeBlock(
      delLines.map((line) => line.base ?? ''),
      addLines.map((line) => line.mine ?? ''),
    );

    alignedPairs.forEach((pair) => {
      const left = pair.deleteIndex != null ? (delLines[pair.deleteIndex] ?? null) : null;
      const right = pair.addIndex != null ? (addLines[pair.addIndex] ?? null) : null;
      const leftLineIdx = pair.deleteIndex != null ? blockStart + pair.deleteIndex : null;
      const rightLineIdx = pair.addIndex != null ? addStart + pair.addIndex : null;
      const lineIdxs = [leftLineIdx, rightLineIdx].filter((idx): idx is number => idx != null);

      rows.push({
        left,
        right,
        isReplacementPair: pair.isReplacement,
        lineIdx: lineIdxs[0] ?? blockStart,
        lineIdxs,
      });
    });

    if (i === blockStart) i++; // infinite-loop guard
  }

  return rows;
}
