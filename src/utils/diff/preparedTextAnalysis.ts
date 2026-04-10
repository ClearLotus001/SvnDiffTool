import type {
  DiffLine,
  PreparedTextAnalysis,
  SplitRowDescriptor,
  SplitRow,
  TextReplacementPair,
  TextDiffStats,
} from '@/types';
import { alignTextChangeBlock, buildReplacementPairIndex, summarizeDiffChanges } from '@/engine/text/textChangeAlignment';
import { buildSplitRows } from '@/engine/text/diff';

const preparedAnalysisCache = new WeakMap<DiffLine[], PreparedTextAnalysis>();
const splitRowsDescriptorCache = new WeakMap<readonly SplitRowDescriptor[], SplitRow[]>();

function buildStatsAndDescriptors(diffLines: DiffLine[]): {
  stats: TextDiffStats;
  replacementPairs: TextReplacementPair[];
  splitRowDescriptors: SplitRowDescriptor[];
} {
  const stats: TextDiffStats = { add: 0, del: 0, chg: 0 };
  const replacementPairs: TextReplacementPair[] = [];
  const splitRowDescriptors: SplitRowDescriptor[] = [];
  let index = 0;

  while (index < diffLines.length) {
    if (diffLines[index]!.type === 'equal') {
      splitRowDescriptors.push({
        leftLineIdx: index,
        rightLineIdx: index,
        lineIdx: index,
        lineIdxs: [index],
      });
      index += 1;
      continue;
    }

    const deleteStart = index;
    while (index < diffLines.length && diffLines[index]!.type === 'delete') {
      index += 1;
    }
    const addStart = index;
    while (index < diffLines.length && diffLines[index]!.type === 'add') {
      index += 1;
    }

    const deleteLines = diffLines.slice(deleteStart, addStart);
    const addLines = diffLines.slice(addStart, index);
    const pairs = alignTextChangeBlock(
      deleteLines.map((line) => line.base ?? ''),
      addLines.map((line) => line.mine ?? ''),
    );

    pairs.forEach((pair) => {
      if (pair.isReplacement && pair.deleteIndex != null && pair.addIndex != null) {
        const leftLineIdx = deleteStart + pair.deleteIndex;
        const rightLineIdx = addStart + pair.addIndex;
        replacementPairs.push(
          { lineIdx: leftLineIdx, pairedLineIdx: rightLineIdx },
          { lineIdx: rightLineIdx, pairedLineIdx: leftLineIdx },
        );
        stats.chg += 1;
      } else {
        if (pair.deleteIndex != null) stats.del += 1;
        if (pair.addIndex != null) stats.add += 1;
      }

      const leftLineIdx = pair.deleteIndex != null ? deleteStart + pair.deleteIndex : null;
      const rightLineIdx = pair.addIndex != null ? addStart + pair.addIndex : null;
      const lineIdxs = [leftLineIdx, rightLineIdx].filter((value): value is number => value != null);
      splitRowDescriptors.push({
        leftLineIdx,
        rightLineIdx,
        lineIdx: lineIdxs[0] ?? deleteStart,
        lineIdxs,
        ...(pair.isReplacement ? { isReplacementPair: true } : {}),
      });
    });
  }

  return {
    stats,
    replacementPairs,
    splitRowDescriptors,
  };
}

export function prepareTextDiffAnalysisFromDiffLines(diffLines: DiffLine[]): PreparedTextAnalysis {
  const cached = preparedAnalysisCache.get(diffLines);
  if (cached) return cached;

  const next = {
    diffLines,
    ...buildStatsAndDescriptors(diffLines),
    perf: null,
  } satisfies PreparedTextAnalysis;
  preparedAnalysisCache.set(diffLines, next);
  return next;
}

export function buildReplacementPairIndexFromPairs(
  replacementPairs: readonly TextReplacementPair[],
): Map<number, number> {
  const next = new Map<number, number>();
  replacementPairs.forEach((pair) => {
    next.set(pair.lineIdx, pair.pairedLineIdx);
  });
  return next;
}

export function materializeSplitRowsFromDescriptors(
  diffLines: DiffLine[],
  splitRowDescriptors: readonly SplitRowDescriptor[],
): SplitRow[] {
  const cached = splitRowsDescriptorCache.get(splitRowDescriptors);
  if (cached) return cached;

  const rows = splitRowDescriptors.map<SplitRow>((descriptor) => ({
    left: descriptor.leftLineIdx != null ? (diffLines[descriptor.leftLineIdx] ?? null) : null,
    right: descriptor.rightLineIdx != null ? (diffLines[descriptor.rightLineIdx] ?? null) : null,
    lineIdx: descriptor.lineIdx,
    lineIdxs: descriptor.lineIdxs,
    ...(descriptor.isReplacementPair ? { isReplacementPair: true } : {}),
  }));
  splitRowsDescriptorCache.set(splitRowDescriptors, rows);
  return rows;
}

export function buildLegacyPreparedTextAnalysis(diffLines: DiffLine[]): PreparedTextAnalysis {
  return {
    diffLines,
    stats: summarizeDiffChanges(diffLines),
    replacementPairs: [...buildReplacementPairIndex(diffLines)].map(([lineIdx, pairedLineIdx]) => ({
      lineIdx,
      pairedLineIdx,
    })),
    splitRowDescriptors: buildSplitRows(diffLines).map((row) => ({
      leftLineIdx: row.left ? row.lineIdxs.find((lineIdx) => diffLines[lineIdx] === row.left) ?? null : null,
      rightLineIdx: row.right ? row.lineIdxs.find((lineIdx) => diffLines[lineIdx] === row.right) ?? null : null,
      lineIdx: row.lineIdx,
      lineIdxs: row.lineIdxs,
      ...(row.isReplacementPair ? { isReplacementPair: true } : {}),
    })),
    perf: null,
  };
}

export function arePreparedTextAnalysesEquivalent(
  left: PreparedTextAnalysis | null | undefined,
  right: PreparedTextAnalysis | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (
    left.stats.add !== right.stats.add
    || left.stats.del !== right.stats.del
    || left.stats.chg !== right.stats.chg
    || left.replacementPairs.length !== right.replacementPairs.length
    || left.splitRowDescriptors.length !== right.splitRowDescriptors.length
  ) {
    return false;
  }

  for (let index = 0; index < left.replacementPairs.length; index += 1) {
    const leftPair = left.replacementPairs[index]!;
    const rightPair = right.replacementPairs[index]!;
    if (leftPair.lineIdx !== rightPair.lineIdx || leftPair.pairedLineIdx !== rightPair.pairedLineIdx) {
      return false;
    }
  }

  for (let index = 0; index < left.splitRowDescriptors.length; index += 1) {
    const leftDescriptor = left.splitRowDescriptors[index]!;
    const rightDescriptor = right.splitRowDescriptors[index]!;
    if (
      leftDescriptor.leftLineIdx !== rightDescriptor.leftLineIdx
      || leftDescriptor.rightLineIdx !== rightDescriptor.rightLineIdx
      || Boolean(leftDescriptor.isReplacementPair) !== Boolean(rightDescriptor.isReplacementPair)
      || leftDescriptor.lineIdx !== rightDescriptor.lineIdx
      || leftDescriptor.lineIdxs.length !== rightDescriptor.lineIdxs.length
    ) {
      return false;
    }
    for (let lineIndex = 0; lineIndex < leftDescriptor.lineIdxs.length; lineIndex += 1) {
      if (leftDescriptor.lineIdxs[lineIndex] !== rightDescriptor.lineIdxs[lineIndex]) {
        return false;
      }
    }
  }

  return true;
}
