import type { Hunk, SplitRow } from '@/types';
import {
  getWorkbookSharedCacheBucket,
  getWorkbookSharedCacheEntry,
  setWorkbookSharedCacheEntry,
} from '@/utils/workbook/workbookSharedCache';
import {
  getWorkbookRowKey,
  rowTouchesGuidedHunk,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookRowFrame } from '@/utils/workbook/workbookVisibleRowFrames';

type WorkbookLinearBodyItemKind = 'row' | 'collapse' | 'hidden-rows';
type WorkbookGroupedBodyItemKind = 'rows' | 'collapse' | 'hidden-rows';

export interface WorkbookProjectedRowState {
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  isGuided: boolean;
  isGuidedStart: boolean;
  isGuidedEnd: boolean;
}

export interface WorkbookProjectedBodyRowEntry<TStaticRow extends object> {
  row: SplitRow;
  height: number;
  sourceItemIndex: number;
  staticRow: TStaticRow;
}

export type WorkbookLinearBodyBaseSegment<TItem, TStaticRow extends object> =
  | {
    kind: 'rows';
    rows: WorkbookProjectedBodyRowEntry<TStaticRow>[];
    top: number;
    height: number;
  }
  | {
    kind: 'collapse' | 'hidden-rows';
    item: TItem;
    top: number;
    height: number;
    sourceItemIndex: number;
  };

export interface WorkbookLinearBodyLayoutBase<TItem, TStaticRow extends object> {
  segments: WorkbookLinearBodyBaseSegment<TItem, TStaticRow>[];
  rowFramesByKey: Map<string, WorkbookRowFrame>;
}

export interface BuildWorkbookLinearBodyLayoutBaseParams<TItem, TStaticRow extends object> {
  items: readonly TItem[];
  startIdx: number;
  endIdx: number;
  cacheKey?: string | null;
  resolveItemKind: (item: TItem) => WorkbookLinearBodyItemKind;
  resolveItemHeight: (item: TItem) => number;
  resolveRow: (item: TItem) => SplitRow | null;
  buildStaticRow: (
    item: TItem,
    context: { itemIndex: number; height: number; row: SplitRow },
  ) => TStaticRow;
}

export type WorkbookGroupedBodyBaseSegment<TItem, TStaticRow extends object> =
  | {
    kind: 'rows';
    item: TItem;
    rows: WorkbookProjectedBodyRowEntry<TStaticRow>[];
    top: number;
    height: number;
  }
  | {
    kind: 'collapse' | 'hidden-rows';
    item: TItem;
    top: number;
    height: number;
    sourceItemIndex: number;
  };

export interface WorkbookGroupedBodyLayoutBase<TItem, TStaticRow extends object> {
  segments: WorkbookGroupedBodyBaseSegment<TItem, TStaticRow>[];
  rowFramesByKey: Map<string, WorkbookRowFrame>;
}

export interface BuildWorkbookGroupedBodyLayoutBaseParams<TItem, TStaticRow extends object> {
  items: readonly TItem[];
  startIdx: number;
  endIdx: number;
  cacheKey?: string | null;
  resolveItemKind: (item: TItem) => WorkbookGroupedBodyItemKind;
  resolveItemHeight: (item: TItem) => number;
  resolveRows: (item: TItem) => readonly WorkbookProjectedBodyRowEntry<TStaticRow>[];
}

interface ResolveWorkbookProjectedRowStateParams {
  row: SplitRow;
  prevRow: SplitRow | null;
  nextRow: SplitRow | null;
  guidedHunkRange: Hunk | null;
  activeSearchLineIdx: number;
  searchMatchSet: ReadonlySet<number>;
}

export interface MapWorkbookProjectedBodyRowsParams<TSourceItem, TStaticRow extends object, TRow> {
  rows: readonly WorkbookProjectedBodyRowEntry<TStaticRow>[];
  sourceItems: readonly TSourceItem[];
  resolveSourceRow: (item: TSourceItem) => SplitRow | null;
  guidedHunkRange: Hunk | null;
  activeSearchLineIdx: number;
  searchMatchSet: ReadonlySet<number>;
  decorateRow: (
    entry: WorkbookProjectedBodyRowEntry<TStaticRow>,
    state: WorkbookProjectedRowState,
    rowIndex: number,
  ) => TRow;
}

const workbookLinearBodyLayoutBaseCache = new WeakMap<object, Map<string, unknown>>();
const workbookGroupedBodyLayoutBaseCache = new WeakMap<object, Map<string, unknown>>();

function resolveWorkbookProjectedRowState({
  row,
  prevRow,
  nextRow,
  guidedHunkRange,
  activeSearchLineIdx,
  searchMatchSet,
}: ResolveWorkbookProjectedRowStateParams): WorkbookProjectedRowState {
  const isGuided = rowTouchesGuidedHunk(row, guidedHunkRange);
  const prevGuided = prevRow ? rowTouchesGuidedHunk(prevRow, guidedHunkRange) : false;
  const nextGuided = nextRow ? rowTouchesGuidedHunk(nextRow, guidedHunkRange) : false;

  return {
    isSearchMatch: row.lineIdxs.some((idx) => searchMatchSet.has(idx)),
    isActiveSearch: row.lineIdxs.includes(activeSearchLineIdx),
    isGuided,
    isGuidedStart: isGuided && !prevGuided,
    isGuidedEnd: isGuided && !nextGuided,
  };
}

export function mapWorkbookProjectedBodyRows<TSourceItem, TStaticRow extends object, TRow>({
  rows,
  sourceItems,
  resolveSourceRow,
  guidedHunkRange,
  activeSearchLineIdx,
  searchMatchSet,
  decorateRow,
}: MapWorkbookProjectedBodyRowsParams<TSourceItem, TStaticRow, TRow>): TRow[] {
  return rows.map((entry, rowIndex) => {
    const prevRow = entry.sourceItemIndex > 0
      ? resolveSourceRow(sourceItems[entry.sourceItemIndex - 1] as TSourceItem)
      : null;
    const nextRow = entry.sourceItemIndex + 1 < sourceItems.length
      ? resolveSourceRow(sourceItems[entry.sourceItemIndex + 1] as TSourceItem)
      : null;
    const state = resolveWorkbookProjectedRowState({
      row: entry.row,
      prevRow,
      nextRow,
      guidedHunkRange,
      activeSearchLineIdx,
      searchMatchSet,
    });

    return decorateRow(entry, state, rowIndex);
  });
}

export function buildWorkbookLinearBodyLayoutBase<TItem, TStaticRow extends object>({
  items,
  startIdx,
  endIdx,
  cacheKey = null,
  resolveItemKind,
  resolveItemHeight,
  resolveRow,
  buildStaticRow,
}: BuildWorkbookLinearBodyLayoutBaseParams<TItem, TStaticRow>): WorkbookLinearBodyLayoutBase<TItem, TStaticRow> {
  if (cacheKey) {
    const cacheBucket = getWorkbookSharedCacheBucket(
      workbookLinearBodyLayoutBaseCache,
      items as unknown as object,
    );
    const cached = getWorkbookSharedCacheEntry(cacheBucket, cacheKey) as WorkbookLinearBodyLayoutBase<TItem, TStaticRow> | undefined;
    if (cached) return cached;
  }

  const slice = items.slice(startIdx, endIdx);
  const segments: WorkbookLinearBodyBaseSegment<TItem, TStaticRow>[] = [];
  const rowFramesByKey = new Map<string, WorkbookRowFrame>();
  let currentRows: WorkbookProjectedBodyRowEntry<TStaticRow>[] = [];
  let currentRowsTop = 0;
  let currentRowsHeight = 0;
  let cursorTop = 0;

  const flushRows = () => {
    if (currentRows.length === 0) return;
    segments.push({
      kind: 'rows',
      rows: currentRows,
      top: currentRowsTop,
      height: currentRowsHeight,
    });
    currentRows = [];
    currentRowsHeight = 0;
  };

  slice.forEach((item, localIndex) => {
    const itemIndex = startIdx + localIndex;
    const kind = resolveItemKind(item);
    const height = resolveItemHeight(item);

    if (kind !== 'row') {
      flushRows();
      segments.push({
        kind,
        item,
        top: cursorTop,
        height,
        sourceItemIndex: itemIndex,
      });
      cursorTop += height;
      currentRowsTop = cursorTop;
      return;
    }

    const row = resolveRow(item);
    if (!row) return;
    if (currentRows.length === 0) currentRowsTop = cursorTop;

    currentRows.push({
      row,
      height,
      sourceItemIndex: itemIndex,
      staticRow: buildStaticRow(item, { itemIndex, height, row }),
    });
    rowFramesByKey.set(getWorkbookRowKey(row), {
      top: cursorTop,
      height,
    });
    cursorTop += height;
    currentRowsHeight += height;
  });

  flushRows();

  const nextValue = {
    segments,
    rowFramesByKey,
  };

  if (cacheKey) {
    const cacheBucket = getWorkbookSharedCacheBucket(
      workbookLinearBodyLayoutBaseCache,
      items as unknown as object,
    );
    setWorkbookSharedCacheEntry(cacheBucket, cacheKey, nextValue);
  }

  return nextValue;
}

export function buildWorkbookGroupedBodyLayoutBase<TItem, TStaticRow extends object>({
  items,
  startIdx,
  endIdx,
  cacheKey = null,
  resolveItemKind,
  resolveItemHeight,
  resolveRows,
}: BuildWorkbookGroupedBodyLayoutBaseParams<TItem, TStaticRow>): WorkbookGroupedBodyLayoutBase<TItem, TStaticRow> {
  if (cacheKey) {
    const cacheBucket = getWorkbookSharedCacheBucket(
      workbookGroupedBodyLayoutBaseCache,
      items as unknown as object,
    );
    const cached = getWorkbookSharedCacheEntry(cacheBucket, cacheKey) as WorkbookGroupedBodyLayoutBase<TItem, TStaticRow> | undefined;
    if (cached) return cached;
  }

  const slice = items.slice(startIdx, endIdx);
  const segments: WorkbookGroupedBodyBaseSegment<TItem, TStaticRow>[] = [];
  const rowFramesByKey = new Map<string, WorkbookRowFrame>();
  let cursorTop = 0;

  slice.forEach((item, localIndex) => {
    const itemIndex = startIdx + localIndex;
    const kind = resolveItemKind(item);
    const height = resolveItemHeight(item);

    if (kind !== 'rows') {
      segments.push({
        kind,
        item,
        top: cursorTop,
        height,
        sourceItemIndex: itemIndex,
      });
      cursorTop += height;
      return;
    }

    const rows = resolveRows(item);
    let rowCursorTop = cursorTop;
    rows.forEach((entry) => {
      rowFramesByKey.set(getWorkbookRowKey(entry.row), {
        top: rowCursorTop,
        height: entry.height,
      });
      rowCursorTop += entry.height;
    });

    segments.push({
      kind: 'rows',
      item,
      rows: [...rows],
      top: cursorTop,
      height,
    });
    cursorTop += height;
  });

  const nextValue = {
    segments,
    rowFramesByKey,
  };

  if (cacheKey) {
    const cacheBucket = getWorkbookSharedCacheBucket(
      workbookGroupedBodyLayoutBaseCache,
      items as unknown as object,
    );
    setWorkbookSharedCacheEntry(cacheBucket, cacheKey, nextValue);
  }

  return nextValue;
}
