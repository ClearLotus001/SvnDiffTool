import { constants as zlibConstants, gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { WORKBOOK_COMPARE_CACHE_COMPRESS_MIN_BYTES } from './constants.js';
import type {
  CompressedWorkbookCompareCachePayload,
  DiffLine,
  FilePayload,
  InlineWorkbookCompareCachePayload,
  ReadFilePayloadOptions,
  StoredWorkbookCompareCachePayload,
  WorkbookCellDeltaPayload,
  WorkbookCompareModePayload,
  WorkbookMetadataMap,
  WorkbookPayloadCoverage,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSectionDeltaPayload,
} from './types.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ---------------------------------------------------------------------------
// Generic cache helpers
// ---------------------------------------------------------------------------

export function estimatePayloadMemoryBytes(payload: FilePayload): number {
  const contentBytes = payload.content ? Buffer.byteLength(payload.content, 'utf-8') : 0;
  const rawBytes = payload.bytes?.byteLength ?? 0;
  const metadataBytes = estimateWorkbookMetadataMapMemoryBytes(payload.metadata);
  return contentBytes + rawBytes + metadataBytes;
}

function estimateStringBytes(value: string | null | undefined): number {
  return value ? Buffer.byteLength(value, 'utf-8') : 0;
}

function estimateDiffLineBytes(line: DiffLine): number {
  return estimateStringBytes(line.base)
    + estimateStringBytes(line.mine)
    + 64;
}

function estimateWorkbookCellDeltaBytes(cellDelta: WorkbookCellDeltaPayload): number {
  return estimateStringBytes(cellDelta.baseCell.value)
    + estimateStringBytes(cellDelta.baseCell.formula)
    + estimateStringBytes(cellDelta.mineCell.value)
    + estimateStringBytes(cellDelta.mineCell.formula)
    + 96;
}

function estimateWorkbookSectionDeltaBytes(section: WorkbookSectionDeltaPayload): number {
  return estimateStringBytes(section.name)
    + section.rows.reduce((total, row) => (
      total
      + (row.lineIdxs.length * 8)
      + (row.changedColumns.length * 8)
      + (row.strictOnlyColumns.length * 8)
      + row.cellDeltas.reduce((cellTotal, cellDelta) => (
          cellTotal + estimateWorkbookCellDeltaBytes(cellDelta)
        ), 0)
      + 96
    ), 0)
    + 48;
}

function estimateWorkbookDeltaMemoryBytes(
  workbookDelta: WorkbookPrecomputedDeltaPayload | null,
): number {
  if (!workbookDelta) return 0;

  return estimateStringBytes(workbookDelta.compareMode)
    + workbookDelta.sections.reduce((total, section) => (
        total + estimateWorkbookSectionDeltaBytes(section)
      ), 0)
    + 64;
}

export function estimateWorkbookComparePayloadMemoryBytes(
  payload: WorkbookCompareModePayload,
): number {
  const diffLinesBytes = payload.diffLines?.reduce((total, line) => (
    total + estimateDiffLineBytes(line)
  ), 0) ?? 0;
  const workbookDeltaBytes = estimateWorkbookDeltaMemoryBytes(payload.workbookDelta);
  return diffLinesBytes + workbookDeltaBytes + 128;
}

function createInlineWorkbookCompareCachePayload(
  payload: WorkbookCompareModePayload,
): InlineWorkbookCompareCachePayload {
  return {
    kind: 'inline',
    value: payload,
  };
}

function createCompressedWorkbookCompareCachePayload(
  bytes: Buffer,
): CompressedWorkbookCompareCachePayload {
  return {
    kind: 'gzip-json-v1',
    bytes,
  };
}

export async function storeWorkbookCompareCachePayload(
  payload: WorkbookCompareModePayload,
): Promise<{ payload: StoredWorkbookCompareCachePayload; memoryBytes: number }> {
  const estimatedMemoryBytes = estimateWorkbookComparePayloadMemoryBytes(payload);
  if (estimatedMemoryBytes < WORKBOOK_COMPARE_CACHE_COMPRESS_MIN_BYTES) {
    return {
      payload: createInlineWorkbookCompareCachePayload(payload),
      memoryBytes: estimatedMemoryBytes,
    };
  }

  const compressedBytes = await gzipAsync(
    Buffer.from(JSON.stringify(payload), 'utf-8'),
    { level: zlibConstants.Z_BEST_SPEED },
  );
  return {
    payload: createCompressedWorkbookCompareCachePayload(compressedBytes),
    memoryBytes: compressedBytes.byteLength,
  };
}

export async function readWorkbookCompareCachePayload(
  payload: StoredWorkbookCompareCachePayload,
): Promise<WorkbookCompareModePayload> {
  if (payload.kind === 'inline') {
    return payload.value;
  }

  const jsonBytes = await gunzipAsync(payload.bytes);
  return JSON.parse(jsonBytes.toString('utf-8')) as WorkbookCompareModePayload;
}

function estimateWorkbookSheetMetadataMemoryBytes(
  sheetName: string,
  metadata: WorkbookMetadataMap['sheets'][string],
): number {
  return estimateStringBytes(sheetName)
    + estimateStringBytes(metadata.name)
    + (metadata.hiddenColumns.length * 8)
    + (metadata.mergeRanges.length * 32)
    + 64;
}

function estimateWorkbookMetadataMapMemoryBytes(
  metadata: WorkbookMetadataMap | null,
): number {
  if (!metadata) return 0;

  return Object.entries(metadata.sheets).reduce((total, [sheetName, sheetMetadata]) => (
    total + estimateWorkbookSheetMetadataMemoryBytes(sheetName, sheetMetadata)
  ), 32);
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
