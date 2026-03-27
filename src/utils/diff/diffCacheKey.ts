import type { DiffData, WorkbookCompareMode } from '@/types';

function hasBytePayload(value: unknown): value is Uint8Array {
  return Boolean(value && ArrayBuffer.isView(value) && value.byteLength > 0);
}

export function buildDiffCacheKey(data: DiffData, compareMode: WorkbookCompareMode): string {
  const sourceIdentity = data.sourceIdentity?.trim();
  if (sourceIdentity) {
    return [compareMode, sourceIdentity].join('::');
  }

  return [
    compareMode,
    data.fileName,
    data.baseRevisionInfo?.id ?? data.baseName,
    data.mineRevisionInfo?.id ?? data.mineName,
    hasBytePayload(data.baseBytes) ? data.baseBytes.byteLength : data.baseContent?.length ?? 0,
    hasBytePayload(data.mineBytes) ? data.mineBytes.byteLength : data.mineContent?.length ?? 0,
  ].join('::');
}
