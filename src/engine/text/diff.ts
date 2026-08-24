import type { DiffLine, SplitRow } from '@/types';
import { alignTextChangeBlock } from '@/engine/text/textChangeAlignment';
import { computeCharDiff } from '../../../shared/textMyers';
import { shouldComputeTextCharDiff, type TextCharDiffBudget } from '../../../shared/textDiffBudget';
import { buildTextLineDiff } from '../../../shared/textLineDiffCore';

const splitRowsCache = new WeakMap<DiffLine[], SplitRow[]>();
const makeLine = (type: DiffLine['type'], base: string | null, mine: string | null, baseLineNo: number | null, mineLineNo: number | null): DiffLine => ({ type, base, mine, baseLineNo, mineLineNo, baseCharSpans: null, mineCharSpans: null });

function appendChange(result: DiffLine[], deleted: string[], added: string[], bi: number, mi: number, budget: TextCharDiffBudget, fallback: boolean) {
  if (fallback) {
    deleted.forEach((line, i) => result.push(makeLine('delete', line, null, bi + i + 1, null)));
    added.forEach((line, i) => result.push(makeLine('add', null, line, null, mi + i + 1)));
    return;
  }
  const delSpans = Array.from({ length: deleted.length }, () => null as DiffLine['baseCharSpans']);
  const addSpans = Array.from({ length: added.length }, () => null as DiffLine['mineCharSpans']);
  let replacementIndex = 0;
  for (const pair of alignTextChangeBlock(deleted, added)) {
    if (!pair.isReplacement || pair.deleteIndex == null || pair.addIndex == null) continue;
    const left = deleted[pair.deleteIndex]!, right = added[pair.addIndex]!;
    if (shouldComputeTextCharDiff(left, right, replacementIndex, budget)) {
      const diff = computeCharDiff(left, right);
      if (diff) { delSpans[pair.deleteIndex] = diff.baseSpans; addSpans[pair.addIndex] = diff.mineSpans; }
    }
    replacementIndex += 1;
  }
  deleted.forEach((line, i) => result.push({ ...makeLine('delete', line, null, bi + i + 1, null), baseCharSpans: delSpans[i] ?? null }));
  added.forEach((line, i) => result.push({ ...makeLine('add', null, line, null, mi + i + 1), mineCharSpans: addSpans[i] ?? null }));
}

export function computeDiff(baseText: string, mineText: string): DiffLine[] {
  const result: DiffLine[] = [];
  buildTextLineDiff(baseText, mineText, {
    appendEqual: (base, mine, baseNo, mineNo) => result.push(makeLine('equal', base, mine, baseNo, mineNo)),
    appendChangeBlock: (del, add, bi, mi, budget, context) => appendChange(result, del, add, bi, mi, budget, context === 'fallback'),
  });
  return result;
}

export interface Hunk { startIdx: number; endIdx: number; addCount: number; delCount: number }
export function computeHunks(diffLines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < diffLines.length) {
    if (diffLines[i]!.type === 'equal') { i += 1; continue; }
    const startIdx = i;
    let addCount = 0, delCount = 0;
    while (i < diffLines.length && diffLines[i]!.type !== 'equal') { if (diffLines[i]!.type === 'add') addCount += 1; else delCount += 1; i += 1; }
    hunks.push({ startIdx, endIdx: i - 1, addCount, delCount });
  }
  return hunks;
}

export function buildSplitRows(diffLines: DiffLine[]): SplitRow[] {
  const cached = splitRowsCache.get(diffLines);
  if (cached) return cached;
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i]!;
    if (line.type === 'equal') { rows.push({ left: line, right: line, lineIdx: i, lineIdxs: [i] }); i += 1; continue; }
    const blockStart = i;
    while (i < diffLines.length && diffLines[i]!.type === 'delete') i += 1;
    const addStart = i;
    while (i < diffLines.length && diffLines[i]!.type === 'add') i += 1;
    const deleted = diffLines.slice(blockStart, addStart), added = diffLines.slice(addStart, i);
    for (const pair of alignTextChangeBlock(deleted.map((x) => x.base ?? ''), added.map((x) => x.mine ?? ''))) {
      const left = pair.deleteIndex != null ? (deleted[pair.deleteIndex] ?? null) : null;
      const right = pair.addIndex != null ? (added[pair.addIndex] ?? null) : null;
      const leftIndex = pair.deleteIndex != null ? blockStart + pair.deleteIndex : null;
      const rightIndex = pair.addIndex != null ? addStart + pair.addIndex : null;
      const lineIdxs = [leftIndex, rightIndex].filter((x): x is number => x != null);
      rows.push({ left, right, isReplacementPair: pair.isReplacement, lineIdx: lineIdxs[0] ?? blockStart, lineIdxs });
    }
    if (i === blockStart) i += 1;
  }
  splitRowsCache.set(diffLines, rows);
  return rows;
}
