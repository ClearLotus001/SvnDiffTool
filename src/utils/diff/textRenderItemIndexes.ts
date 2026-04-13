export interface TextRenderItemLineRange {
  itemIndex: number;
  lineStartIdx: number;
  lineEndIdx: number;
}

export interface TextRenderItemIndexes {
  visibleItemIndexByLineIdx: Map<number, number>;
  orderedLineRanges: TextRenderItemLineRange[];
  hasOrderedLineRanges: boolean;
}

interface BuildTextRenderItemIndexesOptions<TItem> {
  cacheKey: string;
  getLineIdxs: (item: TItem) => readonly number[] | null;
}

const EMPTY_VISIBLE_ITEM_INDEX_BY_LINE_IDX = new Map<number, number>();
const EMPTY_TEXT_RENDER_ITEM_LINE_RANGES: TextRenderItemLineRange[] = [];
const EMPTY_TEXT_RENDER_ITEM_INDEXES: TextRenderItemIndexes = {
  visibleItemIndexByLineIdx: EMPTY_VISIBLE_ITEM_INDEX_BY_LINE_IDX,
  orderedLineRanges: EMPTY_TEXT_RENDER_ITEM_LINE_RANGES,
  hasOrderedLineRanges: true,
};
const textRenderItemIndexesCache = new WeakMap<object, Map<string, TextRenderItemIndexes>>();

function resolveLineRange(
  lineIdxs: readonly number[],
): { start: number; end: number } | null {
  const first = lineIdxs[0];
  if (first == null) return null;

  let start = first;
  let end = first;
  for (let index = 1; index < lineIdxs.length; index += 1) {
    const lineIdx = lineIdxs[index];
    if (lineIdx == null) continue;
    if (lineIdx < start) start = lineIdx;
    if (lineIdx > end) end = lineIdx;
  }

  return { start, end };
}

export function buildTextRenderItemIndexes<TItem>(
  items: readonly TItem[],
  {
    cacheKey,
    getLineIdxs,
  }: BuildTextRenderItemIndexesOptions<TItem>,
): TextRenderItemIndexes {
  if (items.length === 0) return EMPTY_TEXT_RENDER_ITEM_INDEXES;

  const cacheOwner = items as unknown as object;
  let cacheByItems = textRenderItemIndexesCache.get(cacheOwner);
  if (!cacheByItems) {
    cacheByItems = new Map();
    textRenderItemIndexesCache.set(cacheOwner, cacheByItems);
  }

  const cached = cacheByItems.get(cacheKey);
  if (cached) return cached;

  const visibleItemIndexByLineIdx = new Map<number, number>();
  const orderedLineRanges: TextRenderItemLineRange[] = [];
  let hasOrderedLineRanges = true;
  let previousLineEndIdx = Number.NEGATIVE_INFINITY;

  items.forEach((item, itemIndex) => {
    const lineIdxs = getLineIdxs(item) ?? null;
    if (!lineIdxs || lineIdxs.length === 0) return;

    lineIdxs.forEach((lineIdx) => {
      if (!visibleItemIndexByLineIdx.has(lineIdx)) {
        visibleItemIndexByLineIdx.set(lineIdx, itemIndex);
      }
    });

    const lineRange = resolveLineRange(lineIdxs);
    if (!lineRange) return;

    if (lineRange.end < previousLineEndIdx) {
      hasOrderedLineRanges = false;
    }
    previousLineEndIdx = lineRange.end;
    orderedLineRanges.push({
      itemIndex,
      lineStartIdx: lineRange.start,
      lineEndIdx: lineRange.end,
    });
  });

  const next: TextRenderItemIndexes = {
    visibleItemIndexByLineIdx,
    orderedLineRanges,
    hasOrderedLineRanges,
  };
  cacheByItems.set(cacheKey, next);
  return next;
}

export function findNearestTextRenderItemIndex(
  indexes: TextRenderItemIndexes,
  lineIdx: number,
): number {
  const ranges = indexes.orderedLineRanges;
  if (ranges.length === 0) return -1;

  if (!indexes.hasOrderedLineRanges) {
    const match = ranges.find((range) => range.lineEndIdx >= lineIdx);
    return match?.itemIndex ?? -1;
  }

  let low = 0;
  let high = ranges.length - 1;
  let candidateIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const range = ranges[mid];
    if (!range) break;

    if (range.lineEndIdx >= lineIdx) {
      candidateIndex = range.itemIndex;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return candidateIndex;
}
