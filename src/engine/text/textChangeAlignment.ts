import type { DiffLine, TextDiffPresentation, TextDiffStats } from '@/types';
import { alignTextChangeBlock } from '../../../shared/textChangeAlignment';

export { alignTextChangeBlock };
export type { TextChangeAlignmentPair } from '../../../shared/textChangeAlignment';

export function summarizeDiffChanges(diffLines: DiffLine[]): TextDiffStats {
  let add = 0;
  let del = 0;
  let chg = 0;
  let index = 0;

  while (index < diffLines.length) {
    if (diffLines[index]!.type === 'equal') {
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
        chg += 1;
        return;
      }
      if (pair.deleteIndex != null) del += 1;
      if (pair.addIndex != null) add += 1;
    });
  }

  return { add, del, chg };
}

export function buildReplacementPairIndex(diffLines: DiffLine[]): Map<number, number> {
  const pairIndex = new Map<number, number>();
  let index = 0;

  while (index < diffLines.length) {
    if (diffLines[index]!.type === 'equal') {
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
      if (!pair.isReplacement || pair.deleteIndex == null || pair.addIndex == null) return;
      pairIndex.set(deleteStart + pair.deleteIndex, addStart + pair.addIndex);
      pairIndex.set(addStart + pair.addIndex, deleteStart + pair.deleteIndex);
    });
  }

  return pairIndex;
}

export function buildTextDiffPresentation(diffLines: DiffLine[]): TextDiffPresentation {
  return {
    replacementPairIndex: buildReplacementPairIndex(diffLines),
    stats: summarizeDiffChanges(diffLines),
  };
}
