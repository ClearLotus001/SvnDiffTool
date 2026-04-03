import type {
  FilePayload,
  ReadFilePayloadOptions,
  WorkbookPayloadCoverage,
} from './types.js';

// ---------------------------------------------------------------------------
// Generic cache helpers
// ---------------------------------------------------------------------------

export function estimatePayloadMemoryBytes(payload: FilePayload): number {
  const contentBytes = payload.content ? Buffer.byteLength(payload.content, 'utf-8') : 0;
  const rawBytes = payload.bytes?.byteLength ?? 0;
  const metadataBytes = payload.metadata
    ? Buffer.byteLength(JSON.stringify(payload.metadata), 'utf-8')
    : 0;
  return contentBytes + rawBytes + metadataBytes;
}

export function trimCacheByBudget<T extends { memoryBytes: number }>(
  cache: Map<string, T>,
  limit: number,
  maxBytes: number,
): void {
  let totalBytes = 0;
  cache.forEach((entry) => {
    totalBytes += entry.memoryBytes;
  });

  while (cache.size > limit || totalBytes > maxBytes) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const oldestEntry = cache.get(oldestKey);
    if (!oldestEntry) {
      cache.delete(oldestKey);
      continue;
    }
    totalBytes -= oldestEntry.memoryBytes;
    cache.delete(oldestKey);
  }
}

export function rememberCacheEntry<T extends { memoryBytes: number }>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
  maxBytes: number,
): T {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  trimCacheByBudget(cache, limit, maxBytes);
  return value;
}

export function rememberLimitedEntry<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
): T {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Workbook payload coverage helpers
// ---------------------------------------------------------------------------

export function getRequestedWorkbookPayloadCoverage(
  options: ReadFilePayloadOptions = {},
): WorkbookPayloadCoverage {
  return {
    text: options.includeWorkbookText !== false,
    bytes: options.includeWorkbookBytes !== false,
    metadata: options.includeWorkbookMetadata !== false,
  };
}

export function canSatisfyWorkbookPayloadRequest(
  coverage: WorkbookPayloadCoverage,
  options: ReadFilePayloadOptions = {},
): boolean {
  const requested = getRequestedWorkbookPayloadCoverage(options);
  return (
    (!requested.text || coverage.text)
    && (!requested.bytes || coverage.bytes)
    && (!requested.metadata || coverage.metadata)
  );
}

export function projectWorkbookPayloadForOptions(
  payload: FilePayload,
  options: ReadFilePayloadOptions = {},
): FilePayload {
  return {
    ...payload,
    content: options.includeWorkbookText === false ? null : payload.content,
    bytes: options.includeWorkbookBytes === false ? null : payload.bytes,
    metadata: options.includeWorkbookMetadata === false ? null : payload.metadata,
  };
}

export function mergeWorkbookPayload(
  existing: FilePayload | null,
  incoming: FilePayload,
  incomingCoverage: WorkbookPayloadCoverage,
): FilePayload {
  if (!existing) return incoming;

  return {
    content: incomingCoverage.text ? incoming.content : existing.content,
    bytes: incomingCoverage.bytes ? incoming.bytes : existing.bytes,
    metadata: incomingCoverage.metadata ? incoming.metadata : existing.metadata,
    perf: incoming.perf,
  };
}

export function mergeWorkbookPayloadCoverage(
  existing: WorkbookPayloadCoverage | null,
  incoming: WorkbookPayloadCoverage,
): WorkbookPayloadCoverage {
  return {
    text: Boolean(existing?.text || incoming.text),
    bytes: Boolean(existing?.bytes || incoming.bytes),
    metadata: Boolean(existing?.metadata || incoming.metadata),
  };
}

// ---------------------------------------------------------------------------
// File equality cache helpers
// ---------------------------------------------------------------------------

export function rememberFileEquality(
  cache: Map<string, {
    leftPath: string;
    rightPath: string;
    leftMtimeMs: number;
    rightMtimeMs: number;
    leftSize: number;
    rightSize: number;
    equal: boolean;
  }>,
  key: string,
  value: {
    leftPath: string;
    rightPath: string;
    leftMtimeMs: number;
    rightMtimeMs: number;
    leftSize: number;
    rightSize: number;
    equal: boolean;
  },
  limit: number,
): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}
