import type { DiffLine, WorkbookMetadataMap } from '@/types';
import type { CachedDiffResult } from '@/hooks/app/types';

const DEFAULT_DIFF_RESULT_CACHE_LIMIT = 8;
const DEFAULT_DIFF_RESULT_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const UTF16_BYTES_PER_CHAR = 2;
const APPROX_NUMBER_BYTES = 8;

function estimateStringBytes(value: string | null | undefined): number {
  return value ? (value.length * UTF16_BYTES_PER_CHAR) : 0;
}

function estimateCharSpansBytes(spans: DiffLine['baseCharSpans']): number {
  if (!spans) return 0;

  let total = 0;
  spans.forEach((span) => {
    total += estimateStringBytes(span.text);
    total += 1;
  });
  return total;
}

function estimateDiffLinesBytes(diffLines: DiffLine[] | null): number {
  if (!diffLines) return 0;

  let total = 0;

  diffLines.forEach((line) => {
    total += estimateStringBytes(line.base);
    total += estimateStringBytes(line.mine);
    total += estimateCharSpansBytes(line.baseCharSpans);
    total += estimateCharSpansBytes(line.mineCharSpans);
    total += APPROX_NUMBER_BYTES * 2;
    total += 1;
  });

  return total;
}

function estimateJsonBytes(value: WorkbookMetadataMap | null): number {
  if (!value) return 0;
  return estimateStringBytes(JSON.stringify(value));
}

export function buildCachedDiffResult(
  result: Omit<CachedDiffResult, 'memoryBytes'>,
): CachedDiffResult {
  return {
    ...result,
    memoryBytes: estimateDiffLinesBytes(result.diffLines)
      + estimateJsonBytes(result.baseWorkbookMetadata)
      + estimateJsonBytes(result.mineWorkbookMetadata),
  };
}

export function rememberCachedDiffResult(
  cache: Map<string, CachedDiffResult>,
  key: string,
  result: CachedDiffResult,
  options: { limit?: number; maxBytes?: number } = {},
): void {
  const limit = options.limit ?? DEFAULT_DIFF_RESULT_CACHE_LIMIT;
  const maxBytes = options.maxBytes ?? DEFAULT_DIFF_RESULT_CACHE_MAX_BYTES;

  if (cache.has(key)) cache.delete(key);

  if (result.memoryBytes > maxBytes) {
    return;
  }

  cache.set(key, result);

  let totalBytes = 0;
  cache.forEach((entry) => {
    totalBytes += entry.memoryBytes;
  });

  while (cache.size > limit || totalBytes > maxBytes) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;

    const oldestEntry = cache.get(oldestKey);
    if (oldestEntry) {
      totalBytes -= oldestEntry.memoryBytes;
    }
    cache.delete(oldestKey);
  }
}
