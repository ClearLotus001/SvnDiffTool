import type { CollapseRevealRange } from '@/utils/collapse/collapseState';

interface OverlayManualCollapsedItemsOptions<TItem> {
  isLineItem: (item: TItem) => boolean;
  getLineIdxs: (item: TItem) => number[];
  getCollapsedItemRange?: (item: TItem) => {
    startLineIdx: number;
    endLineIdx: number;
  } | null;
  buildCollapseItem: (params: {
    startLineIdx: number;
    endLineIdx: number;
    count: number;
  }) => TItem;
}

function rangeContainsLineIdx(
  ranges: CollapseRevealRange[],
  lineIdx: number,
): boolean {
  return ranges.some((range) => lineIdx >= range.start && lineIdx <= range.end);
}

function rangeFullyContainsLineSpan(
  ranges: CollapseRevealRange[],
  startLineIdx: number,
  endLineIdx: number,
): boolean {
  return ranges.some((range) => startLineIdx >= range.start && endLineIdx <= range.end);
}

export function overlayManualCollapsedItems<TItem>(
  items: TItem[],
  manualRanges: CollapseRevealRange[],
  options: OverlayManualCollapsedItemsOptions<TItem>,
): TItem[] {
  if (manualRanges.length === 0 || items.length === 0) return items;

  const result: TItem[] = [];
  let hiddenStartLineIdx = Number.POSITIVE_INFINITY;
  let hiddenEndLineIdx = Number.NEGATIVE_INFINITY;

  const flushHiddenBuffer = () => {
    if (
      !Number.isFinite(hiddenStartLineIdx)
      || !Number.isFinite(hiddenEndLineIdx)
    ) {
      hiddenStartLineIdx = Number.POSITIVE_INFINITY;
      hiddenEndLineIdx = Number.NEGATIVE_INFINITY;
      return;
    }

    result.push(options.buildCollapseItem({
      startLineIdx: hiddenStartLineIdx,
      endLineIdx: hiddenEndLineIdx,
      count: (hiddenEndLineIdx - hiddenStartLineIdx) + 1,
    }));
    hiddenStartLineIdx = Number.POSITIVE_INFINITY;
    hiddenEndLineIdx = Number.NEGATIVE_INFINITY;
  };

  items.forEach((item) => {
    if (!options.isLineItem(item)) {
      const collapsedRange = options.getCollapsedItemRange?.(item) ?? null;
      if (
        collapsedRange
        && rangeFullyContainsLineSpan(
          manualRanges,
          collapsedRange.startLineIdx,
          collapsedRange.endLineIdx,
        )
      ) {
        hiddenStartLineIdx = Math.min(hiddenStartLineIdx, collapsedRange.startLineIdx);
        hiddenEndLineIdx = Math.max(hiddenEndLineIdx, collapsedRange.endLineIdx);
        return;
      }

      flushHiddenBuffer();
      result.push(item);
      return;
    }

    const lineIdxs = options.getLineIdxs(item);
    const isHidden = lineIdxs.some((lineIdx) => rangeContainsLineIdx(manualRanges, lineIdx));
    if (!isHidden) {
      flushHiddenBuffer();
      result.push(item);
      return;
    }

    lineIdxs.forEach((lineIdx) => {
      hiddenStartLineIdx = Math.min(hiddenStartLineIdx, lineIdx);
      hiddenEndLineIdx = Math.max(hiddenEndLineIdx, lineIdx);
    });
  });

  flushHiddenBuffer();
  return result;
}
