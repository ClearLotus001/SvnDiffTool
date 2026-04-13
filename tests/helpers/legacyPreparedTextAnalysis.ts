import { buildSplitRows } from '../../src/engine/text/diff';
import { buildReplacementPairIndex, summarizeDiffChanges } from '../../src/engine/text/textChangeAlignment';
import type { DiffLine, PreparedTextAnalysis } from '../../src/types';

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
