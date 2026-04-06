const DEFAULT_WORKBOOK_SHARED_CACHE_MAX_ENTRIES = 12;

export type WorkbookSharedCacheKeyPart = string | number | boolean | null | undefined;

export function buildWorkbookCacheSignature(
  parts: ReadonlyArray<WorkbookSharedCacheKeyPart>,
): string {
  return parts.map((part) => {
    if (part == null) return '';
    if (typeof part === 'boolean') return part ? '1' : '0';
    return String(part);
  }).join('::');
}

export function getWorkbookSharedCacheBucket<TKey extends object, TValue>(
  cache: WeakMap<TKey, Map<string, TValue>>,
  owner: TKey,
): Map<string, TValue> {
  let bucket = cache.get(owner);
  if (!bucket) {
    bucket = new Map<string, TValue>();
    cache.set(owner, bucket);
  }
  return bucket;
}

export function getWorkbookSharedCacheEntry<TValue>(
  bucket: Map<string, TValue>,
  key: string,
): TValue | undefined {
  const cached = bucket.get(key);
  if (cached === undefined) return undefined;
  bucket.delete(key);
  bucket.set(key, cached);
  return cached;
}

export function setWorkbookSharedCacheEntry<TValue>(
  bucket: Map<string, TValue>,
  key: string,
  value: TValue,
  maxEntries = DEFAULT_WORKBOOK_SHARED_CACHE_MAX_ENTRIES,
): void {
  if (bucket.has(key)) bucket.delete(key);
  bucket.set(key, value);

  while (bucket.size > maxEntries) {
    const oldestKey = bucket.keys().next().value;
    if (oldestKey == null) break;
    bucket.delete(oldestKey);
  }
}
