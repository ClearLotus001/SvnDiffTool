import type { SplitRow } from '@/types';
import { getWorkbookRowKey } from '@/utils/workbook/workbookPanelHelpers';
import {
  buildWorkbookCacheSignature,
  getWorkbookSharedCacheBucket,
  getWorkbookSharedCacheEntry,
  setWorkbookSharedCacheEntry,
} from '@/utils/workbook/workbookSharedCache';

export interface WorkbookRowFrame {
  top: number;
  height: number;
}

export interface WorkbookVisibleRowFrameSource {
  framesByKey: ReadonlyMap<string, WorkbookRowFrame>;
  topOffset: number;
}

const workbookSectionRowIndexByKeyCache = new WeakMap<readonly SplitRow[], Map<string, number>>();
const workbookRowFramesByKeyCache = new WeakMap<object, Map<string, Map<string, WorkbookRowFrame>>>();
const workbookVisibleRowFramesCache = new WeakMap<readonly SplitRow[], Map<string, Map<number, WorkbookRowFrame>>>();
const workbookVisibleRowFrameSourceObjectIds = new WeakMap<object, number>();
let nextWorkbookVisibleRowFrameSourceObjectId = 1;

function getWorkbookVisibleRowFrameSourceObjectId(value: object): number {
  const existing = workbookVisibleRowFrameSourceObjectIds.get(value);
  if (existing) return existing;
  const nextId = nextWorkbookVisibleRowFrameSourceObjectId;
  nextWorkbookVisibleRowFrameSourceObjectId += 1;
  workbookVisibleRowFrameSourceObjectIds.set(value, nextId);
  return nextId;
}

export function buildWorkbookVisibleRowFramesCacheKey(
  sources: readonly WorkbookVisibleRowFrameSource[],
): string {
  return buildWorkbookCacheSignature(
    sources.flatMap((source) => [
      getWorkbookVisibleRowFrameSourceObjectId(source.framesByKey as object),
      source.topOffset,
    ]),
  );
}

export function buildWorkbookSectionRowIndexByKey(
  sectionRows: readonly SplitRow[],
): Map<string, number> {
  const cached = workbookSectionRowIndexByKeyCache.get(sectionRows);
  if (cached) return cached;

  const next = new Map(sectionRows.map((row, index) => [getWorkbookRowKey(row), index]));
  workbookSectionRowIndexByKeyCache.set(sectionRows, next);
  return next;
}

export function collectWorkbookRowFramesByKey<TItem>(
  items: readonly TItem[],
  options: {
    getRowKey: (item: TItem) => string;
    getItemHeight: (item: TItem) => number;
    initialTop?: number;
    cacheKey?: string | null;
  },
): Map<string, WorkbookRowFrame> {
  if (options.cacheKey) {
    const cacheBucket = getWorkbookSharedCacheBucket(
      workbookRowFramesByKeyCache,
      items as unknown as object,
    );
    const fullCacheKey = buildWorkbookCacheSignature([
      options.cacheKey,
      options.initialTop ?? 0,
    ]);
    const cached = getWorkbookSharedCacheEntry(cacheBucket, fullCacheKey);
    if (cached) return cached;

    const next = collectWorkbookRowFramesByKey(items, {
      ...options,
      cacheKey: null,
    });
    setWorkbookSharedCacheEntry(cacheBucket, fullCacheKey, next);
    return next;
  }

  const next = new Map<string, WorkbookRowFrame>();
  let cursorTop = options.initialTop ?? 0;

  items.forEach((item) => {
    const height = options.getItemHeight(item);
    next.set(options.getRowKey(item), {
      top: cursorTop,
      height,
    });
    cursorTop += height;
  });

  return next;
}

function projectWorkbookVisibleRowFrames(
  sectionRowIndexByKey: ReadonlyMap<string, number>,
  sources: readonly WorkbookVisibleRowFrameSource[],
): Map<number, WorkbookRowFrame> {
  const next = new Map<number, WorkbookRowFrame>();

  sources.forEach(({ framesByKey, topOffset }) => {
    framesByKey.forEach((frame, rowKey) => {
      const rowIndex = sectionRowIndexByKey.get(rowKey);
      if (rowIndex == null) return;
      next.set(rowIndex, {
        top: topOffset + frame.top,
        height: frame.height,
      });
    });
  });

  return next;
}

export function resolveWorkbookVisibleRowFrames(
  sectionRows: readonly SplitRow[],
  sources: readonly WorkbookVisibleRowFrameSource[],
): Map<number, WorkbookRowFrame> {
  const cacheBucket = getWorkbookSharedCacheBucket(
    workbookVisibleRowFramesCache,
    sectionRows,
  );
  const cacheKey = buildWorkbookVisibleRowFramesCacheKey(sources);
  const cached = getWorkbookSharedCacheEntry(cacheBucket, cacheKey);
  if (cached) return cached;

  const next = projectWorkbookVisibleRowFrames(
    buildWorkbookSectionRowIndexByKey(sectionRows),
    sources,
  );
  setWorkbookSharedCacheEntry(cacheBucket, cacheKey, next);
  return next;
}
