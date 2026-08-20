import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  REMOTE_HEAD_ID,
  SPECIAL_BASE_ID,
  SPECIAL_MINE_ID,
} from './constants.js';
import {
  getInFlightAnalysisSnapshot,
  peekAnalysisSnapshot,
  peekWorkbookAnalysisSnapshot,
  resolveAnalysisSnapshot,
} from './analysisSnapshotService.js';
import { logDebugTiming, writeExternalDiffDebugLog } from './logger.js';
import {
  buildInitialPairFromCli,
  buildLaunchDisplayName,
  buildResetPair,
  buildSourceIdentity,
  createCliRevisionInfo,
  createCurrentPairInfo,
  createRequestedRevisionInfo,
  getLatestRemoteRevisionId,
  isRemoteRepositoryTarget,
  isRemoteHeadSelectionId,
  isRevisionSelectionId,
  isSameWorkbookSource,
  isWorkbookFile,
  makeSideDisplayName,
  resolveCliSourceIdentityKind,
  resolveCurrentCompareContext,
  resolveSideName,
  shouldResolveSvnRuntimeContext,
  usesLocalInputSource,
} from './svnHelpers.js';
import {
  getActiveCliArgs,
  setActiveCliArgs,
} from './state.js';
import {
  detectLocalSvnVersioningStatus,
  getRevisionOptions,
  queryRevisionOptionsForTarget,
  resolveLocalSvnUrl,
  resolveSvnTarget,
  resolveTimelineTargetUrl,
  resolveWorkingCopyPathForTarget,
} from './svnOperations.js';
import {
  readFilePayload,
  readRevisionPayload,
  resolveWorkbookMetadataPairPayload,
} from './filePayload.js';
import type {
  BuildDiffDataOptions,
  CliArgs,
  DiffData,
  FilePayload,
  ReadFilePayloadOptions,
  SvnRevisionInfo,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from './types.js';

interface WorkbookRequestContext {
  args: CliArgs;
  target: string;
  resolvedFileName: string;
  sourceIdentity: string;
  baseRevisionId: string | undefined;
  mineRevisionId: string | undefined;
  baseSourceInfo: SvnRevisionInfo;
  mineSourceInfo: SvnRevisionInfo;
  workingCopyPath: string;
  baseTarget: string;
  mineTarget: string;
  baseLocalPath: string;
  mineLocalPath: string;
  sameSource: boolean;
}

const EMPTY_FILE_PAYLOAD: FilePayload = {
  content: null,
  bytes: null,
  metadata: null,
  perf: {
    readMs: 0,
    parserMs: 0,
    metadataMs: 0,
    byteLength: 0,
  },
};
const WORKBOOK_ALTERNATE_SNAPSHOT_WARMUP_DELAY_MS = 2_000;

function createWorkbookPayloadOptions(
  isWorkbook: boolean,
  includeWorkbookBytes: boolean,
): ReadFilePayloadOptions {
  return isWorkbook
    ? {
        includeWorkbookText: false,
        includeWorkbookBytes,
        includeWorkbookMetadata: true,
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

function createWorkbookRequestContext(params: {
  args: CliArgs;
  target: string;
  resolvedFileName: string;
  baseRevisionId: string | undefined;
  mineRevisionId: string | undefined;
  baseSourceInfo: SvnRevisionInfo;
  mineSourceInfo: SvnRevisionInfo;
  workingCopyPath: string;
  baseTarget?: string;
  mineTarget?: string;
  sourceIdentityKind?: 'cli' | 'revision-switch' | 'local-dev';
}): WorkbookRequestContext {
  const {
    args,
    target,
    resolvedFileName,
    baseRevisionId,
    mineRevisionId,
    baseSourceInfo,
    mineSourceInfo,
    workingCopyPath,
    baseTarget = target,
    mineTarget = target,
    sourceIdentityKind = resolveCliSourceIdentityKind(baseRevisionId, mineRevisionId),
  } = params;

  return {
    args,
    target,
    resolvedFileName,
    sourceIdentity: buildSourceIdentity({
      kind: sourceIdentityKind,
      fileName: resolvedFileName,
      baseUrl: isRevisionSelectionId(baseRevisionId) ? baseTarget : args.baseUrl,
      mineUrl: isRevisionSelectionId(mineRevisionId) ? mineTarget : args.mineUrl,
      baseRevision: baseRevisionId ?? args.baseRevision,
      mineRevision: mineRevisionId ?? args.mineRevision,
      pegRevision: args.pegRevision,
      basePath: baseRevisionId ? '' : args.basePath,
      minePath: mineRevisionId ? '' : args.minePath,
      baseName: args.baseName,
      mineName: args.mineName,
    }),
    baseRevisionId,
    mineRevisionId,
    baseSourceInfo,
    mineSourceInfo,
    workingCopyPath,
    baseTarget,
    mineTarget,
    baseLocalPath: resolveLocalWorkbookSourcePath('base', baseRevisionId, args, workingCopyPath),
    mineLocalPath: resolveLocalWorkbookSourcePath('mine', mineRevisionId, args, workingCopyPath),
    sameSource: baseTarget.trim() === mineTarget.trim()
      && isSameWorkbookSource(args, baseRevisionId, mineRevisionId),
  };
}

async function resolveWorkbookRequestContext(
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookRequestContext> {
  const args = getActiveCliArgs();
  const sourceIdentityKind = resolveCliSourceIdentityKind(baseRevisionId, mineRevisionId);
  const shouldResolveSvnContext = shouldResolveSvnRuntimeContext(baseRevisionId, mineRevisionId);
  const target = shouldResolveSvnContext
    ? await resolveSvnTarget()
    : '';
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const workingCopyPath = shouldResolveSvnContext
    && (baseRevisionId === SPECIAL_MINE_ID || mineRevisionId === SPECIAL_MINE_ID)
    ? await resolveWorkingCopyPathForTarget(args, target)
    : '';
  const hasIndependentRevisionTargets = Boolean(
    baseRevisionId
    && mineRevisionId
    && isRemoteRepositoryTarget(args.baseUrl)
    && isRemoteRepositoryTarget(args.mineUrl)
    && args.basePath.trim()
    && args.minePath.trim()
    && args.basePath.trim() !== args.minePath.trim()
  );

  return createWorkbookRequestContext({
    args,
    target,
    resolvedFileName,
    baseRevisionId,
    mineRevisionId,
    baseSourceInfo: createRequestedRevisionInfo('base', baseRevisionId),
    mineSourceInfo: createRequestedRevisionInfo('mine', mineRevisionId),
    workingCopyPath,
    baseTarget: hasIndependentRevisionTargets ? args.baseUrl : target,
    mineTarget: hasIndependentRevisionTargets ? args.mineUrl : target,
    sourceIdentityKind,
  });
}

function buildAnalysisSnapshotLookup(
  context: WorkbookRequestContext,
  compareMode: WorkbookCompareMode,
) {
  return {
    sourceIdentity: context.sourceIdentity,
    compareMode,
    baseRevisionId: context.baseRevisionId,
    mineRevisionId: context.mineRevisionId,
  };
}

function canResolveWorkbookAnalysisDirectlyFromLocalFiles(
  context: WorkbookRequestContext,
): boolean {
  return Boolean(context.baseLocalPath && context.mineLocalPath);
}

async function resolveWorkbookPayloadPair(
  context: WorkbookRequestContext,
  payloadOptions?: {
    base?: ReadFilePayloadOptions;
    mine?: ReadFilePayloadOptions;
  },
): Promise<{ basePayload: FilePayload; minePayload: FilePayload }> {
  const basePayloadOptions = payloadOptions?.base
    ?? createWorkbookPayloadOptions(true, !usesLocalInputSource(context.baseRevisionId));
  const minePayloadOptions = payloadOptions?.mine
    ?? createWorkbookPayloadOptions(true, !usesLocalInputSource(context.mineRevisionId));
  const basePayloadPromise = context.baseRevisionId
    ? readRevisionPayload(context.baseSourceInfo, context.baseTarget, context.resolvedFileName, basePayloadOptions)
    : readFilePayload(context.baseLocalPath, basePayloadOptions);
  const [basePayload, minePayload] = context.sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        context.mineRevisionId
          ? readRevisionPayload(context.mineSourceInfo, context.mineTarget, context.resolvedFileName, minePayloadOptions)
          : readFilePayload(context.mineLocalPath, minePayloadOptions),
      ]);

  return {
    basePayload,
    minePayload,
  };
}

async function resolveWorkbookAnalysisBundle(
  context: WorkbookRequestContext,
  compareMode: WorkbookCompareMode,
): Promise<{
  analysisSnapshot: Awaited<ReturnType<typeof resolveAnalysisSnapshot>>;
  basePayload: FilePayload;
  minePayload: FilePayload;
  cacheStatus: 'hit' | 'miss';
}> {
  const lookup = buildAnalysisSnapshotLookup(context, compareMode);
  const cachedSnapshot = peekAnalysisSnapshot(lookup);
  if (cachedSnapshot?.workbookAnalysis?.diffLinesByMode[compareMode]) {
    return {
      analysisSnapshot: cachedSnapshot,
      basePayload: EMPTY_FILE_PAYLOAD,
      minePayload: EMPTY_FILE_PAYLOAD,
      cacheStatus: 'hit',
    };
  }

  const inFlightSnapshot = getInFlightAnalysisSnapshot(lookup);
  if (inFlightSnapshot) {
    const awaitedSnapshot = await inFlightSnapshot;
    if (awaitedSnapshot.workbookAnalysis?.diffLinesByMode[compareMode]) {
      return {
        analysisSnapshot: awaitedSnapshot,
        basePayload: EMPTY_FILE_PAYLOAD,
        minePayload: EMPTY_FILE_PAYLOAD,
        cacheStatus: 'hit',
      };
    }
  }

  if (canResolveWorkbookAnalysisDirectlyFromLocalFiles(context)) {
    return {
      analysisSnapshot: await resolveAnalysisSnapshot({
        ...lookup,
        fileName: context.resolvedFileName,
        isWorkbook: true,
        basePayload: EMPTY_FILE_PAYLOAD,
        minePayload: EMPTY_FILE_PAYLOAD,
        baseLocalPath: context.baseLocalPath,
        mineLocalPath: context.mineLocalPath,
      }),
      basePayload: EMPTY_FILE_PAYLOAD,
      minePayload: EMPTY_FILE_PAYLOAD,
      cacheStatus: 'miss',
    };
  }

  const { basePayload, minePayload } = await resolveWorkbookPayloadPair(context);
  return {
    analysisSnapshot: await resolveAnalysisSnapshot({
      ...lookup,
      fileName: context.resolvedFileName,
      isWorkbook: true,
      basePayload,
      minePayload,
      baseLocalPath: context.baseLocalPath,
      mineLocalPath: context.mineLocalPath,
    }),
    basePayload,
    minePayload,
    cacheStatus: 'miss',
  };
}

function getAlternateWorkbookCompareMode(compareMode: WorkbookCompareMode): WorkbookCompareMode {
  return compareMode === 'strict' ? 'content' : 'strict';
}

function canReuseWorkbookPayloadHints(
  context: WorkbookRequestContext,
  payload: FilePayload,
  side: 'base' | 'mine',
): boolean {
  if (haveInlineWorkbookPayload(payload)) {
    return true;
  }
  const localPath = side === 'base'
    ? context.baseLocalPath
    : context.mineLocalPath;
  return Boolean(localPath);
}

async function warmWorkbookAnalysisSnapshot(
  context: WorkbookRequestContext,
  compareMode: WorkbookCompareMode,
  payloadHints?: {
    basePayload?: FilePayload;
    minePayload?: FilePayload;
  },
): Promise<'cache-hit' | 'in-flight' | 'warmed'> {
  const lookup = buildAnalysisSnapshotLookup(context, compareMode);
  const cachedSnapshot = peekAnalysisSnapshot(lookup);
  if (cachedSnapshot?.workbookAnalysis?.diffLinesByMode[compareMode]) {
    return 'cache-hit';
  }

  const inFlightSnapshot = getInFlightAnalysisSnapshot(lookup);
  if (inFlightSnapshot) {
    return 'in-flight';
  }

  const hintedBasePayload = payloadHints?.basePayload ?? EMPTY_FILE_PAYLOAD;
  const hintedMinePayload = payloadHints?.minePayload ?? EMPTY_FILE_PAYLOAD;
  const shouldReuseHints = canReuseWorkbookPayloadHints(context, hintedBasePayload, 'base')
    && canReuseWorkbookPayloadHints(context, hintedMinePayload, 'mine');
  if (!shouldReuseHints && canResolveWorkbookAnalysisDirectlyFromLocalFiles(context)) {
    await resolveAnalysisSnapshot({
      ...lookup,
      fileName: context.resolvedFileName,
      isWorkbook: true,
      basePayload: EMPTY_FILE_PAYLOAD,
      minePayload: EMPTY_FILE_PAYLOAD,
      baseLocalPath: context.baseLocalPath,
      mineLocalPath: context.mineLocalPath,
    });
    return 'warmed';
  }
  const { basePayload, minePayload } = shouldReuseHints
    ? {
        basePayload: hintedBasePayload,
        minePayload: hintedMinePayload,
      }
    : await resolveWorkbookPayloadPair(context);

  await resolveAnalysisSnapshot({
    ...lookup,
    fileName: context.resolvedFileName,
    isWorkbook: true,
    basePayload,
    minePayload,
    baseLocalPath: context.baseLocalPath,
    mineLocalPath: context.mineLocalPath,
  });
  return 'warmed';
}

function scheduleWorkbookAlternateSnapshotWarmup(
  context: WorkbookRequestContext | null,
  currentMode: WorkbookCompareMode,
  payloadHints?: {
    basePayload?: FilePayload;
    minePayload?: FilePayload;
  },
): void {
  if (!context) return;

  const targetMode = getAlternateWorkbookCompareMode(currentMode);
  const timer = setTimeout(() => {
    const warmupStart = performance.now();
    void warmWorkbookAnalysisSnapshot(context, targetMode, payloadHints)
      .then((status) => {
        logDebugTiming('workbook-analysis-warmup:done', {
          fileName: context.resolvedFileName,
          sourceIdentity: context.sourceIdentity,
          compareMode: targetMode,
          status,
          delayMs: WORKBOOK_ALTERNATE_SNAPSHOT_WARMUP_DELAY_MS,
          durationMs: Number((performance.now() - warmupStart).toFixed(1)),
        });
      })
      .catch((error) => {
        logDebugTiming('workbook-analysis-warmup:failed', {
          fileName: context.resolvedFileName,
          sourceIdentity: context.sourceIdentity,
          compareMode: targetMode,
          delayMs: WORKBOOK_ALTERNATE_SNAPSHOT_WARMUP_DELAY_MS,
          durationMs: Number((performance.now() - warmupStart).toFixed(1)),
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, WORKBOOK_ALTERNATE_SNAPSHOT_WARMUP_DELAY_MS);
  timer.unref?.();
}

async function resolveWorkbookMetadataBundle(
  context: WorkbookRequestContext,
): Promise<{
  analysisSnapshot: Awaited<ReturnType<typeof resolveAnalysisSnapshot>> | null;
  basePayload: FilePayload;
  minePayload: FilePayload;
  metadataPayload: WorkbookMetadataPayload | null;
  metadataMs: number;
}> {
  const cachedSnapshot = peekWorkbookAnalysisSnapshot({
    sourceIdentity: context.sourceIdentity,
    baseRevisionId: context.baseRevisionId,
    mineRevisionId: context.mineRevisionId,
  });
  if (cachedSnapshot?.workbookAnalysis) {
    return {
      analysisSnapshot: cachedSnapshot,
      basePayload: EMPTY_FILE_PAYLOAD,
      minePayload: EMPTY_FILE_PAYLOAD,
      metadataPayload: null,
      metadataMs: cachedSnapshot.workbookAnalysis.perf?.metadataMs ?? 0,
    };
  }

  if (canResolveWorkbookAnalysisDirectlyFromLocalFiles(context)) {
    const metadataPayload = await resolveWorkbookMetadataPairPayload(
      context.baseLocalPath,
      context.mineLocalPath,
      context.resolvedFileName,
    );
    if (metadataPayload) {
      return {
        analysisSnapshot: null,
        basePayload: EMPTY_FILE_PAYLOAD,
        minePayload: EMPTY_FILE_PAYLOAD,
        metadataPayload,
        metadataMs: metadataPayload.perf?.metadataMs ?? 0,
      };
    }
  }

  const metadataOnlyOptions: ReadFilePayloadOptions = {
    includeWorkbookText: false,
    includeWorkbookBytes: false,
    includeWorkbookMetadata: true,
  };
  const { basePayload, minePayload } = await resolveWorkbookPayloadPair(context, {
    base: metadataOnlyOptions,
    mine: metadataOnlyOptions,
  });
  return {
    analysisSnapshot: null,
    basePayload,
    minePayload,
    metadataPayload: null,
    metadataMs: (basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0),
  };
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
  const shouldResolveSvnContext = shouldResolveSvnRuntimeContext(baseRevisionId, mineRevisionId)
    || includeRevisionOptions;
  const target = shouldResolveSvnContext
    ? await resolveSvnTarget()
    : '';
  const timelineTargetUrl = shouldResolveSvnContext
    ? await resolveTimelineTargetUrl()
    : '';
  const workingCopyPath = shouldResolveSvnContext && target
    ? await resolveWorkingCopyPathForTarget(args, target)
    : '';
  const workingCopyAvailable = Boolean(workingCopyPath);
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const shouldLoadRevisionOptions = shouldResolveSvnContext
    && Boolean(includeRevisionOptions || baseRevisionId || mineRevisionId);
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
  const sourceIdentityKind = resolveCliSourceIdentityKind(
    resolvedBaseRevisionId,
    resolvedMineRevisionId,
  );
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
  const resolvedBasePayloadInfo = baseRevisionInfo ?? createRequestedRevisionInfo('base', resolvedBaseRevisionId);
  const resolvedMinePayloadInfo = mineRevisionInfo ?? createRequestedRevisionInfo('mine', resolvedMineRevisionId);
  const workbookRequestContext = isWorkbook
    ? createWorkbookRequestContext({
        args,
        target,
        resolvedFileName,
        baseRevisionId: resolvedBaseRevisionId,
        mineRevisionId: resolvedMineRevisionId,
        baseSourceInfo: resolvedBasePayloadInfo,
        mineSourceInfo: resolvedMinePayloadInfo,
        workingCopyPath,
        sourceIdentityKind,
      })
    : null;
  const basePayloadOptions = createWorkbookPayloadOptions(
    isWorkbook,
    !usesLocalInputSource(resolvedBaseRevisionId),
  );
  const minePayloadOptions = createWorkbookPayloadOptions(
    isWorkbook,
    !usesLocalInputSource(resolvedMineRevisionId),
  );
  const baseLocalPath = workbookRequestContext?.baseLocalPath
    ?? resolveLocalWorkbookSourcePath('base', resolvedBaseRevisionId, args, workingCopyPath);
  const mineLocalPath = workbookRequestContext?.mineLocalPath
    ?? resolveLocalWorkbookSourcePath('mine', resolvedMineRevisionId, args, workingCopyPath);
  const sameSource = workbookRequestContext?.sameSource
    ?? isSameWorkbookSource(args, resolvedBaseRevisionId, resolvedMineRevisionId);
  const sourceIdentity = workbookRequestContext?.sourceIdentity
    ?? buildSourceIdentity({
      kind: sourceIdentityKind,
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

  const workbookAnalysisBundle = isWorkbook && workbookRequestContext
    ? await resolveWorkbookAnalysisBundle(workbookRequestContext, workbookCompareMode)
    : null;
  const basePayloadPromise = !isWorkbook
    ? (resolvedBaseRevisionId
        ? readRevisionPayload(resolvedBasePayloadInfo, target, resolvedFileName, basePayloadOptions)
        : readFilePayload(baseLocalPath, basePayloadOptions))
    : null;
  const [initialBasePayload, initialMinePayload] = isWorkbook
    ? [
        workbookAnalysisBundle?.basePayload ?? EMPTY_FILE_PAYLOAD,
        workbookAnalysisBundle?.minePayload ?? EMPTY_FILE_PAYLOAD,
      ]
    : sameSource
      ? await Promise.all([basePayloadPromise!, basePayloadPromise!])
      : await Promise.all([
          basePayloadPromise!,
          resolvedMineRevisionId
            ? readRevisionPayload(resolvedMinePayloadInfo, target, resolvedFileName, minePayloadOptions)
            : readFilePayload(mineLocalPath, minePayloadOptions),
        ]);
  const analysisSnapshot = workbookAnalysisBundle?.analysisSnapshot
    ?? await resolveAnalysisSnapshot({
      sourceIdentity,
      compareMode: workbookCompareMode,
      baseRevisionId: resolvedBaseRevisionId,
      mineRevisionId: resolvedMineRevisionId,
      fileName: resolvedFileName,
      isWorkbook,
      basePayload: initialBasePayload,
      minePayload: initialMinePayload,
      baseLocalPath,
      mineLocalPath,
    });
  const preparedTextAnalysis = analysisSnapshot.textAnalysis;
  const preparedWorkbookAnalysis = analysisSnapshot.workbookAnalysis;
  const selectedPreparedDiffLines = isWorkbook
    ? (preparedWorkbookAnalysis?.diffLinesByMode[workbookCompareMode] ?? null)
    : (preparedTextAnalysis?.diffLines ?? null);
  const hasPreparedDiff = Boolean(selectedPreparedDiffLines);
  const [basePayload, minePayload] = hasPreparedDiff || !isWorkbook
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
  const workbookArtifactDiff = preparedWorkbookAnalysis?.artifactDiff ?? null;
  const metadataMs = preparedWorkbookAnalysis?.perf?.metadataMs
    ?? ((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0));

  logDebugTiming('build-diff-data:done', {
    compareMode: workbookCompareMode,
    baseRevisionId: resolvedBaseRevisionId ?? null,
    mineRevisionId: resolvedMineRevisionId ?? null,
    includeRevisionOptions: shouldLoadRevisionOptions,
    isWorkbook,
    hasPreparedWorkbookDiff: hasPreparedDiff,
    durationMs: Number((performance.now() - buildStart).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    baseParserMs: Number((basePayload.perf.parserMs ?? 0).toFixed(1)),
    mineParserMs: Number((minePayload.perf.parserMs ?? 0).toFixed(1)),
    metadataMs: Number(metadataMs.toFixed(1)),
    rustDiffMs: Number((preparedWorkbookAnalysis?.perf?.rustDiffMs ?? 0).toFixed(1)),
    diffMs: Number((preparedTextAnalysis?.perf?.diffMs ?? 0).toFixed(1)),
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

  if (isWorkbook) {
    scheduleWorkbookAlternateSnapshotWarmup(workbookRequestContext, workbookCompareMode, {
      basePayload,
      minePayload,
    });
  }

  return {
    svnUrl: target,
    fileName: resolvedFileName,
    basePath: args.basePath,
    minePath: args.minePath,
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
    baseContent: isWorkbook && hasPreparedDiff ? null : basePayload.content,
    mineContent: isWorkbook && hasPreparedDiff ? null : minePayload.content,
    baseBytes: isWorkbook && hasPreparedDiff ? null : basePayload.bytes,
    mineBytes: isWorkbook && hasPreparedDiff ? null : minePayload.bytes,
    analysisSnapshotsByMode: {
      [workbookCompareMode]: analysisSnapshot,
    },
    baseWorkbookMetadata: preparedWorkbookAnalysis?.metadata.base ?? basePayload.metadata,
    mineWorkbookMetadata: preparedWorkbookAnalysis?.metadata.mine ?? minePayload.metadata,
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
      metadataMs,
      diffMs: preparedTextAnalysis?.perf?.diffMs ?? 0,
      rustDiffMs: preparedWorkbookAnalysis?.perf?.rustDiffMs ?? 0,
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

async function buildLiteralLocalDiffData(
  basePath: string,
  minePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const buildStart = performance.now();
  const resolvedBasePath = basePath.trim();
  const resolvedMinePath = minePath.trim();
  const localArgs = buildLocalDiffCliArgs(resolvedBasePath, resolvedMinePath);
  setActiveCliArgs(localArgs);
  const resolvedFileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const workbookRequestContext = isWorkbook
    ? createWorkbookRequestContext({
        args: localArgs,
        target: '',
        resolvedFileName,
        baseRevisionId: undefined,
        mineRevisionId: undefined,
        baseSourceInfo: createRequestedRevisionInfo('base', undefined),
        mineSourceInfo: createRequestedRevisionInfo('mine', undefined),
        workingCopyPath: '',
      })
    : null;
  const payloadOptions = createWorkbookPayloadOptions(isWorkbook, false);
  const workbookAnalysisBundle = workbookRequestContext
    ? await resolveWorkbookAnalysisBundle(workbookRequestContext, workbookCompareMode)
    : null;
  const [initialBasePayload, initialMinePayload] = workbookRequestContext
    ? [
        workbookAnalysisBundle?.basePayload ?? EMPTY_FILE_PAYLOAD,
        workbookAnalysisBundle?.minePayload ?? EMPTY_FILE_PAYLOAD,
      ]
    : await Promise.all([
        readFilePayload(resolvedBasePath, payloadOptions),
        readFilePayload(resolvedMinePath, payloadOptions),
      ]);
  const sourceIdentity = workbookRequestContext?.sourceIdentity
    ?? buildSourceIdentity({
      kind: 'local-dev',
      fileName: resolvedFileName,
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      basePath: resolvedBasePath,
      minePath: resolvedMinePath,
      baseName: localArgs.baseName,
      mineName: localArgs.mineName,
    });
  const analysisSnapshot = workbookAnalysisBundle?.analysisSnapshot
    ?? await resolveAnalysisSnapshot({
      sourceIdentity,
      compareMode: workbookCompareMode,
      fileName: resolvedFileName,
      isWorkbook,
      basePayload: initialBasePayload,
      minePayload: initialMinePayload,
      baseLocalPath: resolvedBasePath,
      mineLocalPath: resolvedMinePath,
    });
  const preparedTextAnalysis = analysisSnapshot.textAnalysis;
  const preparedWorkbookAnalysis = analysisSnapshot.workbookAnalysis;
  const selectedPreparedDiffLines = isWorkbook
    ? (preparedWorkbookAnalysis?.diffLinesByMode[workbookCompareMode] ?? null)
    : (preparedTextAnalysis?.diffLines ?? null);
  const hasPreparedDiff = Boolean(selectedPreparedDiffLines);
  const [basePayload, minePayload] = hasPreparedDiff || !isWorkbook
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
  const workbookArtifactDiff = preparedWorkbookAnalysis?.artifactDiff ?? null;
  const metadataMs = preparedWorkbookAnalysis?.perf?.metadataMs
    ?? ((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0));

  if (isWorkbook) {
    scheduleWorkbookAlternateSnapshotWarmup(workbookRequestContext, workbookCompareMode, {
      basePayload,
      minePayload,
    });
  }

  return {
    svnUrl: '',
    fileName: resolvedFileName,
    basePath: resolvedBasePath,
    minePath: resolvedMinePath,
    sourceIdentity,
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: false,
    initialPair: null,
    resetPair: null,
    launchBaseName: resolveSideName('', resolvedBasePath),
    launchMineName: resolveSideName('', resolvedMinePath),
    baseName: resolveSideName('', resolvedBasePath),
    mineName: resolveSideName('', resolvedMinePath),
    baseContent: isWorkbook && hasPreparedDiff ? null : basePayload.content,
    mineContent: isWorkbook && hasPreparedDiff ? null : minePayload.content,
    baseBytes: isWorkbook && hasPreparedDiff ? null : basePayload.bytes,
    mineBytes: isWorkbook && hasPreparedDiff ? null : minePayload.bytes,
    analysisSnapshotsByMode: {
      [workbookCompareMode]: analysisSnapshot,
    },
    baseWorkbookMetadata: preparedWorkbookAnalysis?.metadata.base ?? basePayload.metadata,
    mineWorkbookMetadata: preparedWorkbookAnalysis?.metadata.mine ?? minePayload.metadata,
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
      metadataMs,
      diffMs: preparedTextAnalysis?.perf?.diffMs ?? 0,
      rustDiffMs: preparedWorkbookAnalysis?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

interface ResolvedTwoFileRevisionSource {
  id: string;
  info: SvnRevisionInfo;
}

async function resolveTwoFileRevisionSource(
  side: 'base' | 'mine',
  target: string,
  requestedId: string,
): Promise<ResolvedTwoFileRevisionSource> {
  const normalizedRequestedId = requestedId.trim();
  if (normalizedRequestedId && normalizedRequestedId !== REMOTE_HEAD_ID) {
    return {
      id: normalizedRequestedId,
      info: createRequestedRevisionInfo(side, normalizedRequestedId),
    };
  }

  const latestPayload = await queryRevisionOptionsForTarget(target, {
    limit: 1,
    includeSpecials: false,
    targetSide: side,
  });
  const latest = latestPayload.items.find((item) => item.kind === 'revision') ?? null;
  if (latest) {
    return {
      id: latest.id,
      info: latest,
    };
  }

  return {
    id: 'HEAD',
    info: {
      id: 'HEAD',
      revision: 'HEAD',
      title: 'HEAD',
      author: '',
      date: '',
      message: '',
      kind: 'revision',
    },
  };
}

async function buildVersionedTwoFileDiffData(
  localArgs: CliArgs,
  baseTarget: string,
  mineTarget: string,
  requestedBaseRevisionId: string,
  requestedMineRevisionId: string,
  workbookCompareMode: WorkbookCompareMode,
): Promise<DiffData> {
  const buildStart = performance.now();
  const [baseSource, mineSource] = await Promise.all([
    resolveTwoFileRevisionSource('base', baseTarget, requestedBaseRevisionId),
    resolveTwoFileRevisionSource('mine', mineTarget, requestedMineRevisionId),
  ]);
  const resolvedFileName = path.basename(localArgs.minePath || localArgs.basePath || 'local-diff');
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const workbookRequestContext = isWorkbook
    ? createWorkbookRequestContext({
        args: localArgs,
        target: '',
        baseTarget,
        mineTarget,
        resolvedFileName,
        baseRevisionId: baseSource.id,
        mineRevisionId: mineSource.id,
        baseSourceInfo: baseSource.info,
        mineSourceInfo: mineSource.info,
        workingCopyPath: '',
        sourceIdentityKind: 'revision-switch',
      })
    : null;
  const basePayloadOptions = createWorkbookPayloadOptions(isWorkbook, true);
  const minePayloadOptions = createWorkbookPayloadOptions(isWorkbook, true);
  const workbookAnalysisBundle = workbookRequestContext
    ? await resolveWorkbookAnalysisBundle(workbookRequestContext, workbookCompareMode)
    : null;
  const sameSource = baseTarget.trim() === mineTarget.trim() && baseSource.id === mineSource.id;
  const basePayloadPromise = workbookRequestContext
    ? null
    : readRevisionPayload(baseSource.info, baseTarget, path.basename(localArgs.basePath), basePayloadOptions);
  const [initialBasePayload, initialMinePayload] = workbookRequestContext
    ? [
        workbookAnalysisBundle?.basePayload ?? EMPTY_FILE_PAYLOAD,
        workbookAnalysisBundle?.minePayload ?? EMPTY_FILE_PAYLOAD,
      ]
    : sameSource
      ? await Promise.all([basePayloadPromise!, basePayloadPromise!])
      : await Promise.all([
          basePayloadPromise!,
          readRevisionPayload(mineSource.info, mineTarget, path.basename(localArgs.minePath), minePayloadOptions),
        ]);
  const sourceIdentity = workbookRequestContext?.sourceIdentity
    ?? buildSourceIdentity({
      kind: 'revision-switch',
      fileName: resolvedFileName,
      baseUrl: baseTarget,
      mineUrl: mineTarget,
      baseRevision: baseSource.id,
      mineRevision: mineSource.id,
      pegRevision: '',
      basePath: '',
      minePath: '',
      baseName: localArgs.baseName,
      mineName: localArgs.mineName,
    });
  const analysisSnapshot = workbookAnalysisBundle?.analysisSnapshot
    ?? await resolveAnalysisSnapshot({
      sourceIdentity,
      compareMode: workbookCompareMode,
      baseRevisionId: baseSource.id,
      mineRevisionId: mineSource.id,
      fileName: resolvedFileName,
      isWorkbook,
      basePayload: initialBasePayload,
      minePayload: initialMinePayload,
      baseLocalPath: '',
      mineLocalPath: '',
    });
  const preparedTextAnalysis = analysisSnapshot.textAnalysis;
  const preparedWorkbookAnalysis = analysisSnapshot.workbookAnalysis;
  const selectedPreparedDiffLines = isWorkbook
    ? (preparedWorkbookAnalysis?.diffLinesByMode[workbookCompareMode] ?? null)
    : (preparedTextAnalysis?.diffLines ?? null);
  const hasPreparedDiff = Boolean(selectedPreparedDiffLines);
  const [basePayload, minePayload] = hasPreparedDiff || !isWorkbook
    ? [initialBasePayload, initialMinePayload]
    : sameSource
      ? await (() => {
          const fallbackPromise = ensureWorkbookFallbackPayload(
            initialBasePayload,
            baseSource.id,
            baseSource.info,
            baseTarget,
            path.basename(localArgs.basePath),
            '',
          );
          return Promise.all([fallbackPromise, fallbackPromise]);
        })()
      : await Promise.all([
          ensureWorkbookFallbackPayload(
            initialBasePayload,
            baseSource.id,
            baseSource.info,
            baseTarget,
            path.basename(localArgs.basePath),
            '',
          ),
          ensureWorkbookFallbackPayload(
            initialMinePayload,
            mineSource.id,
            mineSource.info,
            mineTarget,
            path.basename(localArgs.minePath),
            '',
          ),
        ]);
  const workbookArtifactDiff = preparedWorkbookAnalysis?.artifactDiff ?? null;
  const metadataMs = preparedWorkbookAnalysis?.perf?.metadataMs
    ?? ((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0));

  if (isWorkbook) {
    scheduleWorkbookAlternateSnapshotWarmup(workbookRequestContext, workbookCompareMode, {
      basePayload,
      minePayload,
    });
  }

  return {
    svnUrl: '',
    fileName: resolvedFileName,
    basePath: localArgs.basePath,
    minePath: localArgs.minePath,
    sourceIdentity,
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: true,
    initialPair: {
      baseRevisionId: baseSource.id,
      mineRevisionId: mineSource.id,
    },
    resetPair: {
      baseRevisionId: REMOTE_HEAD_ID,
      mineRevisionId: REMOTE_HEAD_ID,
    },
    launchBaseName: resolveSideName('', localArgs.basePath),
    launchMineName: resolveSideName('', localArgs.minePath),
    baseName: makeSideDisplayName(
      path.basename(localArgs.basePath),
      baseSource.info,
      resolveSideName('', localArgs.basePath),
    ),
    mineName: makeSideDisplayName(
      path.basename(localArgs.minePath),
      mineSource.info,
      resolveSideName('', localArgs.minePath),
    ),
    baseContent: isWorkbook && hasPreparedDiff ? null : basePayload.content,
    mineContent: isWorkbook && hasPreparedDiff ? null : minePayload.content,
    baseBytes: isWorkbook && hasPreparedDiff ? null : basePayload.bytes,
    mineBytes: isWorkbook && hasPreparedDiff ? null : minePayload.bytes,
    analysisSnapshotsByMode: {
      [workbookCompareMode]: analysisSnapshot,
    },
    baseWorkbookMetadata: preparedWorkbookAnalysis?.metadata.base ?? basePayload.metadata,
    mineWorkbookMetadata: preparedWorkbookAnalysis?.metadata.mine ?? minePayload.metadata,
    revisionOptions: null,
    baseRevisionInfo: baseSource.info,
    mineRevisionInfo: mineSource.info,
    canSwitchRevisions: true,
    workbookArtifactDiff,
    sourceNoticeCode: null,
    perf: {
      source: 'revision-switch',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs,
      diffMs: preparedTextAnalysis?.perf?.diffMs ?? 0,
      rustDiffMs: preparedWorkbookAnalysis?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

export async function buildTwoFileRevisionDiffData(
  baseRevisionId: string,
  mineRevisionId: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const args = getActiveCliArgs();
  if (
    !args.basePath.trim()
    || !args.minePath.trim()
    || !isRemoteRepositoryTarget(args.baseUrl)
    || !isRemoteRepositoryTarget(args.mineUrl)
  ) {
    throw new Error('Two-file SVN revision context is unavailable');
  }
  return buildVersionedTwoFileDiffData(
    args,
    args.baseUrl,
    args.mineUrl,
    baseRevisionId || REMOTE_HEAD_ID,
    mineRevisionId || REMOTE_HEAD_ID,
    workbookCompareMode,
  );
}

export async function buildLocalDiffData(
  basePath: string,
  minePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const localArgs = buildLocalDiffCliArgs(basePath, minePath);
  setActiveCliArgs(localArgs);
  const [baseTarget, mineTarget] = await Promise.all([
    resolveLocalSvnUrl(localArgs.basePath),
    resolveLocalSvnUrl(localArgs.minePath),
  ]);

  if (baseTarget && mineTarget) {
    const versionedArgs: CliArgs = {
      ...localArgs,
      baseUrl: baseTarget,
      mineUrl: mineTarget,
    };
    setActiveCliArgs(versionedArgs);
    return buildVersionedTwoFileDiffData(
      versionedArgs,
      baseTarget,
      mineTarget,
      REMOTE_HEAD_ID,
      REMOTE_HEAD_ID,
      workbookCompareMode,
    );
  }

  return buildLiteralLocalDiffData(basePath, minePath, workbookCompareMode);
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
  const context = await resolveWorkbookRequestContext(baseRevisionId, mineRevisionId);
  const { analysisSnapshot, basePayload, minePayload } = await resolveWorkbookAnalysisBundle(context, compareMode);
  const workbookAnalysis = analysisSnapshot.workbookAnalysis;

  logDebugTiming('load-workbook-compare-mode:done', {
    compareMode,
    baseRevisionId: baseRevisionId ?? null,
    mineRevisionId: mineRevisionId ?? null,
    durationMs: Number((performance.now() - start).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    metadataMs: Number(((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0)).toFixed(1)),
    rustDiffMs: Number((workbookAnalysis?.perf?.rustDiffMs ?? 0).toFixed(1)),
  });

  return {
    compareMode,
    analysisSnapshot,
    perf: typeof workbookAnalysis?.perf?.rustDiffMs === 'number'
      ? {
          rustDiffMs: workbookAnalysis.perf.rustDiffMs,
        }
      : null,
  };
}

export async function loadWorkbookMetadataData(
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookMetadataPayload> {
  const start = performance.now();
  const context = await resolveWorkbookRequestContext(baseRevisionId, mineRevisionId);
  const {
    analysisSnapshot,
    basePayload,
    minePayload,
    metadataPayload,
    metadataMs,
  } = await resolveWorkbookMetadataBundle(context);
  const workbookAnalysis = analysisSnapshot?.workbookAnalysis ?? null;

  logDebugTiming('load-workbook-metadata:done', {
    baseRevisionId: baseRevisionId ?? null,
    mineRevisionId: mineRevisionId ?? null,
    durationMs: Number((performance.now() - start).toFixed(1)),
    metadataMs: Number(metadataMs.toFixed(1)),
  });

  if (!analysisSnapshot && metadataPayload) {
    return metadataPayload;
  }

  return {
    base: workbookAnalysis?.metadata.base ?? basePayload.metadata,
    mine: workbookAnalysis?.metadata.mine ?? minePayload.metadata,
    analysisSnapshot,
    perf: { metadataMs },
  };
}
