import type {
  CompareContext,
  DiffData,
  DiffAnalysisSnapshot,
  DiffLine,
  PreparedTextAnalysis,
  SvnRevisionInfo,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookDiffRegion,
  WorkbookMetadataPayload,
  PreparedWorkbookAnalysis,
  WorkbookMetadataSource,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSection,
} from '@/types';
import type { RevisionOptionsStatus } from '@/hooks/app/types';

const MAX_WORKBOOK_METADATA_SINGLE_BYTES = 12 * 1024 * 1024;
const MAX_WORKBOOK_METADATA_TOTAL_BYTES = 20 * 1024 * 1024;
const workbookNavigationRegionVersionCache = new WeakMap<
  WorkbookDiffRegion[],
  Map<string, WorkbookDiffRegion[]>
>();

function applyWorkbookSelectionVersionLabel(
  selection: WorkbookDiffRegion['anchorSelection'],
  baseVersionLabel: string,
  mineVersionLabel: string,
) {
  if (!selection) return selection;
  const versionLabel = selection.side === 'base'
    ? baseVersionLabel
    : mineVersionLabel;
  if (selection.versionLabel === versionLabel) return selection;
  return {
    ...selection,
    versionLabel,
  };
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    // Single rAF is sufficient to let the browser commit the current frame.
    // Using MessageChannel for a micro-task yield after rAF avoids the extra
    // ~16ms cost of double-rAF while still guaranteeing paint completion.
    requestAnimationFrame(() => {
      if (typeof MessageChannel !== 'undefined') {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(undefined);
      } else {
        setTimeout(resolve, 0);
      }
    });
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

function getAnalysisSnapshotForMode(
  data: DiffData | null | undefined,
  compareMode: WorkbookCompareMode,
): DiffAnalysisSnapshot | null {
  return data?.analysisSnapshotsByMode?.[compareMode] ?? null;
}

export function getPreparedTextAnalysisForMode(
  data: DiffData | null | undefined,
  compareMode: WorkbookCompareMode,
): PreparedTextAnalysis | null {
  return getAnalysisSnapshotForMode(data, compareMode)?.textAnalysis ?? null;
}

function getPreparedWorkbookAnalysisForMode(
  data: DiffData | null | undefined,
  compareMode: WorkbookCompareMode,
): PreparedWorkbookAnalysis | null {
  return getAnalysisSnapshotForMode(data, compareMode)?.workbookAnalysis ?? null;
}

export function getPreparedWorkbookSectionsForMode(
  data: DiffData | null | undefined,
  compareMode: WorkbookCompareMode,
): WorkbookSection[] | null {
  return getPreparedWorkbookAnalysisForMode(data, compareMode)?.sectionsByMode?.[compareMode] ?? null;
}

export function getPreparedWorkbookNavigationRegionsForMode(
  data: DiffData | null | undefined,
  compareMode: WorkbookCompareMode,
): WorkbookDiffRegion[] | null {
  return getPreparedWorkbookAnalysisForMode(data, compareMode)?.navigationRegionsByMode?.[compareMode] ?? null;
}

export function applyWorkbookRegionVersionLabels(
  regions: WorkbookDiffRegion[] | null | undefined,
  baseVersionLabel: string,
  mineVersionLabel: string,
): WorkbookDiffRegion[] {
  if (!regions || regions.length === 0) return [];

  const cacheKey = `${baseVersionLabel}::${mineVersionLabel}`;
  let cacheByLabel = workbookNavigationRegionVersionCache.get(regions);
  if (!cacheByLabel) {
    cacheByLabel = new Map();
    workbookNavigationRegionVersionCache.set(regions, cacheByLabel);
  }
  const cached = cacheByLabel.get(cacheKey);
  if (cached) return cached;

  const nextRegions = regions.map((region) => {
    const nextAnchorSelection = applyWorkbookSelectionVersionLabel(
      region.anchorSelection,
      baseVersionLabel,
      mineVersionLabel,
    );
    const nextPatches = region.patches.map((patch) => {
      const patchWithAnchor = patch as typeof patch & { anchorSelection?: WorkbookDiffRegion['anchorSelection'] };
      const nextPatchAnchorSelection = applyWorkbookSelectionVersionLabel(
        patchWithAnchor.anchorSelection ?? null,
        baseVersionLabel,
        mineVersionLabel,
      );
      if (nextPatchAnchorSelection === patchWithAnchor.anchorSelection) return patch;
      return {
        ...patch,
        anchorSelection: nextPatchAnchorSelection,
      };
    });
    const hasPatchChanges = nextPatches.some((patch, index) => patch !== region.patches[index]);
    if (nextAnchorSelection === region.anchorSelection && !hasPatchChanges) return region;
    return {
      ...region,
      anchorSelection: nextAnchorSelection,
      patches: hasPatchChanges ? nextPatches : region.patches,
    };
  });

  cacheByLabel.set(cacheKey, nextRegions);
  return nextRegions;
}

function updateWorkbookSnapshotMetadata(
  snapshot: DiffAnalysisSnapshot | null | undefined,
  baseMetadata: DiffData['baseWorkbookMetadata'],
  mineMetadata: DiffData['mineWorkbookMetadata'],
): DiffAnalysisSnapshot | null {
  if (!snapshot?.workbookAnalysis) return snapshot ?? null;

  return {
    ...snapshot,
    workbookAnalysis: {
      ...snapshot.workbookAnalysis,
      metadata: {
        base: baseMetadata ?? null,
        mine: mineMetadata ?? null,
      },
    },
  };
}

export function getPrecomputedDiffLinesForMode(
  data: DiffData,
  compareMode: WorkbookCompareMode,
): DiffLine[] | null {
  const snapshotDiffLines = getPreparedTextAnalysisForMode(data, compareMode)?.diffLines
    ?? getPreparedWorkbookAnalysisForMode(data, compareMode)?.diffLinesByMode[compareMode]
    ?? null;
  if (snapshotDiffLines) return snapshotDiffLines;
  return data.precomputedDiffLinesByMode?.[compareMode]
    ?? (compareMode === 'strict' ? (data.precomputedDiffLines ?? null) : null);
}

export function getPrecomputedWorkbookDeltaForMode(
  data: DiffData,
  compareMode: WorkbookCompareMode,
): WorkbookPrecomputedDeltaPayload | null {
  const snapshotWorkbookDelta = getPreparedWorkbookAnalysisForMode(data, compareMode)?.workbookDeltaByMode[compareMode] ?? null;
  if (snapshotWorkbookDelta) return snapshotWorkbookDelta;
  return data.precomputedWorkbookDeltaByMode?.[compareMode]
    ?? (compareMode === 'strict' ? (data.precomputedWorkbookDelta ?? null) : null);
}

export function mergeWorkbookCompareModePayload(
  data: DiffData,
  payload: WorkbookCompareModePayload,
): DiffData {
  const payloadSnapshot = payload.analysisSnapshot ?? null;
  const nextBaseWorkbookMetadata = payloadSnapshot?.workbookAnalysis?.metadata.base
    ?? data.baseWorkbookMetadata
    ?? null;
  const nextMineWorkbookMetadata = payloadSnapshot?.workbookAnalysis?.metadata.mine
    ?? data.mineWorkbookMetadata
    ?? null;
  const mergedPayloadSnapshot = payloadSnapshot
    ? updateWorkbookSnapshotMetadata(payloadSnapshot, nextBaseWorkbookMetadata, nextMineWorkbookMetadata)
    : null;
  const nextAnalysisSnapshotsByMode = mergedPayloadSnapshot
    ? {
        ...(data.analysisSnapshotsByMode ?? {}),
        [payload.compareMode]: mergedPayloadSnapshot,
      }
    : (data.analysisSnapshotsByMode ?? null);

  return {
    ...data,
    analysisSnapshotsByMode: nextAnalysisSnapshotsByMode,
    baseWorkbookMetadata: nextBaseWorkbookMetadata,
    mineWorkbookMetadata: nextMineWorkbookMetadata,
    workbookArtifactDiff: mergedPayloadSnapshot?.workbookAnalysis?.artifactDiff
      ?? data.workbookArtifactDiff
      ?? null,
    perf: payload.perf
      ? {
          ...(data.perf ?? { source: 'local-dev' as const }),
          ...payload.perf,
        }
      : (data.perf ?? null),
  };
}

export function mergeWorkbookMetadataPayload(
  data: DiffData,
  payload: WorkbookMetadataPayload,
): DiffData {
  const baseMetadata = payload.base ?? null;
  const mineMetadata = payload.mine ?? null;
  const payloadSnapshot = payload.analysisSnapshot ?? null;
  const nextAnalysisSnapshotsByMode = (() => {
    const currentSnapshots = data.analysisSnapshotsByMode ?? null;
    if (!currentSnapshots && !payloadSnapshot) return currentSnapshots;

    const nextEntries = (Object.entries(currentSnapshots ?? {}) as Array<[WorkbookCompareMode, DiffAnalysisSnapshot | null]>).reduce<NonNullable<DiffData['analysisSnapshotsByMode']>>(
      (accumulator, [mode, snapshot]) => ({
        ...accumulator,
        [mode]: updateWorkbookSnapshotMetadata(snapshot, baseMetadata, mineMetadata),
      }),
      {},
    );

    if (payloadSnapshot) {
      nextEntries[payloadSnapshot.compareMode] = updateWorkbookSnapshotMetadata(
        payloadSnapshot,
        baseMetadata,
        mineMetadata,
      );
    }

    return nextEntries;
  })();

  return {
    ...data,
    analysisSnapshotsByMode: nextAnalysisSnapshotsByMode,
    baseWorkbookMetadata: baseMetadata,
    mineWorkbookMetadata: mineMetadata,
    workbookArtifactDiff: payloadSnapshot?.workbookAnalysis?.artifactDiff
      ?? data.workbookArtifactDiff
      ?? null,
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
