// src/engine/diff.ts  —  Line-level diff (Patience LCS)  [v4 — typecheck clean]
//
// noUncheckedIndexedAccess fixes:
//  - All array[index] accesses now use !  where bounds are guaranteed, or
//    explicit undefined guards where they aren't.

import type {
  DiffLine,
  PreparedTextAnalysis,
  SplitRowDescriptor,
  TextReplacementPair,
} from '../types.js';
import { computeCharDiff } from './myers.js';
import { alignTextChangeBlock } from '../../../shared/textChangeAlignment.js';

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

interface PreparedTextAnalysisAccumulator {
  diffLines: DiffLine[];
  stats: PreparedTextAnalysis['stats'];
  replacementPairs: TextReplacementPair[];
  splitRowDescriptors: SplitRowDescriptor[];
}

function createPreparedTextAnalysisAccumulator(): PreparedTextAnalysisAccumulator {
  return {
    diffLines: [],
    stats: {
      add: 0,
      del: 0,
      chg: 0,
    },
    replacementPairs: [],
    splitRowDescriptors: [],
  };
}

function appendPreparedEqualLine(
  accumulator: PreparedTextAnalysisAccumulator,
  baseLine: string,
  mineLine: string,
  baseLineNo: number,
  mineLineNo: number,
): void {
  const lineIdx = accumulator.diffLines.length;
  accumulator.diffLines.push(makeLine(
    'equal',
    baseLine,
    mineLine,
    baseLineNo,
    mineLineNo,
  ));
  accumulator.splitRowDescriptors.push({
    leftLineIdx: lineIdx,
    rightLineIdx: lineIdx,
    lineIdx,
    lineIdxs: [lineIdx],
  });
}

function appendPreparedEqualLines(
  accumulator: PreparedTextAnalysisAccumulator,
  baseLines: readonly string[],
  mineLines: readonly string[],
  baseStartIdx: number,
  mineStartIdx: number,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const baseLineIdx = baseStartIdx + index;
    const mineLineIdx = mineStartIdx + index;
    appendPreparedEqualLine(
      accumulator,
      baseLines[baseLineIdx]!,
      mineLines[mineLineIdx]!,
      baseLineIdx + 1,
      mineLineIdx + 1,
    );
  }
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

function appendAnchoredReplacementAnalysis(
  accumulator: PreparedTextAnalysisAccumulator,
  baseLines: string[],
  mineLines: string[],
  charDiffBudget: CharDiffBudget,
  baseOffset = 0,
  mineOffset = 0,
): void {
  const sharedPrefixCount = Math.min(baseLines.length, mineLines.length);
  let prefixCount = 0;

  while (prefixCount < sharedPrefixCount && baseLines[prefixCount] === mineLines[prefixCount]) {
    appendPreparedEqualLine(
      accumulator,
      baseLines[prefixCount]!,
      mineLines[prefixCount]!,
      baseOffset + prefixCount + 1,
      mineOffset + prefixCount + 1,
    );
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

  appendPreparedChangeBlock(
    accumulator,
    prefixCount <= baseIdx ? baseLines.slice(prefixCount, baseIdx + 1) : [],
    prefixCount <= mineIdx ? mineLines.slice(prefixCount, mineIdx + 1) : [],
    baseOffset + prefixCount,
    mineOffset + prefixCount,
    charDiffBudget,
  );
  suffix.reverse();
  suffix.forEach((line) => {
    appendPreparedEqualLine(
      accumulator,
      line.base ?? '',
      line.mine ?? '',
      line.baseLineNo ?? 0,
      line.mineLineNo ?? 0,
    );
  });
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

function buildFallbackAnalysis(
  accumulator: PreparedTextAnalysisAccumulator,
  baseLines: string[],
  mineLines: string[],
  charDiffBudget: CharDiffBudget,
  baseOffset = 0,
  mineOffset = 0,
): void {
  const anchors = findUniqueCommonAnchors(baseLines, mineLines);
  if (anchors.length === 0) {
    appendAnchoredReplacementAnalysis(
      accumulator,
      baseLines,
      mineLines,
      charDiffBudget,
      baseOffset,
      mineOffset,
    );
    return;
  }

  let baseStart = 0;
  let mineStart = 0;

  anchors.forEach((anchor) => {
    appendAnchoredReplacementAnalysis(
      accumulator,
      baseLines.slice(baseStart, anchor.biIdx),
      mineLines.slice(mineStart, anchor.miIdx),
      charDiffBudget,
      baseOffset + baseStart,
      mineOffset + mineStart,
    );
    appendPreparedEqualLine(
      accumulator,
      baseLines[anchor.biIdx]!,
      mineLines[anchor.miIdx]!,
      baseOffset + anchor.biIdx + 1,
      mineOffset + anchor.miIdx + 1,
    );
    baseStart = anchor.biIdx + 1;
    mineStart = anchor.miIdx + 1;
  });

  appendAnchoredReplacementAnalysis(
    accumulator,
    baseLines.slice(baseStart),
    mineLines.slice(mineStart),
    charDiffBudget,
    baseOffset + baseStart,
    mineOffset + mineStart,
  );
}

function appendPreparedChangeBlock(
  accumulator: PreparedTextAnalysisAccumulator,
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
  const deleteStart = accumulator.diffLines.length;
  const addStart = deleteStart + delLines.length;

  alignedPairs.forEach((pair) => {
    const leftLineIdx = pair.deleteIndex != null ? deleteStart + pair.deleteIndex : null;
    const rightLineIdx = pair.addIndex != null ? addStart + pair.addIndex : null;

    if (pair.isReplacement && pair.deleteIndex != null && pair.addIndex != null) {
      accumulator.replacementPairs.push(
        { lineIdx: leftLineIdx!, pairedLineIdx: rightLineIdx! },
        { lineIdx: rightLineIdx!, pairedLineIdx: leftLineIdx! },
      );
      accumulator.stats.chg += 1;

      const baseLine = delLines[pair.deleteIndex]!;
      const mineLine = addLines[pair.addIndex]!;
      if (shouldComputeCharDiff(baseLine, mineLine, replacementPairIndex, charDiffBudget)) {
        const diff = computeCharDiff(baseLine, mineLine);
        if (diff) {
          deleteCharSpans[pair.deleteIndex] = diff.baseSpans;
          addCharSpans[pair.addIndex] = diff.mineSpans;
        }
      }
      replacementPairIndex += 1;
    } else {
      if (pair.deleteIndex != null) accumulator.stats.del += 1;
      if (pair.addIndex != null) accumulator.stats.add += 1;
    }

    const lineIdxs = [leftLineIdx, rightLineIdx].filter((value): value is number => value != null);
    accumulator.splitRowDescriptors.push({
      leftLineIdx,
      rightLineIdx,
      lineIdx: lineIdxs[0] ?? deleteStart,
      lineIdxs,
      ...(pair.isReplacement ? { isReplacementPair: true } : {}),
    });
  });

  for (let i = 0; i < delLines.length; i++) {
    accumulator.diffLines.push({
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
    accumulator.diffLines.push({
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

function buildPreparedDiffFromLineArrays(
  accumulator: PreparedTextAnalysisAccumulator,
  baseLines: string[],
  mineLines: string[],
  baseLineOffset: number,
  mineLineOffset: number,
  charDiffBudget: CharDiffBudget,
): void {
  if (
    baseLines.length > MAX_LINES_FOR_DIFF
    || mineLines.length > MAX_LINES_FOR_DIFF
    || exceedsLcsCandidatePairBudget(baseLines, mineLines)
  ) {
    buildFallbackAnalysis(
      accumulator,
      baseLines,
      mineLines,
      charDiffBudget,
      baseLineOffset,
      mineLineOffset,
    );
    return;
  }

  const lcs = patienceLCS(baseLines, mineLines);
  let bi = 0, mi = 0, li = 0;

  while (bi < baseLines.length || mi < mineLines.length) {
    const anchor = li < lcs.length ? lcs[li] : null;

    if (anchor && bi === anchor.biIdx && mi === anchor.miIdx) {
      appendPreparedEqualLine(
        accumulator,
        baseLines[bi]!,
        mineLines[mi]!,
        baseLineOffset + bi + 1,
        mineLineOffset + mi + 1,
      );
      bi += 1;
      mi += 1;
      li += 1;
    } else {
      const delEnd = anchor ? anchor.biIdx : baseLines.length;
      const addEnd = anchor ? anchor.miIdx : mineLines.length;
      const safeDelEnd = Math.max(bi, delEnd);
      const safeAddEnd = Math.max(mi, addEnd);

      appendPreparedChangeBlock(
        accumulator,
        baseLines.slice(bi, safeDelEnd),
        mineLines.slice(mi, safeAddEnd),
        baseLineOffset + bi,
        mineLineOffset + mi,
        charDiffBudget,
      );
      bi = safeDelEnd;
      mi = safeAddEnd;
    }
  }
}

// ── Main diff ─────────────────────────────────────────────────────────────────

function buildPreparedTextAnalysisCore(
  baseText: string,
  mineText: string,
): Omit<PreparedTextAnalysis, 'perf'> {
  const accumulator = createPreparedTextAnalysisAccumulator();
  if (baseText === mineText) {
    const lines = splitLines(baseText);
    appendPreparedEqualLines(accumulator, lines, lines, 0, 0, lines.length);
    return accumulator;
  }

  const baseLines = splitLines(baseText);
  const mineLines = splitLines(mineText);
  const charDiffBudget: CharDiffBudget = {
    remainingPairs: MAX_TOTAL_CHAR_DIFF_PAIRS,
    remainingChars: MAX_TOTAL_CHAR_DIFF_CHARS,
  };
  const sharedLineLimit = Math.min(baseLines.length, mineLines.length);
  let sharedPrefixCount = 0;
  while (
    sharedPrefixCount < sharedLineLimit
    && baseLines[sharedPrefixCount] === mineLines[sharedPrefixCount]
  ) {
    sharedPrefixCount += 1;
  }

  let sharedSuffixCount = 0;
  const sharedSuffixLimit = sharedLineLimit - sharedPrefixCount;
  while (
    sharedSuffixCount < sharedSuffixLimit
    && baseLines[baseLines.length - 1 - sharedSuffixCount]
    === mineLines[mineLines.length - 1 - sharedSuffixCount]
  ) {
    sharedSuffixCount += 1;
  }

  const middleBaseEnd = baseLines.length - sharedSuffixCount;
  const middleMineEnd = mineLines.length - sharedSuffixCount;
  appendPreparedEqualLines(accumulator, baseLines, mineLines, 0, 0, sharedPrefixCount);
  buildPreparedDiffFromLineArrays(
    accumulator,
    baseLines.slice(sharedPrefixCount, middleBaseEnd),
    mineLines.slice(sharedPrefixCount, middleMineEnd),
    sharedPrefixCount,
    sharedPrefixCount,
    charDiffBudget,
  );
  appendPreparedEqualLines(
    accumulator,
    baseLines,
    mineLines,
    middleBaseEnd,
    middleMineEnd,
    sharedSuffixCount,
  );

  return accumulator;
}

export function prepareTextDiffAnalysis(
  baseText: string,
  mineText: string,
): PreparedTextAnalysis {
  const diffStart = performance.now();
  const prepared = buildPreparedTextAnalysisCore(baseText, mineText);

  return {
    ...prepared,
    perf: {
      diffMs: performance.now() - diffStart,
    },
  };
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
