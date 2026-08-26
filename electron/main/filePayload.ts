import * as fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  FILE_PAYLOAD_CACHE_LIMIT,
  FILE_PAYLOAD_CACHE_MAX_BYTES,
  REVISION_PAYLOAD_CACHE_LIMIT,
  REVISION_PAYLOAD_CACHE_MAX_BYTES,
  WORKBOOK_COMPARE_CACHE_LIMIT,
  WORKBOOK_COMPARE_CACHE_MAX_BYTES,
  WORKBOOK_METADATA_CACHE_LIMIT,
  WORKBOOK_METADATA_CACHE_MAX_BYTES,
} from './constants.js';
import { electronT } from '../i18n.js';
import {
  canSatisfyWorkbookPayloadRequest,
  estimatePayloadMemoryBytes,
  estimateWorkbookMetadataPayloadMemoryBytes,
  getRequestedWorkbookPayloadCoverage,
  mergeWorkbookPayload,
  mergeWorkbookPayloadCoverage,
  projectWorkbookPayloadForOptions,
  readWorkbookCompareCachePayload,
  rememberCacheEntry,
  shouldCompressWorkbookCompareCachePayload,
  storeWorkbookCompareCachePayload,
  storeWorkbookCompareCachePayloadInline,
} from './cache.js';
import { logMainWarn } from '../logging.js';
import { logDebugTiming, writeExternalDiffDebugLog } from './logger.js';
import {
  tryParseWorkbookWithRust,
  tryResolveWorkbookDiffWithRust,
  tryResolveWorkbookDiffStreamWithRust,
  tryResolveWorkbookMetadataWithRust,
  runSvnBuffer,
} from './rustBridge.js';
import { getExtension, getPeggedSvnTarget, isWorkbookFile, normalizeRevisionNumber } from './svnHelpers.js';
import {
  filePayloadCache,
  getActiveCliArgs,
  getSessionCacheGeneration,
  revisionPayloadCache,
  workbookCompareCache,
  workbookCompareInFlight,
  workbookMetadataCache,
  workbookMetadataInFlight,
} from './state.js';
import { removeManagedTempFile, writeManagedTempFile } from '../runtimePaths.js';
import { getLocalWorkbookPairCacheContext, resolveWorkingCopyPathForTarget } from './svnOperations.js';
import type {
  FilePayload,
  LocalWorkbookPairCacheContext,
  ReadFilePayloadOptions,
  ResolvedWorkbookCompareModePayload,
  SvnRevisionInfo,
  WorkbookCompareMode,
  WorkbookMetadataPayload,
} from './types.js';

const WORKBOOK_METADATA_ONLY_OPTIONS = {
  includeWorkbookText: false,
  includeWorkbookBytes: false,
  includeWorkbookMetadata: true,
} as const;
const WORKBOOK_DUAL_MODE_PARSE_MAX_BYTES = 64 * 1024 * 1024;

// ---------------------------------------------------------------------------
// readFilePayload — read a file from the local filesystem (with caching)
// ---------------------------------------------------------------------------

export async function readFilePayload(
  filePath: string,
  options: ReadFilePayloadOptions = {},
): Promise<FilePayload> {
  const cacheGeneration = getSessionCacheGeneration();
  if (!filePath) {
    return {
      content: null,
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return {
        content: null,
        bytes: null,
        metadata: null,
        perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
      };
    }

    const stat = await fs.promises.stat(filePath);
    const cachedPayload = filePayloadCache.get(filePath);
    if (cachedPayload && cachedPayload.mtimeMs === stat.mtimeMs && cachedPayload.size === stat.size) {
      if (isWorkbookFile(filePath)) {
        if (canSatisfyWorkbookPayloadRequest(cachedPayload.coverage, options)) {
          return projectWorkbookPayloadForOptions(cachedPayload.payload, options);
        }
      } else {
        return { ...cachedPayload.payload };
      }
    }

    if (isWorkbookFile(filePath)) {
      const includeWorkbookText = options.includeWorkbookText !== false;
      const includeWorkbookBytes = options.includeWorkbookBytes !== false;
      const includeWorkbookMetadata = options.includeWorkbookMetadata !== false;
      let workbookBytes: Uint8Array | null = null;
      let readMs = 0;

      if (includeWorkbookBytes) {
        const readStart = performance.now();
        const buffer = await fs.promises.readFile(filePath);
        workbookBytes = Uint8Array.from(buffer);
        readMs = performance.now() - readStart;
      }

      const [parsedWorkbook, metadataResult] = await Promise.all([
        includeWorkbookText
          ? tryParseWorkbookWithRust(filePath)
          : Promise.resolve({ content: null, parseMs: 0 }),
        includeWorkbookMetadata
          ? tryResolveWorkbookMetadataWithRust(filePath)
          : Promise.resolve({ metadata: null, parseMs: 0 }),
      ]);
      const payload = {
        content: parsedWorkbook.content,
        bytes: workbookBytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: workbookBytes?.length ?? stat.size,
        },
      };
      const requestedCoverage = getRequestedWorkbookPayloadCoverage(options);
      const cachePayload: FilePayload = {
        ...payload,
        bytes: null,
      };
      if (getSessionCacheGeneration() === cacheGeneration) rememberCacheEntry(filePayloadCache, filePath, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        payload: cachePayload,
        memoryBytes: estimatePayloadMemoryBytes(cachePayload),
        coverage: {
          ...requestedCoverage,
          bytes: false,
        },
      }, FILE_PAYLOAD_CACHE_LIMIT, FILE_PAYLOAD_CACHE_MAX_BYTES);

      return payload;
    }

    const readStart = performance.now();
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const readMs = performance.now() - readStart;
    const payload = {
      content,
      bytes: null,
      metadata: null,
      perf: {
        readMs,
        parserMs: 0,
        metadataMs: 0,
        byteLength: Buffer.byteLength(content, 'utf-8'),
      },
    };
    if (getSessionCacheGeneration() === cacheGeneration) rememberCacheEntry(filePayloadCache, filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      payload,
      memoryBytes: estimatePayloadMemoryBytes(payload),
      coverage: {
        text: true,
        bytes: false,
        metadata: false,
      },
    }, FILE_PAYLOAD_CACHE_LIMIT, FILE_PAYLOAD_CACHE_MAX_BYTES);
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `[${electronT('filePayloadReadError', { message })}]`,
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// buildPayloadFromBuffer — parse a workbook from an in-memory buffer
// ---------------------------------------------------------------------------

async function buildPayloadFromBuffer(
  buffer: Buffer,
  fileName: string,
  options: ReadFilePayloadOptions = {},
): Promise<FilePayload> {
  if (isWorkbookFile(fileName)) {
    const includeWorkbookText = options.includeWorkbookText !== false;
    const includeWorkbookBytes = options.includeWorkbookBytes !== false;
    const includeWorkbookMetadata = options.includeWorkbookMetadata !== false;
    const bytes = includeWorkbookBytes ? Uint8Array.from(buffer) : null;
    if (!includeWorkbookText && !includeWorkbookMetadata) {
      return {
        content: null,
        bytes,
        metadata: null,
        perf: {
          readMs: 0,
          parserMs: 0,
          metadataMs: 0,
          byteLength: bytes?.length ?? buffer.length,
        },
      };
    }

    const tempFilePath = await writeManagedTempFile('payload', getExtension(fileName) || '.bin', buffer);

    try {
      const [parsedWorkbook, metadataResult] = await Promise.all([
        includeWorkbookText
          ? tryParseWorkbookWithRust(tempFilePath)
          : Promise.resolve({ content: null, parseMs: 0 }),
        includeWorkbookMetadata
          ? tryResolveWorkbookMetadataWithRust(tempFilePath)
          : Promise.resolve({ metadata: null, parseMs: 0 }),
      ]);
      return {
        content: parsedWorkbook.content,
        bytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs: 0,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: bytes?.length ?? buffer.length,
        },
      };
    } finally {
      try {
        await removeManagedTempFile(tempFilePath);
      } catch {
        // ignore temp cleanup failure
      }
    }
  }

  return {
    content: buffer.toString('utf-8'),
    bytes: null,
    metadata: null,
    perf: {
      readMs: 0,
      parserMs: 0,
      metadataMs: 0,
      byteLength: buffer.length,
    },
  };
}

// ---------------------------------------------------------------------------
// readRevisionPayload — read a file at a specific SVN revision
// ---------------------------------------------------------------------------

export async function readRevisionPayload(
  source: SvnRevisionInfo,
  target: string,
  fileName: string,
  options: ReadFilePayloadOptions = {},
): Promise<FilePayload> {
  const cacheGeneration = getSessionCacheGeneration();
  const args = getActiveCliArgs();
  if (source.id === '__base_input__') {
    writeExternalDiffDebugLog('read-revision-payload', {
      mode: 'special-base',
      sourceId: source.id,
      fileName,
      filePath: args.basePath,
    });
    return readFilePayload(args.basePath, options);
  }
  if (source.id === '__mine_input__') {
    const workingCopyPath = await resolveWorkingCopyPathForTarget(args, target);
    const filePath = workingCopyPath || args.minePath;
    writeExternalDiffDebugLog('read-revision-payload', {
      mode: 'special-mine',
      sourceId: source.id,
      fileName,
      filePath,
    });
    return readFilePayload(filePath, options);
  }

  const revisionCacheKey = `${target}::${fileName}::${source.id}`;
  const cachedPayload = revisionPayloadCache.get(revisionCacheKey);
  if (cachedPayload) {
    if (!isWorkbookFile(fileName) || canSatisfyWorkbookPayloadRequest(cachedPayload.coverage, options)) {
      return isWorkbookFile(fileName)
        ? projectWorkbookPayloadForOptions(cachedPayload.payload, options)
        : cachedPayload.payload;
    }
  }

  if (!target) {
    writeExternalDiffDebugLog('read-revision-payload', {
      mode: 'missing-target',
      sourceId: source.id,
      revision: source.revision,
      fileName,
    });
    return {
      content: electronT('filePayloadMissingRepositoryUrl'),
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  const peggedTarget = getPeggedSvnTarget(target);
  writeExternalDiffDebugLog('read-revision-payload', {
    mode: 'svn-cat',
    sourceId: source.id,
    revision: source.revision,
    normalizedRevision: normalizeRevisionNumber(source.revision),
    target,
    peggedTarget,
    fileName,
  });
  const result = await runSvnBuffer(['cat', '-r', normalizeRevisionNumber(source.revision), peggedTarget]);
  if (!result.ok) {
    const message = result.stderr.trim() || 'svn cat failed';
    writeExternalDiffDebugLog('read-revision-payload:error', {
      sourceId: source.id,
      revision: source.revision,
      target,
      peggedTarget,
      fileName,
      message,
    });
    return {
      content: electronT('filePayloadReadRevisionError', { revision: source.revision, message }),
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  const payload = await buildPayloadFromBuffer(result.stdout, fileName, options);
  const requestedCoverage = getRequestedWorkbookPayloadCoverage(options);
  const mergedPayload = isWorkbookFile(fileName)
    ? mergeWorkbookPayload(cachedPayload?.payload ?? null, payload, requestedCoverage)
    : payload;
  const mergedCoverage = isWorkbookFile(fileName)
    ? mergeWorkbookPayloadCoverage(cachedPayload?.coverage ?? null, requestedCoverage)
    : {
        text: true,
        bytes: false,
        metadata: false,
      };
  const cachePayload = isWorkbookFile(fileName)
    ? {
        ...mergedPayload,
        bytes: null,
      }
    : mergedPayload;
  if (getSessionCacheGeneration() === cacheGeneration) rememberCacheEntry(revisionPayloadCache, revisionCacheKey, {
    payload: cachePayload,
    memoryBytes: estimatePayloadMemoryBytes(cachePayload),
    coverage: isWorkbookFile(fileName)
      ? {
          ...mergedCoverage,
          bytes: false,
        }
      : mergedCoverage,
  }, REVISION_PAYLOAD_CACHE_LIMIT, REVISION_PAYLOAD_CACHE_MAX_BYTES);
  return isWorkbookFile(fileName)
    ? projectWorkbookPayloadForOptions(mergedPayload, options)
    : mergedPayload;
}

// ---------------------------------------------------------------------------
// Workbook metadata resolution
// ---------------------------------------------------------------------------

export async function resolveWorkbookMetadataPairPayload(
  basePathCandidate: string,
  minePathCandidate: string,
  fileName: string,
): Promise<WorkbookMetadataPayload | null> {
  const cacheGeneration = getSessionCacheGeneration();
  if (!isWorkbookFile(fileName)) return null;

  const cacheContext = await getLocalWorkbookPairCacheContext(
    basePathCandidate,
    minePathCandidate,
    'metadata',
  );
  if (!cacheContext) return null;

  const cachedPayload = getSessionCacheGeneration() === cacheGeneration
    ? workbookMetadataCache.get(cacheContext.key)
    : null;
  if (
    cachedPayload
    && cachedPayload.leftMtimeMs === cacheContext.leftMtimeMs
    && cachedPayload.rightMtimeMs === cacheContext.rightMtimeMs
    && cachedPayload.leftSize === cacheContext.leftSize
    && cachedPayload.rightSize === cacheContext.rightSize
  ) {
    logDebugTiming('workbook-metadata-cache:memory-hit', {
      fileName,
    });
    return cachedPayload.payload;
  }

  const inFlight = getSessionCacheGeneration() === cacheGeneration
    ? workbookMetadataInFlight.get(cacheContext.key)
    : null;
  if (inFlight) {
    return inFlight;
  }

  const resolver = (async (): Promise<WorkbookMetadataPayload> => {
    const basePayloadPromise = readFilePayload(basePathCandidate, WORKBOOK_METADATA_ONLY_OPTIONS);
    const [basePayload, minePayload] = basePathCandidate === minePathCandidate
      ? await Promise.all([basePayloadPromise, basePayloadPromise])
      : await Promise.all([
          basePayloadPromise,
          readFilePayload(minePathCandidate, WORKBOOK_METADATA_ONLY_OPTIONS),
        ]);

    const payload: WorkbookMetadataPayload = {
      base: basePayload.metadata,
      mine: minePayload.metadata,
      analysisSnapshot: null,
      perf: {
        metadataMs: (basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0),
      },
    };

    if (getSessionCacheGeneration() === cacheGeneration) {
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

  if (getSessionCacheGeneration() === cacheGeneration) {
    workbookMetadataInFlight.set(cacheContext.key, resolver);
  }
  try {
    return await resolver;
  } finally {
    if (workbookMetadataInFlight.get(cacheContext.key) === resolver) {
      workbookMetadataInFlight.delete(cacheContext.key);
    }
  }
}

// ---------------------------------------------------------------------------
// Workbook diff resolution
// ---------------------------------------------------------------------------

function rememberWorkbookComparePayload(
  cacheContext: LocalWorkbookPairCacheContext,
  payload: ResolvedWorkbookCompareModePayload,
  cacheGeneration: number,
): void {
  if (getSessionCacheGeneration() !== cacheGeneration) return;
  const inlineStoredPayload = storeWorkbookCompareCachePayloadInline(payload);
  rememberCacheEntry(workbookCompareCache, cacheContext.key, {
    leftMtimeMs: cacheContext.leftMtimeMs,
    rightMtimeMs: cacheContext.rightMtimeMs,
    leftSize: cacheContext.leftSize,
    rightSize: cacheContext.rightSize,
    payload: inlineStoredPayload.payload,
    memoryBytes: inlineStoredPayload.memoryBytes,
  }, WORKBOOK_COMPARE_CACHE_LIMIT, WORKBOOK_COMPARE_CACHE_MAX_BYTES);

  if (!shouldCompressWorkbookCompareCachePayload(inlineStoredPayload.estimatedMemoryBytes)) return;
  void storeWorkbookCompareCachePayload(payload)
    .then((storedPayload) => {
      if (getSessionCacheGeneration() !== cacheGeneration) return;
      const current = workbookCompareCache.get(cacheContext.key);
      if (
        !current
        || current.leftMtimeMs !== cacheContext.leftMtimeMs
        || current.rightMtimeMs !== cacheContext.rightMtimeMs
        || current.leftSize !== cacheContext.leftSize
        || current.rightSize !== cacheContext.rightSize
      ) {
        return;
      }
      rememberCacheEntry(workbookCompareCache, cacheContext.key, {
        leftMtimeMs: cacheContext.leftMtimeMs,
        rightMtimeMs: cacheContext.rightMtimeMs,
        leftSize: cacheContext.leftSize,
        rightSize: cacheContext.rightSize,
        payload: storedPayload.payload,
        memoryBytes: storedPayload.memoryBytes,
      }, WORKBOOK_COMPARE_CACHE_LIMIT, WORKBOOK_COMPARE_CACHE_MAX_BYTES);
    })
    .catch((error) => {
      logMainWarn(
        'workbook-compare-cache',
        'background compression failed:',
        error instanceof Error ? error.message : String(error),
      );
    });
}

function canUseDirectWorkbookDiff(
  basePath: string,
  minePath: string,
  fileName: string,
): boolean {
  return Boolean(
    isWorkbookFile(fileName)
    && basePath
    && minePath
    && fs.existsSync(basePath)
    && fs.existsSync(minePath),
  );
}

async function withWorkbookDiffSources<T>(
  basePathCandidate: string,
  baseBytes: Uint8Array | null,
  minePathCandidate: string,
  mineBytes: Uint8Array | null,
  fileName: string,
  run: (basePath: string, minePath: string) => Promise<T>,
): Promise<T | null> {
  const tempPaths: string[] = [];
  const resolveSource = async (
    pathCandidate: string,
    bytes: Uint8Array | null,
    suffix: 'base' | 'mine',
  ): Promise<string | null> => {
    if (pathCandidate && fs.existsSync(pathCandidate)) {
      return pathCandidate;
    }
    if (!bytes || bytes.byteLength === 0) return null;

    const tempPath = await writeManagedTempFile(suffix, getExtension(fileName) || '.bin', Buffer.from(bytes));
    tempPaths.push(tempPath);
    return tempPath;
  };

  try {
    const basePath = await resolveSource(basePathCandidate, baseBytes, 'base');
    const minePath = await resolveSource(minePathCandidate, mineBytes, 'mine');
    if (!basePath || !minePath) return null;
    return await run(basePath, minePath);
  } finally {
    await Promise.all(tempPaths.map(async (tempPath) => {
      try {
        await removeManagedTempFile(tempPath);
      } catch {
        // ignore temp cleanup failure
      }
    }));
  }
}

export async function resolveWorkbookCompareModePayload(
  basePathCandidate: string,
  baseBytes: Uint8Array | null,
  minePathCandidate: string,
  mineBytes: Uint8Array | null,
  fileName: string,
  compareMode: WorkbookCompareMode,
): Promise<ResolvedWorkbookCompareModePayload | null> {
  const cacheGeneration = getSessionCacheGeneration();
  if (!isWorkbookFile(fileName)) return null;
  const cacheContext = await getLocalWorkbookPairCacheContext(
    basePathCandidate,
    minePathCandidate,
    `compare:${compareMode}`,
  );
  if (cacheContext) {
    const cached = getSessionCacheGeneration() === cacheGeneration
      ? workbookCompareCache.get(cacheContext.key)
      : null;
    if (
      cached
      && cached.leftMtimeMs === cacheContext.leftMtimeMs
      && cached.rightMtimeMs === cacheContext.rightMtimeMs
      && cached.leftSize === cacheContext.leftSize
      && cached.rightSize === cacheContext.rightSize
    ) {
      logDebugTiming('workbook-compare-cache:memory-hit', {
        compareMode,
        fileName,
      });
      try {
        return await readWorkbookCompareCachePayload(cached.payload);
      } catch (error) {
        workbookCompareCache.delete(cacheContext.key);
        logMainWarn(
          'workbook-compare-cache',
          'decode failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    const inFlight = getSessionCacheGeneration() === cacheGeneration
      ? workbookCompareInFlight.get(cacheContext.key)
      : null;
    if (inFlight) {
      return inFlight;
    }
  }

  const resolver = (async (): Promise<ResolvedWorkbookCompareModePayload | null> => {
    const buildPayload = (
      mode: WorkbookCompareMode,
      result: {
        diffLines: ResolvedWorkbookCompareModePayload['diffLines'];
        workbookDelta: ResolvedWorkbookCompareModePayload['workbookDelta'];
        baseMetadata: Exclude<ResolvedWorkbookCompareModePayload['baseMetadata'], undefined>;
        mineMetadata: Exclude<ResolvedWorkbookCompareModePayload['mineMetadata'], undefined>;
        metadataMs: number | null;
      },
      rustDiffMs: number,
    ): ResolvedWorkbookCompareModePayload => ({
      compareMode: mode,
      diffLines: result.diffLines,
      workbookDelta: result.workbookDelta,
      baseMetadata: result.baseMetadata,
      mineMetadata: result.mineMetadata,
      perf: {
        rustDiffMs,
        metadataMs: result.metadataMs ?? 0,
      },
    });

    const directDiffAvailable = canUseDirectWorkbookDiff(
      basePathCandidate,
      minePathCandidate,
      fileName,
    );
    const shouldResolveBothModes = Boolean(
      cacheContext
      && directDiffAvailable
      && (cacheContext.leftSize + cacheContext.rightSize) <= WORKBOOK_DUAL_MODE_PARSE_MAX_BYTES,
    );

    if (shouldResolveBothModes) {
      const alternateMode: WorkbookCompareMode = compareMode === 'strict' ? 'content' : 'strict';
      const alternateContext = await getLocalWorkbookPairCacheContext(
        basePathCandidate,
        minePathCandidate,
        `compare:${alternateMode}`,
      );
      let sharedRustDiffMs = 0;
      const primary = await tryResolveWorkbookDiffStreamWithRust(
        basePathCandidate,
        minePathCandidate,
        compareMode,
        (alternate) => {
          if (!alternateContext || !alternate.diffLines) return;
          rememberWorkbookComparePayload(
            alternateContext,
            buildPayload(
              alternate.compareMode,
              alternate,
              sharedRustDiffMs || alternate.parseMs,
            ),
            cacheGeneration,
          );
        },
      );
      if (primary.diffLines) {
        sharedRustDiffMs = primary.parseMs;
        const primaryPayload = buildPayload(compareMode, primary, primary.parseMs);
        rememberWorkbookComparePayload(cacheContext!, primaryPayload, cacheGeneration);
        logDebugTiming('workbook-compare-dual-mode:primary-ready', {
          fileName,
          requestedMode: compareMode,
          rustDiffMs: Number(primary.parseMs.toFixed(1)),
        });
        return primaryPayload;
      }
    }

    const directResult = directDiffAvailable
      ? await tryResolveWorkbookDiffWithRust(basePathCandidate, minePathCandidate, compareMode)
      : await withWorkbookDiffSources(
          basePathCandidate,
          baseBytes,
          minePathCandidate,
          mineBytes,
          fileName,
          (basePath, minePath) => tryResolveWorkbookDiffWithRust(basePath, minePath, compareMode),
        );
    if (!directResult?.diffLines) return null;

    const payload = buildPayload(compareMode, directResult, directResult.parseMs);
    if (cacheContext) rememberWorkbookComparePayload(cacheContext, payload, cacheGeneration);
    return payload;
  })();

  if (cacheContext && getSessionCacheGeneration() === cacheGeneration) {
    workbookCompareInFlight.set(cacheContext.key, resolver);
    try {
      return await resolver;
    } finally {
      if (workbookCompareInFlight.get(cacheContext.key) === resolver) {
        workbookCompareInFlight.delete(cacheContext.key);
      }
    }
  }

  return resolver;
}
