import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  REMOTE_HEAD_ID,
  SPECIAL_BASE_ID,
  SPECIAL_MINE_ID,
  WORKBOOK_METADATA_CACHE_LIMIT,
  WORKBOOK_METADATA_CACHE_MAX_BYTES,
} from './constants.js';
import {
  estimateWorkbookMetadataPayloadMemoryBytes,
  rememberCacheEntry,
} from './cache.js';
import { logDebugTiming, writeExternalDiffDebugLog } from './logger.js';
import { createWorkbookDeltaByMode, createWorkbookDiffLinesByMode } from './rustBridge.js';
import {
  buildInitialPairFromCli,
  buildLaunchDisplayName,
  buildResetPair,
  buildSourceIdentity,
  createCliRevisionInfo,
  createCurrentPairInfo,
  createRequestedRevisionInfo,
  getLatestRemoteRevisionId,
  isRemoteHeadSelectionId,
  isRevisionSelectionId,
  isSameWorkbookSource,
  isWorkbookFile,
  makeSideDisplayName,
  resolveCurrentCompareContext,
  resolveSideName,
  usesLocalInputSource,
} from './svnHelpers.js';
import {
  getActiveCliArgs,
  setActiveCliArgs,
  workbookMetadataCache,
  workbookMetadataInFlight,
} from './state.js';
import {
  detectLocalSvnVersioningStatus,
  haveSameLocalFileAndBytes,
  getLocalWorkbookPairCacheContext,
  getRevisionOptions,
  haveSameLocalFileContents,
  resolveSvnTarget,
  resolveTimelineTargetUrl,
  resolveWorkingCopyPathForTarget,
} from './svnOperations.js';
import {
  readFilePayload,
  readRevisionPayload,
  resolveWorkbookCompareModePayload,
} from './filePayload.js';
import { detectWorkbookArtifactOnlyDiffFromEqualityState } from '../workbookArtifactDiff.js';
import type {
  BuildDiffDataOptions,
  CliArgs,
  DiffData,
  FilePayload,
  ReadFilePayloadOptions,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from './types.js';
function createWorkbookPayloadOptions(
  isWorkbook: boolean,
  includeWorkbookBytes: boolean,
): ReadFilePayloadOptions {
  return isWorkbook
    ? {
        includeWorkbookText: false,
        includeWorkbookBytes,
        includeWorkbookMetadata: false,
      }
    : {};
}

function resolveLocalWorkbookSourcePath(
  side: 'base' | 'mine',
  revisionId: string | undefined,
  args: CliArgs,
  workingCopyPath: string,
): string {
  if (!revisionId) {
    return side === 'base' ? args.basePath : args.minePath;
  }
  if (revisionId === SPECIAL_BASE_ID) {
    return args.basePath;
  }
  if (revisionId === SPECIAL_MINE_ID) {
    return workingCopyPath || args.minePath;
  }
  return '';
}

function haveInlineWorkbookPayload(payload: FilePayload): boolean {
  return payload.content != null || payload.bytes != null;
}

async function ensureWorkbookFallbackPayload(
  payload: FilePayload,
  revisionId: string | undefined,
  revisionInfo: ReturnType<typeof createRequestedRevisionInfo>,
  target: string,
  fileName: string,
  localPath: string,
): Promise<FilePayload> {
  if (haveInlineWorkbookPayload(payload)) {
    return payload;
  }

  const fallbackOptions = createWorkbookPayloadOptions(true, true);
  return revisionId
    ? readRevisionPayload(revisionInfo, target, fileName, fallbackOptions)
    : readFilePayload(localPath, fallbackOptions);
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

async function detectWorkbookArtifactDiff(
  isWorkbook: boolean,
  diffLines: WorkbookCompareModePayload['diffLines'],
  workbookDelta: WorkbookCompareModePayload['workbookDelta'],
  baseSource: { path: string; bytes: Uint8Array | null; byteLength: number },
  mineSource: { path: string; bytes: Uint8Array | null; byteLength: number },
) {
  if (!isWorkbook || !diffLines) {
    return null;
  }

  const contentsEqual = await resolveWorkbookContentsEqual(baseSource, mineSource);
  return detectWorkbookArtifactOnlyDiffFromEqualityState({
    isWorkbook,
    baseByteLength: baseSource.byteLength,
    mineByteLength: mineSource.byteLength,
    contentsEqual,
    diffLines,
    workbookDelta,
  });
}

// ---------------------------------------------------------------------------
// buildDiffData — main entry point for producing DiffData
// ---------------------------------------------------------------------------

export async function buildDiffData(options: BuildDiffDataOptions = {}): Promise<DiffData> {
  const buildStart = performance.now();
  const {
    baseRevisionId,
    mineRevisionId,
    workbookCompareMode = 'strict',
    includeRevisionOptions = false,
    revisionOptionsOverride = null,
  } = options;
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const timelineTargetUrl = await resolveTimelineTargetUrl();
  const workingCopyPath = target
    ? await resolveWorkingCopyPathForTarget(args, target)
    : '';
  const workingCopyAvailable = Boolean(workingCopyPath);
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const shouldLoadRevisionOptions = Boolean(includeRevisionOptions || baseRevisionId || mineRevisionId);
  const revisionOptions = shouldLoadRevisionOptions
    ? (revisionOptionsOverride ?? await getRevisionOptions())
    : null;
  const latestRemoteRevisionId = getLatestRemoteRevisionId(revisionOptions);
  const resolvedBaseRevisionId = isRemoteHeadSelectionId(baseRevisionId)
    ? (latestRemoteRevisionId ?? undefined)
    : baseRevisionId;
  const resolvedMineRevisionId = isRemoteHeadSelectionId(mineRevisionId)
    ? (latestRemoteRevisionId ?? undefined)
    : mineRevisionId;
  const isLaunchView = !resolvedBaseRevisionId && !resolvedMineRevisionId;
  const compareContext = resolveCurrentCompareContext({
    target,
    workingCopyAvailable,
    requestedBaseRevisionId: resolvedBaseRevisionId,
    requestedMineRevisionId: resolvedMineRevisionId,
    args,
  });
  const initialPair = buildInitialPairFromCli(compareContext);
  const resetPair = buildResetPair(compareContext, initialPair, workingCopyAvailable);
  const isWorkbook = isWorkbookFile(resolvedFileName);

  const pairInfo = createCurrentPairInfo({
    compareContext,
    requestedBaseRevisionId: resolvedBaseRevisionId,
    requestedMineRevisionId: resolvedMineRevisionId,
    revisionOptions,
  });
  const baseRevisionInfo = pairInfo.base;
  const mineRevisionInfo = pairInfo.mine;
  const basePayloadOptions = createWorkbookPayloadOptions(
    isWorkbook,
    !usesLocalInputSource(resolvedBaseRevisionId),
  );
  const minePayloadOptions = createWorkbookPayloadOptions(
    isWorkbook,
    !usesLocalInputSource(resolvedMineRevisionId),
  );
  const baseLocalPath = resolveLocalWorkbookSourcePath('base', resolvedBaseRevisionId, args, workingCopyPath);
  const mineLocalPath = resolveLocalWorkbookSourcePath('mine', resolvedMineRevisionId, args, workingCopyPath);
  const sameSource = isSameWorkbookSource(args, resolvedBaseRevisionId, resolvedMineRevisionId);
  const sourceIdentity = buildSourceIdentity({
    kind: resolvedBaseRevisionId || resolvedMineRevisionId ? 'revision-switch' : 'cli',
    fileName: resolvedFileName,
    baseUrl: isRevisionSelectionId(resolvedBaseRevisionId) ? target : args.baseUrl,
    mineUrl: isRevisionSelectionId(resolvedMineRevisionId) ? target : args.mineUrl,
    baseRevision: resolvedBaseRevisionId ?? args.baseRevision,
    mineRevision: resolvedMineRevisionId ?? args.mineRevision,
    pegRevision: args.pegRevision,
    basePath: resolvedBaseRevisionId ? '' : args.basePath,
    minePath: resolvedMineRevisionId ? '' : args.minePath,
    baseName: args.baseName,
    mineName: args.mineName,
  });
  const launchBaseName = buildLaunchDisplayName(resolvedFileName, args.baseName, args.basePath);
  const launchMineName = buildLaunchDisplayName(resolvedFileName, args.mineName, args.minePath);
  const displayBaseName = isLaunchView
    ? launchBaseName
    : makeSideDisplayName(
        resolvedFileName,
        baseRevisionInfo ?? createCliRevisionInfo('base') ?? createRequestedRevisionInfo('base', resolvedBaseRevisionId),
        resolveSideName(args.baseName, args.basePath),
      );
  const displayMineName = isLaunchView
    ? launchMineName
    : makeSideDisplayName(
        resolvedFileName,
        mineRevisionInfo ?? createCliRevisionInfo('mine') ?? createRequestedRevisionInfo('mine', resolvedMineRevisionId),
        resolveSideName(args.mineName, args.minePath),
      );

  writeExternalDiffDebugLog('build-diff-data:start', {
    requestedBaseRevisionId: resolvedBaseRevisionId ?? null,
    requestedMineRevisionId: resolvedMineRevisionId ?? null,
    compareMode: workbookCompareMode,
    fileName: resolvedFileName,
    target,
    timelineTargetUrl,
    workingCopyAvailable,
    compareContext,
    sameSource,
    initialPair,
    resetPair,
    activeCliArgs: args,
    resolvedBaseRevisionInfo: baseRevisionInfo,
    resolvedMineRevisionInfo: mineRevisionInfo,
  });

  const resolvedBasePayloadInfo = baseRevisionInfo ?? createRequestedRevisionInfo('base', resolvedBaseRevisionId);
  const resolvedMinePayloadInfo = mineRevisionInfo ?? createRequestedRevisionInfo('mine', resolvedMineRevisionId);

  const basePayloadPromise = resolvedBaseRevisionId
    ? readRevisionPayload(resolvedBasePayloadInfo, target, resolvedFileName, basePayloadOptions)
    : readFilePayload(baseLocalPath, basePayloadOptions);
  const [initialBasePayload, initialMinePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        resolvedMineRevisionId
          ? readRevisionPayload(resolvedMinePayloadInfo, target, resolvedFileName, minePayloadOptions)
          : readFilePayload(mineLocalPath, minePayloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    baseLocalPath,
    initialBasePayload.bytes,
    mineLocalPath,
    initialMinePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const [basePayload, minePayload] = hasPrecomputedWorkbookDiff || !isWorkbook
    ? [initialBasePayload, initialMinePayload]
    : sameSource
      ? await (() => {
          const baseFallbackPayloadPromise = ensureWorkbookFallbackPayload(
            initialBasePayload,
            resolvedBaseRevisionId,
            resolvedBasePayloadInfo,
            target,
            resolvedFileName,
            baseLocalPath,
          );
          return Promise.all([
            baseFallbackPayloadPromise,
            baseFallbackPayloadPromise,
          ]);
        })()
      : await Promise.all([
          ensureWorkbookFallbackPayload(
            initialBasePayload,
            resolvedBaseRevisionId,
            resolvedBasePayloadInfo,
            target,
            resolvedFileName,
            baseLocalPath,
          ),
          ensureWorkbookFallbackPayload(
            initialMinePayload,
            resolvedMineRevisionId,
            resolvedMinePayloadInfo,
            target,
            resolvedFileName,
            mineLocalPath,
          ),
        ]);
  const workbookArtifactDiff = await detectWorkbookArtifactDiff(
    isWorkbook,
    workbookComparePayload?.diffLines ?? null,
    workbookComparePayload?.workbookDelta ?? null,
    {
      path: baseLocalPath,
      bytes: hasPrecomputedWorkbookDiff ? initialBasePayload.bytes : basePayload.bytes,
      byteLength: basePayload.perf.byteLength,
    },
    {
      path: mineLocalPath,
      bytes: hasPrecomputedWorkbookDiff ? initialMinePayload.bytes : minePayload.bytes,
      byteLength: minePayload.perf.byteLength,
    },
  );

  logDebugTiming('build-diff-data:done', {
    compareMode: workbookCompareMode,
    baseRevisionId: resolvedBaseRevisionId ?? null,
    mineRevisionId: resolvedMineRevisionId ?? null,
    includeRevisionOptions: shouldLoadRevisionOptions,
    isWorkbook,
    hasPrecomputedWorkbookDiff,
    durationMs: Number((performance.now() - buildStart).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    baseParserMs: Number((basePayload.perf.parserMs ?? 0).toFixed(1)),
    mineParserMs: Number((minePayload.perf.parserMs ?? 0).toFixed(1)),
    metadataMs: Number(((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0)).toFixed(1)),
    rustDiffMs: Number((workbookComparePayload?.perf?.rustDiffMs ?? 0).toFixed(1)),
  });
  writeExternalDiffDebugLog('build-diff-data:done', {
    requestedBaseRevisionId: resolvedBaseRevisionId ?? null,
    requestedMineRevisionId: resolvedMineRevisionId ?? null,
    compareMode: workbookCompareMode,
    fileName: resolvedFileName,
    target,
    timelineTargetUrl,
    sameSource,
    compareContext,
    workingCopyAvailable,
    canSwitchRevisions: compareContext !== 'literal_two_file_compare' && Boolean(timelineTargetUrl),
    initialPair,
    resetPair,
    workingCopyPath,
    sourceIdentity,
    resolvedBaseRevisionInfo: baseRevisionInfo,
    resolvedMineRevisionInfo: mineRevisionInfo,
    baseDisplayName: displayBaseName,
    mineDisplayName: displayMineName,
  });

  return {
    svnUrl: target,
    fileName: resolvedFileName,
    sourceIdentity,
    compareContext,
    timelineTargetUrl,
    workingCopyAvailable,
    initialPair,
    resetPair,
    launchBaseName,
    launchMineName,
    baseName: displayBaseName,
    mineName: displayMineName,
    baseContent: hasPrecomputedWorkbookDiff ? null : basePayload.content,
    mineContent: hasPrecomputedWorkbookDiff ? null : minePayload.content,
    baseBytes: hasPrecomputedWorkbookDiff ? null : basePayload.bytes,
    mineBytes: hasPrecomputedWorkbookDiff ? null : minePayload.bytes,
    precomputedDiffLines: workbookCompareMode === 'strict' ? (workbookComparePayload?.diffLines ?? null) : null,
    precomputedWorkbookDelta: workbookCompareMode === 'strict' ? (workbookComparePayload?.workbookDelta ?? null) : null,
    precomputedDiffLinesByMode: createWorkbookDiffLinesByMode(workbookCompareMode, workbookComparePayload?.diffLines ?? null),
    precomputedWorkbookDeltaByMode: createWorkbookDeltaByMode(workbookCompareMode, workbookComparePayload?.workbookDelta ?? null),
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions,
    baseRevisionInfo,
    mineRevisionInfo,
    canSwitchRevisions: compareContext !== 'literal_two_file_compare' && Boolean(timelineTargetUrl),
    workbookArtifactDiff,
    sourceNoticeCode: null,
    perf: {
      source: resolvedBaseRevisionId || resolvedMineRevisionId ? 'revision-switch' : 'cli',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: workbookComparePayload?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

// ---------------------------------------------------------------------------
// Dev / local diff builders
// ---------------------------------------------------------------------------

function buildDevWorkingCopyCliArgs(filePath: string): CliArgs {
  const resolvedPath = filePath.trim();
  const fileName = path.basename(resolvedPath);

  return {
    basePath: resolvedPath,
    minePath: resolvedPath,
    baseName: fileName,
    mineName: fileName,
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName,
  };
}

function buildLocalDiffCliArgs(basePath: string, minePath: string): CliArgs {
  const resolvedBasePath = basePath.trim();
  const resolvedMinePath = minePath.trim();
  const fileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');

  return {
    basePath: resolvedBasePath,
    minePath: resolvedMinePath,
    baseName: path.basename(resolvedBasePath || fileName),
    mineName: path.basename(resolvedMinePath || fileName),
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName,
  };
}

export async function buildDevWorkingCopyDiffData(
  filePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const resolvedPath = filePath.trim();
  if (!resolvedPath) {
    throw new Error('Missing working copy path');
  }

  setActiveCliArgs(buildDevWorkingCopyCliArgs(resolvedPath));
  const versioningStatus = await detectLocalSvnVersioningStatus(resolvedPath);
  const data = await buildDiffData({
    baseRevisionId: versioningStatus === 'versioned' ? REMOTE_HEAD_ID : undefined,
    mineRevisionId: versioningStatus === 'versioned' ? SPECIAL_MINE_ID : undefined,
    workbookCompareMode,
  });

  return {
    ...data,
    sourceNoticeCode: versioningStatus === 'unversioned' ? 'unversioned-working-copy' : null,
    perf: data.perf
      ? { ...data.perf, source: 'local-dev' }
      : { source: 'local-dev' },
  };
}

export async function buildLocalDiffData(
  basePath: string,
  minePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const buildStart = performance.now();
  const resolvedBasePath = basePath.trim();
  const resolvedMinePath = minePath.trim();
  setActiveCliArgs(buildLocalDiffCliArgs(resolvedBasePath, resolvedMinePath));
  const resolvedFileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const payloadOptions = createWorkbookPayloadOptions(isWorkbook, false);
  const [initialBasePayload, initialMinePayload] = await Promise.all([
    readFilePayload(resolvedBasePath, payloadOptions),
    readFilePayload(resolvedMinePath, payloadOptions),
  ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    resolvedBasePath,
    initialBasePayload.bytes,
    resolvedMinePath,
    initialMinePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const [basePayload, minePayload] = hasPrecomputedWorkbookDiff || !isWorkbook
    ? [initialBasePayload, initialMinePayload]
    : await Promise.all([
        ensureWorkbookFallbackPayload(
          initialBasePayload,
          undefined,
          createRequestedRevisionInfo('base', undefined),
          '',
          resolvedFileName,
          resolvedBasePath,
        ),
        ensureWorkbookFallbackPayload(
          initialMinePayload,
          undefined,
          createRequestedRevisionInfo('mine', undefined),
          '',
          resolvedFileName,
          resolvedMinePath,
        ),
      ]);
  const workbookArtifactDiff = await detectWorkbookArtifactDiff(
    isWorkbook,
    workbookComparePayload?.diffLines ?? null,
    workbookComparePayload?.workbookDelta ?? null,
    {
      path: resolvedBasePath,
      bytes: hasPrecomputedWorkbookDiff ? initialBasePayload.bytes : basePayload.bytes,
      byteLength: basePayload.perf.byteLength,
    },
    {
      path: resolvedMinePath,
      bytes: hasPrecomputedWorkbookDiff ? initialMinePayload.bytes : minePayload.bytes,
      byteLength: minePayload.perf.byteLength,
    },
  );

  return {
    svnUrl: '',
    fileName: resolvedFileName,
    sourceIdentity: buildSourceIdentity({
      kind: 'local-dev',
      fileName: resolvedFileName,
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      basePath: resolvedBasePath,
      minePath: resolvedMinePath,
      baseName: resolvedBasePath,
      mineName: resolvedMinePath,
    }),
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: false,
    initialPair: null,
    resetPair: null,
    launchBaseName: resolveSideName('', resolvedBasePath),
    launchMineName: resolveSideName('', resolvedMinePath),
    baseName: resolveSideName('', resolvedBasePath),
    mineName: resolveSideName('', resolvedMinePath),
    baseContent: hasPrecomputedWorkbookDiff ? null : basePayload.content,
    mineContent: hasPrecomputedWorkbookDiff ? null : minePayload.content,
    baseBytes: hasPrecomputedWorkbookDiff ? null : basePayload.bytes,
    mineBytes: hasPrecomputedWorkbookDiff ? null : minePayload.bytes,
    precomputedDiffLines: workbookCompareMode === 'strict' ? (workbookComparePayload?.diffLines ?? null) : null,
    precomputedWorkbookDelta: workbookCompareMode === 'strict' ? (workbookComparePayload?.workbookDelta ?? null) : null,
    precomputedDiffLinesByMode: createWorkbookDiffLinesByMode(workbookCompareMode, workbookComparePayload?.diffLines ?? null),
    precomputedWorkbookDeltaByMode: createWorkbookDeltaByMode(workbookCompareMode, workbookComparePayload?.workbookDelta ?? null),
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff,
    sourceNoticeCode: null,
    perf: {
      source: 'local-dev',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: workbookComparePayload?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

// ---------------------------------------------------------------------------
// Workbook compare mode & metadata loaders
// ---------------------------------------------------------------------------

export async function loadWorkbookCompareModeData(
  compareMode: WorkbookCompareMode,
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookCompareModePayload> {
  const start = performance.now();
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');

  const baseRevisionInfo = createRequestedRevisionInfo('base', baseRevisionId);
  const mineRevisionInfo = createRequestedRevisionInfo('mine', mineRevisionId);
  const workingCopyPath = baseRevisionId === SPECIAL_MINE_ID || mineRevisionId === SPECIAL_MINE_ID
    ? await resolveWorkingCopyPathForTarget(args, target)
    : '';
  const basePayloadOptions = createWorkbookPayloadOptions(
    true,
    !usesLocalInputSource(baseRevisionId),
  );
  const minePayloadOptions = createWorkbookPayloadOptions(
    true,
    !usesLocalInputSource(mineRevisionId),
  );
  const baseLocalPath = resolveLocalWorkbookSourcePath('base', baseRevisionId, args, workingCopyPath);
  const mineLocalPath = resolveLocalWorkbookSourcePath('mine', mineRevisionId, args, workingCopyPath);
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const basePayloadPromise = baseRevisionId
    ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, basePayloadOptions)
    : readFilePayload(baseLocalPath, basePayloadOptions);
  const [basePayload, minePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        mineRevisionId
          ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, minePayloadOptions)
          : readFilePayload(mineLocalPath, minePayloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    baseLocalPath,
    basePayload.bytes,
    mineLocalPath,
    minePayload.bytes,
    resolvedFileName,
    compareMode,
  );

  logDebugTiming('load-workbook-compare-mode:done', {
    compareMode,
    baseRevisionId: baseRevisionId ?? null,
    mineRevisionId: mineRevisionId ?? null,
    durationMs: Number((performance.now() - start).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    metadataMs: Number(((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0)).toFixed(1)),
    rustDiffMs: Number((workbookComparePayload?.perf?.rustDiffMs ?? 0).toFixed(1)),
  });

  return workbookComparePayload ?? {
    compareMode,
    diffLines: null,
    workbookDelta: null,
    perf: null,
  };
}

export async function loadWorkbookMetadataData(
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookMetadataPayload> {
  const start = performance.now();
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const payloadOptions: ReadFilePayloadOptions = {
    includeWorkbookText: false,
    includeWorkbookBytes: false,
    includeWorkbookMetadata: true,
  };
  const baseRevisionInfo = createRequestedRevisionInfo('base', baseRevisionId);
  const mineRevisionInfo = createRequestedRevisionInfo('mine', mineRevisionId);
  const workingCopyPath = baseRevisionId === SPECIAL_MINE_ID || mineRevisionId === SPECIAL_MINE_ID
    ? await resolveWorkingCopyPathForTarget(args, target)
    : '';
  const baseLocalPath = resolveLocalWorkbookSourcePath('base', baseRevisionId, args, workingCopyPath);
  const mineLocalPath = resolveLocalWorkbookSourcePath('mine', mineRevisionId, args, workingCopyPath);
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const sameLocalContent = !sameSource
    && usesLocalInputSource(baseRevisionId)
    && usesLocalInputSource(mineRevisionId)
    && await haveSameLocalFileContents(baseLocalPath, mineLocalPath);
  const cacheContext = sameSource || sameLocalContent
    ? await getLocalWorkbookPairCacheContext(baseLocalPath, mineLocalPath, 'metadata')
    : null;
  if (cacheContext) {
    const cached = workbookMetadataCache.get(cacheContext.key);
    if (
      cached
      && cached.leftMtimeMs === cacheContext.leftMtimeMs
      && cached.rightMtimeMs === cacheContext.rightMtimeMs
      && cached.leftSize === cacheContext.leftSize
      && cached.rightSize === cacheContext.rightSize
    ) {
      logDebugTiming('workbook-metadata-cache:memory-hit', {
        fileName: resolvedFileName,
      });
      return cached.payload;
    }
    const inFlight = workbookMetadataInFlight.get(cacheContext.key);
    if (inFlight) {
      return inFlight;
    }
  }

  const resolver = (async (): Promise<WorkbookMetadataPayload> => {
    const basePayloadPromise = baseRevisionId
      ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, payloadOptions)
      : readFilePayload(baseLocalPath, payloadOptions);
    const [basePayload, minePayload] = (sameSource || sameLocalContent)
      ? await Promise.all([basePayloadPromise, basePayloadPromise])
      : await Promise.all([
          basePayloadPromise,
          mineRevisionId
            ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
            : readFilePayload(mineLocalPath, payloadOptions),
        ]);
    const metadataMs = (basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0);

    logDebugTiming('load-workbook-metadata:done', {
      baseRevisionId: baseRevisionId ?? null,
      mineRevisionId: mineRevisionId ?? null,
      sameLocalContent,
      durationMs: Number((performance.now() - start).toFixed(1)),
      metadataMs: Number(metadataMs.toFixed(1)),
    });

    const payload: WorkbookMetadataPayload = {
      base: basePayload.metadata,
      mine: minePayload.metadata,
      perf: { metadataMs },
    };
    if (cacheContext) {
      rememberCacheEntry(workbookMetadataCache, cacheContext.key, {
        leftMtimeMs: cacheContext.leftMtimeMs,
        rightMtimeMs: cacheContext.rightMtimeMs,
        leftSize: cacheContext.leftSize,
        rightSize: cacheContext.rightSize,
        payload,
        memoryBytes: estimateWorkbookMetadataPayloadMemoryBytes(payload),
      }, WORKBOOK_METADATA_CACHE_LIMIT, WORKBOOK_METADATA_CACHE_MAX_BYTES);
    }
    return payload;
  })();

  if (cacheContext) {
    workbookMetadataInFlight.set(cacheContext.key, resolver);
    try {
      return await resolver;
    } finally {
      workbookMetadataInFlight.delete(cacheContext.key);
    }
  }
  return resolver;
}
