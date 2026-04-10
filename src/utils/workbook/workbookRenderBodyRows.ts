import type { SplitRow } from '@/types';

const workbookRenderBodyRowsCache = new WeakMap<object, Map<string, SplitRow[]>>();
const EMPTY_SPLIT_ROWS: SplitRow[] = [];

export function collectWorkbookRenderBodyRows<TItem>(
  items: readonly TItem[],
  cacheKey: string,
  getRow: (item: TItem) => SplitRow | null,
): SplitRow[] {
  if (items.length === 0) return EMPTY_SPLIT_ROWS;

  const cacheOwner = items as unknown as object;
  let cacheByItems = workbookRenderBodyRowsCache.get(cacheOwner);
  if (!cacheByItems) {
    cacheByItems = new Map();
    workbookRenderBodyRowsCache.set(cacheOwner, cacheByItems);
  }

  const cached = cacheByItems.get(cacheKey);
  if (cached) return cached;

  const rows: SplitRow[] = [];
  items.forEach((item) => {
    const row = getRow(item);
    if (row) rows.push(row);
  });
  cacheByItems.set(cacheKey, rows);
  return rows;
}
