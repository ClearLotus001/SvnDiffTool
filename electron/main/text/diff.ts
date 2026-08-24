import type { DiffLine, PreparedTextAnalysis, SplitRowDescriptor, TextReplacementPair } from '../types.js';
import { alignTextChangeBlock } from '../../../shared/textChangeAlignment.js';
import { computeCharDiff } from '../../../shared/textMyers.js';
import { shouldComputeTextCharDiff, type TextCharDiffBudget } from '../../../shared/textDiffBudget.js';
import { buildTextLineDiff } from '../../../shared/textLineDiffCore.js';

interface Accumulator {
  diffLines: DiffLine[];
  stats: PreparedTextAnalysis['stats'];
  replacementPairs: TextReplacementPair[];
  splitRowDescriptors: SplitRowDescriptor[];
}

const makeLine = (type: DiffLine['type'], base: string | null, mine: string | null, baseLineNo: number | null, mineLineNo: number | null): DiffLine => ({ type, base, mine, baseLineNo, mineLineNo, baseCharSpans: null, mineCharSpans: null });
const createAccumulator = (): Accumulator => ({ diffLines: [], stats: { add: 0, del: 0, chg: 0 }, replacementPairs: [], splitRowDescriptors: [] });

function appendEqual(acc: Accumulator, base: string, mine: string, baseNo: number, mineNo: number) {
  const lineIdx = acc.diffLines.length;
  acc.diffLines.push(makeLine('equal', base, mine, baseNo, mineNo));
  acc.splitRowDescriptors.push({ leftLineIdx: lineIdx, rightLineIdx: lineIdx, lineIdx, lineIdxs: [lineIdx] });
}

function appendChange(acc: Accumulator, deleted: string[], added: string[], bi: number, mi: number, budget: TextCharDiffBudget) {
  const delSpans = Array.from({ length: deleted.length }, () => null as DiffLine['baseCharSpans']);
  const addSpans = Array.from({ length: added.length }, () => null as DiffLine['mineCharSpans']);
  const deleteStart = acc.diffLines.length, addStart = deleteStart + deleted.length;
  let replacementIndex = 0;
  for (const pair of alignTextChangeBlock(deleted, added)) {
    const leftIdx = pair.deleteIndex != null ? deleteStart + pair.deleteIndex : null;
    const rightIdx = pair.addIndex != null ? addStart + pair.addIndex : null;
    if (pair.isReplacement && pair.deleteIndex != null && pair.addIndex != null) {
      acc.replacementPairs.push({ lineIdx: leftIdx!, pairedLineIdx: rightIdx! }, { lineIdx: rightIdx!, pairedLineIdx: leftIdx! });
      acc.stats.chg += 1;
      const left = deleted[pair.deleteIndex]!, right = added[pair.addIndex]!;
      if (shouldComputeTextCharDiff(left, right, replacementIndex, budget)) {
        const diff = computeCharDiff(left, right);
        if (diff) { delSpans[pair.deleteIndex] = diff.baseSpans; addSpans[pair.addIndex] = diff.mineSpans; }
      }
      replacementIndex += 1;
    } else {
      if (pair.deleteIndex != null) acc.stats.del += 1;
      if (pair.addIndex != null) acc.stats.add += 1;
    }
    const lineIdxs = [leftIdx, rightIdx].filter((x): x is number => x != null);
    acc.splitRowDescriptors.push({ leftLineIdx: leftIdx, rightLineIdx: rightIdx, lineIdx: lineIdxs[0] ?? deleteStart, lineIdxs, ...(pair.isReplacement ? { isReplacementPair: true } : {}) });
  }
  deleted.forEach((line, i) => acc.diffLines.push({ ...makeLine('delete', line, null, bi + i + 1, null), baseCharSpans: delSpans[i] ?? null }));
  added.forEach((line, i) => acc.diffLines.push({ ...makeLine('add', null, line, null, mi + i + 1), mineCharSpans: addSpans[i] ?? null }));
}

export function prepareTextDiffAnalysis(baseText: string, mineText: string): PreparedTextAnalysis {
  const started = performance.now();
  const acc = createAccumulator();
  buildTextLineDiff(baseText, mineText, {
    appendEqual: (base, mine, baseNo, mineNo) => appendEqual(acc, base, mine, baseNo, mineNo),
    appendChangeBlock: (deleted, added, bi, mi, budget) => appendChange(acc, deleted, added, bi, mi, budget),
  });
  return { ...acc, perf: { diffMs: performance.now() - started } };
}
