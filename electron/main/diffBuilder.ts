import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { REMOTE_HEAD_ID, SPECIAL_MINE_ID, WORKBOOK_METADATA_CACHE_LIMIT } from './constants.js';
import { rememberLimitedEntry } from './cache.js';
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
import { detectWorkbookArtifactOnlyDiff } from '../workbookArtifactDiff.js';
import type {
  BuildDiffDataOptions,
  CliArgs,
  DiffData,
  ReadFilePayloadOptions,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from './types.js';

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
  const payloadOptions: ReadFilePayloadOptions = isWorkbook
    ? { includeWorkbookText: false, includeWorkbookBytes: true, includeWorkbookMetadata: false }
    : {};

  const pairInfo = createCurrentPairInfo({
    compareContext,
    requestedBaseRevisionId: resolvedBaseRevisionId,
    requestedMineRevisionId: resolvedMineRevisionId,
    revisionOptions,
  });
  const baseRevisionInfo = pairInfo.base;
  const mineRevisionInfo = pairInfo.mine;
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
    ? readRevisionPayload(resolvedBasePayloadInfo, target, resolvedFileName, payloadOptions)
    : readFilePayload(args.basePath, payloadOptions);
  const [basePayload, minePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        resolvedMineRevisionId
          ? readRevisionPayload(resolvedMinePayloadInfo, target, resolvedFileName, payloadOptions)
          : readFilePayload(args.minePath, payloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    resolvedBaseRevisionId ? '' : args.basePath,
    basePayload.bytes,
    resolvedMineRevisionId ? '' : args.minePath,
    minePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const workbookArtifactDiff = detectWorkbookArtifactOnlyDiff({
    isWorkbook,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    diffLines: workbookComparePayload?.diffLines ?? null,
    workbookDelta: workbookComparePayload?.workbookDelta ?? null,
  });

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
  const resolvedFileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const payloadOptions: ReadFilePayloadOptions = isWorkbook
    ? { includeWorkbookText: false, includeWorkbookBytes: true, includeWorkbookMetadata: false }
    : {};
  const [basePayload, minePayload] = await Promise.all([
    readFilePayload(resolvedBasePath, payloadOptions),
    readFilePayload(resolvedMinePath, payloadOptions),
  ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    resolvedBasePath,
    basePayload.bytes,
    resolvedMinePath,
    minePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const workbookArtifactDiff = detectWorkbookArtifactOnlyDiff({
    isWorkbook,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    diffLines: workbookComparePayload?.diffLines ?? null,
    workbookDelta: workbookComparePayload?.workbookDelta ?? null,
  });

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
  const payloadOptions: ReadFilePayloadOptions = {
    includeWorkbookText: false,
    includeWorkbookBytes: true,
    includeWorkbookMetadata: false,
  };
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const basePayloadPromise = baseRevisionId
    ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, payloadOptions)
    : readFilePayload(args.basePath, payloadOptions);
  const [basePayload, minePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        mineRevisionId
          ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
          : readFilePayload(args.minePath, payloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    baseRevisionId ? '' : args.basePath,
    basePayload.bytes,
    mineRevisionId ? '' : args.minePath,
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
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const sameLocalContent = !sameSource
    && usesLocalInputSource(baseRevisionId)
    && usesLocalInputSource(mineRevisionId)
    && await haveSameLocalFileContents(args.basePath, args.minePath);
  const cacheContext = sameSource || sameLocalContent
    ? await getLocalWorkbookPairCacheContext(args.basePath, args.minePath, 'metadata')
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
      : readFilePayload(args.basePath, payloadOptions);
    const [basePayload, minePayload] = (sameSource || sameLocalContent)
      ? await Promise.all([basePayloadPromise, basePayloadPromise])
      : await Promise.all([
          basePayloadPromise,
          mineRevisionId
            ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
            : readFilePayload(args.minePath, payloadOptions),
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
      rememberLimitedEntry(workbookMetadataCache, cacheContext.key, {
        leftMtimeMs: cacheContext.leftMtimeMs,
        rightMtimeMs: cacheContext.rightMtimeMs,
        leftSize: cacheContext.leftSize,
        rightSize: cacheContext.rightSize,
        payload,
      }, WORKBOOK_METADATA_CACHE_LIMIT);
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
