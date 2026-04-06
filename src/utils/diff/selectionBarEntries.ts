import type {
  RenderItem,
  SplitRenderItem,
} from '@/types';

import { ROW_H } from '@/hooks/virtualization/useVirtual';
import {
  type LineRangeSelection,
  doesSelectionIntersectLineRange,
  isLineIdxWithinSelection,
} from '@/utils/diff/lineRangeSelection';
import type { SelectionBarLayoutEntry } from '@/utils/diff/selectionBarLayout';

function hasSplitRowNonEqualContent(item: Extract<SplitRenderItem, { kind: 'split-line' }>): boolean {
  return item.row.isReplacementPair
    || (item.row.left?.type != null && item.row.left.type !== 'equal')
    || (item.row.right?.type != null && item.row.right.type !== 'equal');
}

export function buildUnifiedSelectionBarEntries(
  items: readonly RenderItem[],
  lineRangeSelection: LineRangeSelection | null,
  activeSearchLineIdx: number,
  replacementPairIndex: ReadonlyMap<number, number>,
): SelectionBarLayoutEntry[] {
  return items.map((item, index) => {
    if (item.kind === 'collapse') {
      const selected = doesSelectionIntersectLineRange(lineRangeSelection, item.fromIdx, item.toIdx);
      return {
        topOffset: index * ROW_H,
        height: ROW_H,
        selected,
        weight: selected ? 140 : 24,
      };
    }

    const selected = isLineIdxWithinSelection(lineRangeSelection, item.lineIdx);
    let weight = 8;
    if (selected) {
      weight = 140;
    } else if (activeSearchLineIdx === item.lineIdx) {
      weight = 90;
    } else if (replacementPairIndex.has(item.lineIdx) || item.line.type !== 'equal') {
      weight = 55;
    }

    return {
      topOffset: index * ROW_H,
      height: ROW_H,
      selected,
      weight,
    };
  });
}

export function buildSplitSelectionBarEntries(
  items: readonly SplitRenderItem[],
  itemOffsets: readonly number[],
  itemHeights: readonly number[],
  lineRangeSelection: LineRangeSelection | null,
  activeSearchLineIdx: number,
): SelectionBarLayoutEntry[] {
  return items.map((item, index) => {
    const topOffset = itemOffsets[index] ?? 0;
    const height = itemHeights[index] ?? ROW_H;

    if (item.kind === 'split-collapse') {
      const selected = doesSelectionIntersectLineRange(lineRangeSelection, item.fromIdx, item.toIdx);
      return {
        topOffset,
        height,
        selected,
        weight: selected ? 140 : 24,
      };
    }

    const selected = item.row.lineIdxs.some((lineIdx) => isLineIdxWithinSelection(lineRangeSelection, lineIdx));
    let weight = 8;
    if (selected) {
      weight = 140;
    } else if (item.row.lineIdxs.includes(activeSearchLineIdx)) {
      weight = 90;
    } else if (hasSplitRowNonEqualContent(item)) {
      weight = 55;
    }

    return {
      topOffset,
      height,
      selected,
      weight,
    };
  });
}
