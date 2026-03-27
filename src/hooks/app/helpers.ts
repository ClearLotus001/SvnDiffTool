import type {
  CompareContext,
  DiffData,
  DiffLine,
  SvnRevisionInfo,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataSource,
  WorkbookPrecomputedDeltaPayload,
} from '@/types';
import type { RevisionOptionsStatus } from '@/hooks/app/types';

const MAX_WORKBOOK_METADATA_SINGLE_BYTES = 12 * 1024 * 1024;
const MAX_WORKBOOK_METADATA_TOTAL_BYTES = 20 * 1024 * 1024;

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function debugLog(message: string, payload?: unknown) {
  window.svnDiff?.debugLog?.(message, payload);
}

export function cycleHunkIndex(current: number, total: number, direction: -1 | 1): number {
  if (total <= 0) return 0;
  return (current + direction + total) % total;
}

export function hasBytePayload(value: unknown): value is Uint8Array {
  return Boolean(value && ArrayBuffer.isView(value) && value.byteLength > 0);
}

export function getPrecomputedDiffLinesForMode(
  data: DiffData,
  compareMode: WorkbookCompareMode,
): DiffLine[] | null {
  return data.precomputedDiffLinesByMode?.[compareMode]
    ?? (compareMode === 'strict' ? (data.precomputedDiffLines ?? null) : null);
}

export function getPrecomputedWorkbookDeltaForMode(
  data: DiffData,
  compareMode: WorkbookCompareMode,
): WorkbookPrecomputedDeltaPayload | null {
  return data.precomputedWorkbookDeltaByMode?.[compareMode]
    ?? (compareMode === 'strict' ? (data.precomputedWorkbookDelta ?? null) : null);
}

export function mergeWorkbookCompareModePayload(
  data: DiffData,
  payload: WorkbookCompareModePayload,
): DiffData {
  const nextDiffLinesByMode = {
    ...(data.precomputedDiffLinesByMode ?? {}),
    [payload.compareMode]: payload.diffLines,
  };
  const nextWorkbookDeltaByMode = payload.workbookDelta
    ? {
        ...(data.precomputedWorkbookDeltaByMode ?? {}),
        [payload.compareMode]: payload.workbookDelta,
      }
    : (data.precomputedWorkbookDeltaByMode ?? null);

  return {
    ...data,
    precomputedDiffLines: payload.compareMode === 'strict'
      ? payload.diffLines
      : (data.precomputedDiffLines ?? null),
    precomputedWorkbookDelta: payload.compareMode === 'strict'
      ? payload.workbookDelta
      : (data.precomputedWorkbookDelta ?? null),
    precomputedDiffLinesByMode: nextDiffLinesByMode,
    precomputedWorkbookDeltaByMode: nextWorkbookDeltaByMode,
    perf: payload.perf
      ? {
          ...(data.perf ?? { source: 'local-dev' as const }),
          ...payload.perf,
        }
      : (data.perf ?? null),
  };
}

export function shouldResolveWorkbookMetadata(source: WorkbookMetadataSource) {
  const baseBytes = hasBytePayload(source.baseBytes) ? source.baseBytes.byteLength : 0;
  const mineBytes = hasBytePayload(source.mineBytes) ? source.mineBytes.byteLength : 0;
  if (baseBytes === 0 && mineBytes === 0) return false;
  if (baseBytes > MAX_WORKBOOK_METADATA_SINGLE_BYTES || mineBytes > MAX_WORKBOOK_METADATA_SINGLE_BYTES) {
    return false;
  }
  return (baseBytes + mineBytes) <= MAX_WORKBOOK_METADATA_TOTAL_BYTES;
}

export function getRevisionOptionsStatus(
  data: Partial<Pick<DiffData, 'revisionOptions' | 'canSwitchRevisions'>>,
): RevisionOptionsStatus {
  if (!data.canSwitchRevisions) return 'loaded';
  return data.revisionOptions?.length ? 'loaded' : 'idle';
}

export function getCompareContextLabels(compareContext: CompareContext) {
  if (compareContext === 'standard_local_compare') {
    return {
      baseTitleKey: 'splitHeaderCompareVersionTitle',
      mineTitleKey: 'splitHeaderWorkingCopyTitle',
      baseStatsKey: 'statsCompareVersion',
      mineStatsKey: 'statsWorkingCopy',
    } as const;
  }
  if (compareContext === 'revision_vs_revision_compare') {
    return {
      baseTitleKey: 'splitHeaderLeftVersionTitle',
      mineTitleKey: 'splitHeaderRightVersionTitle',
      baseStatsKey: 'statsLeftVersion',
      mineStatsKey: 'statsRightVersion',
    } as const;
  }
  return {
    baseTitleKey: 'splitHeaderLeftFileTitle',
    mineTitleKey: 'splitHeaderRightFileTitle',
    baseStatsKey: 'statsLeftFile',
    mineStatsKey: 'statsRightFile',
  } as const;
}

export function mergeRevisionOptions(current: SvnRevisionInfo[], incoming: SvnRevisionInfo[]): SvnRevisionInfo[] {
  const nextById = new Map<string, SvnRevisionInfo>();
  current.forEach((option) => {
    nextById.set(option.id, option);
  });
  incoming.forEach((option) => {
    nextById.set(option.id, option);
  });

  const ordered: SvnRevisionInfo[] = [];
  const seen = new Set<string>();
  [...current, ...incoming].forEach((option) => {
    if (seen.has(option.id)) return;
    const latest = nextById.get(option.id);
    if (!latest) return;
    seen.add(option.id);
    ordered.push(latest);
  });
  return ordered;
}
