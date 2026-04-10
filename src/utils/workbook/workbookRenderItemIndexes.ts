import type { SplitRow } from '@/types';

import {
  getWorkbookSideRowNumber,
} from '@/utils/workbook/workbookNavigation';

export interface WorkbookRenderItemLineRange {
  itemIndex: number;
  lineStartIdx: number;
  lineEndIdx: number;
}

export interface WorkbookRenderItemIndexes {
  rowItemIndexBySide: {
    base: Map<number, number>;
    mine: Map<number, number>;
  };
  visibleRowItemIndexByLineIdx: Map<number, number>;
  hiddenRowNumbersByLineIdx: Map<number, number[]>;
  orderedRowLineRanges: WorkbookRenderItemLineRange[];
  hasOrderedLineRanges: boolean;
}

interface BuildWorkbookRenderItemIndexesOptions<TItem> {
  cacheKey: string;
  getRow: (item: TItem) => SplitRow | null;
  getHiddenRows?: ((item: TItem) => SplitRow[] | null) | undefined;
  getHiddenRowNumbers?: ((item: TItem) => number[] | null) | undefined;
}

const EMPTY_ROW_ITEM_INDEX_BY_SIDE = {
  base: new Map<number, number>(),
  mine: new Map<number, number>(),
};
const EMPTY_VISIBLE_ROW_ITEM_INDEX_BY_LINE_IDX = new Map<number, number>();
const EMPTY_HIDDEN_ROW_NUMBERS_BY_LINE_IDX = new Map<number, number[]>();
const EMPTY_WORKBOOK_RENDER_ITEM_LINE_RANGES: WorkbookRenderItemLineRange[] = [];
const EMPTY_WORKBOOK_RENDER_ITEM_INDEXES: WorkbookRenderItemIndexes = {
  rowItemIndexBySide: EMPTY_ROW_ITEM_INDEX_BY_SIDE,
  visibleRowItemIndexByLineIdx: EMPTY_VISIBLE_ROW_ITEM_INDEX_BY_LINE_IDX,
  hiddenRowNumbersByLineIdx: EMPTY_HIDDEN_ROW_NUMBERS_BY_LINE_IDX,
  orderedRowLineRanges: EMPTY_WORKBOOK_RENDER_ITEM_LINE_RANGES,
  hasOrderedLineRanges: true,
};
const workbookRenderItemIndexesCache = new WeakMap<object, Map<string, WorkbookRenderItemIndexes>>();

function resolveSplitRowLineRange(row: SplitRow): { start: number; end: number } | null {
  const lineIdxs = row.lineIdxs.length > 0 ? row.lineIdxs : [row.lineIdx];
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

export function buildWorkbookRenderItemIndexes<TItem>(
  items: readonly TItem[],
  {
    cacheKey,
    getRow,
    getHiddenRows,
    getHiddenRowNumbers,
  }: BuildWorkbookRenderItemIndexesOptions<TItem>,
): WorkbookRenderItemIndexes {
  if (items.length === 0) return EMPTY_WORKBOOK_RENDER_ITEM_INDEXES;

  const cacheOwner = items as unknown as object;
  let cacheByItems = workbookRenderItemIndexesCache.get(cacheOwner);
  if (!cacheByItems) {
    cacheByItems = new Map();
    workbookRenderItemIndexesCache.set(cacheOwner, cacheByItems);
  }

  const cached = cacheByItems.get(cacheKey);
  if (cached) return cached;

  const rowItemIndexBySide = {
    base: new Map<number, number>(),
    mine: new Map<number, number>(),
  };
  const visibleRowItemIndexByLineIdx = new Map<number, number>();
  const hiddenRowNumbersByLineIdx = new Map<number, number[]>();
  const orderedRowLineRanges: WorkbookRenderItemLineRange[] = [];
  let hasOrderedLineRanges = true;
  let previousLineEndIdx = Number.NEGATIVE_INFINITY;

  items.forEach((item, itemIndex) => {
    const row = getRow(item);
    if (row) {
      const baseRowNumber = getWorkbookSideRowNumber(row, 'base');
      if (baseRowNumber != null && !rowItemIndexBySide.base.has(baseRowNumber)) {
        rowItemIndexBySide.base.set(baseRowNumber, itemIndex);
      }

      const mineRowNumber = getWorkbookSideRowNumber(row, 'mine');
      if (mineRowNumber != null && !rowItemIndexBySide.mine.has(mineRowNumber)) {
        rowItemIndexBySide.mine.set(mineRowNumber, itemIndex);
      }

      row.lineIdxs.forEach((lineIdx) => {
        if (!visibleRowItemIndexByLineIdx.has(lineIdx)) {
          visibleRowItemIndexByLineIdx.set(lineIdx, itemIndex);
        }
      });

      const lineRange = resolveSplitRowLineRange(row);
      if (lineRange) {
        if (lineRange.end < previousLineEndIdx) {
          hasOrderedLineRanges = false;
        }
        previousLineEndIdx = lineRange.end;
        orderedRowLineRanges.push({
          itemIndex,
          lineStartIdx: lineRange.start,
          lineEndIdx: lineRange.end,
        });
      }
    }

    const hiddenRows = getHiddenRows?.(item) ?? null;
    const hiddenRowNumbers = getHiddenRowNumbers?.(item) ?? null;
    if (!hiddenRows || !hiddenRowNumbers || hiddenRowNumbers.length === 0) return;

    hiddenRows.forEach((hiddenRow) => {
      hiddenRow.lineIdxs.forEach((lineIdx) => {
        if (!hiddenRowNumbersByLineIdx.has(lineIdx)) {
          hiddenRowNumbersByLineIdx.set(lineIdx, hiddenRowNumbers);
        }
      });
    });
  });

  const next: WorkbookRenderItemIndexes = {
    rowItemIndexBySide,
    visibleRowItemIndexByLineIdx,
    hiddenRowNumbersByLineIdx,
    orderedRowLineRanges,
    hasOrderedLineRanges,
  };
  cacheByItems.set(cacheKey, next);
  return next;
}

export function findNearestWorkbookVisibleItemIndex(
  indexes: WorkbookRenderItemIndexes,
  lineIdx: number,
): number {
  const ranges = indexes.orderedRowLineRanges;
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
