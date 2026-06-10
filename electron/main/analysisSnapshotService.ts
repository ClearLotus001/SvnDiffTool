import { performance } from 'node:perf_hooks';

import { detectWorkbookArtifactOnlyDiffFromEqualityState } from '../workbookArtifactDiff.js';
import {
  readFilePayload,
  resolveWorkbookCompareModePayload,
  resolveWorkbookMetadataPairPayload,
} from './filePayload.js';
import { prepareWorkbookProjection } from './workbookProjection.js';
import { haveSameLocalFileAndBytes, haveSameLocalFileContents } from './svnOperations.js';
import { prepareTextDiffAnalysis } from './text/diff.js';
import type {
  DiffAnalysisSnapshot,
  FilePayload,
  WorkbookCompareMode,
} from './types.js';

const ANALYSIS_SNAPSHOT_CACHE_LIMIT = 8;

const analysisSnapshotCache = new Map<string, DiffAnalysisSnapshot>();
const analysisSnapshotInFlight = new Map<string, Promise<DiffAnalysisSnapshot>>();
const WORKBOOK_METADATA_ONLY_PAYLOAD_OPTIONS = {
  includeWorkbookText: false,
  includeWorkbookBytes: false,
  includeWorkbookMetadata: true,
} as const;

export interface ResolveAnalysisSnapshotInput {
  sourceIdentity: string;
  compareMode: WorkbookCompareMode;
  baseRevisionId?: string | undefined;
  mineRevisionId?: string | undefined;
  fileName: string;
  isWorkbook: boolean;
  basePayload: FilePayload;
  minePayload: FilePayload;
  baseLocalPath: string;
  mineLocalPath: string;
}

export function buildAnalysisSnapshotCacheKey({
  sourceIdentity,
  compareMode,
  baseRevisionId,
  mineRevisionId,
}: Pick<ResolveAnalysisSnapshotInput, 'sourceIdentity' | 'compareMode' | 'baseRevisionId' | 'mineRevisionId'>): string {
  return [
    sourceIdentity.trim(),
    baseRevisionId ?? '',
    mineRevisionId ?? '',
    compareMode,
  ].join('::');
}

export function peekAnalysisSnapshot(
  input: Pick<ResolveAnalysisSnapshotInput, 'sourceIdentity' | 'compareMode' | 'baseRevisionId' | 'mineRevisionId'>,
): DiffAnalysisSnapshot | null {
  const key = buildAnalysisSnapshotCacheKey(input);
  const cached = analysisSnapshotCache.get(key);
  return cached ? touchAnalysisSnapshot(key, cached) : null;
}

export function peekWorkbookAnalysisSnapshot(
  input: Pick<ResolveAnalysisSnapshotInput, 'sourceIdentity' | 'baseRevisionId' | 'mineRevisionId'>,
  preferredModes: WorkbookCompareMode[] = ['strict', 'content'],
): DiffAnalysisSnapshot | null {
  for (const compareMode of preferredModes) {
    const snapshot = peekAnalysisSnapshot({
      ...input,
      compareMode,
    });
    if (snapshot?.workbookAnalysis) {
      return snapshot;
    }
  }
  return null;
}

export function getInFlightAnalysisSnapshot(
  input: Pick<ResolveAnalysisSnapshotInput, 'sourceIdentity' | 'compareMode' | 'baseRevisionId' | 'mineRevisionId'>,
): Promise<DiffAnalysisSnapshot> | null {
  return analysisSnapshotInFlight.get(buildAnalysisSnapshotCacheKey(input)) ?? null;
}

function touchAnalysisSnapshot(key: string, snapshot: DiffAnalysisSnapshot): DiffAnalysisSnapshot {
  if (analysisSnapshotCache.has(key)) {
    analysisSnapshotCache.delete(key);
  }
  analysisSnapshotCache.set(key, snapshot);
  return snapshot;
}

function rememberAnalysisSnapshot(key: string, snapshot: DiffAnalysisSnapshot) {
  touchAnalysisSnapshot(key, snapshot);
  while (analysisSnapshotCache.size > ANALYSIS_SNAPSHOT_CACHE_LIMIT) {
    const oldestKey = analysisSnapshotCache.keys().next().value;
    if (!oldestKey) break;
    analysisSnapshotCache.delete(oldestKey);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

async function resolveWorkbookContentsEqual(
  left: { path: string; bytes: Uint8Array | null; byteLength: number },
  right: { path: string; bytes: Uint8Array | null; byteLength: number },
): Promise<boolean | null> {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  if (left.path && right.path) {
    return haveSameLocalFileContents(left.path, right.path);
  }
  if (left.path && right.bytes) {
    return haveSameLocalFileAndBytes(left.path, right.bytes);
  }
  if (right.path && left.bytes) {
    return haveSameLocalFileAndBytes(right.path, left.bytes);
  }
  if (left.bytes && right.bytes) {
    return bytesEqual(left.bytes, right.bytes);
  }
  return null;
}

async function buildWorkbookSnapshot(
  input: ResolveAnalysisSnapshotInput,
): Promise<DiffAnalysisSnapshot> {
  const diffStart = performance.now();
  const resolveMetadataState = async (hints?: {
    baseWorkbookMetadata?: FilePayload['metadata'];
    mineWorkbookMetadata?: FilePayload['metadata'];
    metadataMs?: number;
  }): Promise<{
    baseWorkbookMetadata: FilePayload['metadata'];
    mineWorkbookMetadata: FilePayload['metadata'];
    metadataMs: number;
  }> => {
    if (hints?.baseWorkbookMetadata && hints.mineWorkbookMetadata) {
      return {
        baseWorkbookMetadata: hints.baseWorkbookMetadata,
        mineWorkbookMetadata: hints.mineWorkbookMetadata,
        metadataMs: hints.metadataMs ?? 0,
      };
    }

    const shouldPreferPairPayload = Boolean(
      input.baseLocalPath
      && input.mineLocalPath
      && (!input.basePayload.metadata || !input.minePayload.metadata),
    );
    if (shouldPreferPairPayload) {
      const metadataPairPayload = await resolveWorkbookMetadataPairPayload(
        input.baseLocalPath,
        input.mineLocalPath,
        input.fileName,
      );
      if (metadataPairPayload) {
        return {
          baseWorkbookMetadata: metadataPairPayload.base ?? input.basePayload.metadata,
          mineWorkbookMetadata: metadataPairPayload.mine ?? input.minePayload.metadata,
          metadataMs: metadataPairPayload.perf?.metadataMs ?? 0,
        };
      }
    }

    const resolveMetadataPayload = (
      payload: FilePayload,
      localPath: string,
    ): Promise<FilePayload> => {
      if (payload.metadata || !localPath) {
        return Promise.resolve(payload);
      }
      return readFilePayload(localPath, WORKBOOK_METADATA_ONLY_PAYLOAD_OPTIONS);
    };
    const baseMetadataPayloadPromise = resolveMetadataPayload(input.basePayload, input.baseLocalPath);
    const mineMetadataPayloadPromise = input.mineLocalPath
      && input.mineLocalPath === input.baseLocalPath
      && !input.minePayload.metadata
      && !input.basePayload.metadata
      ? baseMetadataPayloadPromise
      : resolveMetadataPayload(input.minePayload, input.mineLocalPath);
    const [baseMetadataPayload, mineMetadataPayload] = await Promise.all([
      baseMetadataPayloadPromise,
      mineMetadataPayloadPromise,
    ]);

    return {
      baseWorkbookMetadata: baseMetadataPayload.metadata ?? input.basePayload.metadata,
      mineWorkbookMetadata: mineMetadataPayload.metadata ?? input.minePayload.metadata,
      metadataMs: (baseMetadataPayload.perf.metadataMs ?? 0) + (mineMetadataPayload.perf.metadataMs ?? 0),
    };
  };
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    input.baseLocalPath,
    input.basePayload.bytes,
    input.mineLocalPath,
    input.minePayload.bytes,
    input.fileName,
    input.compareMode,
  );
  const hasComparePayloadMetadata = Boolean(
    workbookComparePayload?.baseMetadata && workbookComparePayload.mineMetadata,
  );
  const metadataState = await resolveMetadataState(
    hasComparePayloadMetadata
      ? {
          baseWorkbookMetadata: workbookComparePayload?.baseMetadata ?? null,
          mineWorkbookMetadata: workbookComparePayload?.mineMetadata ?? null,
          metadataMs: workbookComparePayload?.perf?.metadataMs ?? 0,
        }
      : undefined,
  );
  const {
    baseWorkbookMetadata,
    mineWorkbookMetadata,
    metadataMs,
  } = metadataState;
  const diffLines = workbookComparePayload?.diffLines ?? null;
  const workbookDelta = workbookComparePayload?.workbookDelta ?? null;
  const workbookProjection = prepareWorkbookProjection({
    diffLines,
    workbookDelta,
    compareMode: input.compareMode,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
  });
  const contentsEqual = diffLines
    ? await resolveWorkbookContentsEqual(
        {
          path: input.baseLocalPath,
          bytes: input.basePayload.bytes,
          byteLength: input.basePayload.perf.byteLength,
        },
        {
          path: input.mineLocalPath,
          bytes: input.minePayload.bytes,
          byteLength: input.minePayload.perf.byteLength,
        },
      )
    : null;
  const artifactDiff = diffLines
    ? detectWorkbookArtifactOnlyDiffFromEqualityState({
        isWorkbook: true,
        baseByteLength: input.basePayload.perf.byteLength,
        mineByteLength: input.minePayload.perf.byteLength,
        contentsEqual,
        diffLines,
        workbookDelta,
      })
    : null;

  return {
    compareMode: input.compareMode,
    textAnalysis: null,
    workbookAnalysis: {
      diffLinesByMode: {
        [input.compareMode]: diffLines,
      },
      workbookDeltaByMode: {
        [input.compareMode]: workbookDelta,
      },
      sectionsByMode: {
        [input.compareMode]: workbookProjection.sections,
      },
      navigationRegionsByMode: {
        [input.compareMode]: workbookProjection.navigationRegions,
      },
      metadata: {
        base: baseWorkbookMetadata,
        mine: mineWorkbookMetadata,
      },
      artifactDiff,
      perf: {
        metadataMs,
        rustDiffMs: workbookComparePayload?.perf?.rustDiffMs ?? (performance.now() - diffStart),
      },
    },
  };
}

function buildTextSnapshot(input: ResolveAnalysisSnapshotInput): DiffAnalysisSnapshot {
  const analysis = prepareTextDiffAnalysis(
    input.basePayload.content ?? '',
    input.minePayload.content ?? '',
  );
  return {
    compareMode: input.compareMode,
    textAnalysis: analysis,
    workbookAnalysis: null,
  };
}

export async function resolveAnalysisSnapshot(
  input: ResolveAnalysisSnapshotInput,
): Promise<DiffAnalysisSnapshot> {
  const key = buildAnalysisSnapshotCacheKey(input);
  const cached = analysisSnapshotCache.get(key);
  if (cached) {
    return touchAnalysisSnapshot(key, cached);
  }

  const inFlight = analysisSnapshotInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const resolver = (async () => {
    const snapshot = input.isWorkbook
      ? await buildWorkbookSnapshot(input)
      : buildTextSnapshot(input);
    rememberAnalysisSnapshot(key, snapshot);
    return snapshot;
  })();

  analysisSnapshotInFlight.set(key, resolver);
  try {
    return await resolver;
  } finally {
    if (analysisSnapshotInFlight.get(key) === resolver) {
      analysisSnapshotInFlight.delete(key);
    }
  }
}

export function clearAnalysisSnapshotCache() {
  analysisSnapshotCache.clear();
  analysisSnapshotInFlight.clear();
}
