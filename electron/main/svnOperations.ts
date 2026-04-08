import * as fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  FILE_EQUALITY_CACHE_LIMIT,
  FILE_EQUALITY_CHUNK_BYTES,
  REVISION_OPTION_PAGES_CACHE_LIMIT,
} from './constants.js';
import { rememberFileEquality, rememberLimitedEntry } from './cache.js';
import { logMainDebug, logMainWarn } from '../logging.js';
import { logDebugTiming, writeExternalDiffDebugLog } from './logger.js';
import { runSvnUtf8 } from './rustBridge.js';
import {
  buildFileEqualityCacheKey,
  buildRevisionQueryCacheKey,
  formatSvnDateQuery,
  getRevisionNumberValue,
  haveSameExplicitSvnUrl,
  isRemoteRepositoryTarget,
  normalizeRevisionQuery,
  normalizeSvnUrlForCompare,
  parseLogEntries,
} from './svnHelpers.js';
import {
  cachedRevisionOptionPages,
  fileEqualityCache,
  getActiveCliArgs,
  getCachedSvnTarget,
  getCachedTimelineTarget,
  setCachedSvnTarget,
  setCachedTimelineTarget,
} from './state.js';
import {
  localSvnUrlCache,
  localVersioningStatusCache,
} from './svnProbeCache.js';
import type {
  LocalWorkbookPairCacheContext,
  RevisionOptionsPayload,
  RevisionOptionsQuery,
  SvnRevisionInfo,
} from './types.js';

function rememberProbePromise<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      return await factory();
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  })();
  cache.set(key, pending);
  return pending;
}

function getCandidateLocalPaths(args: { basePath: string; minePath: string }): string[] {
  return Array.from(
    new Set([args.minePath, args.basePath].map(value => value.trim()).filter(Boolean)),
  );
}

async function resolveLocalSvnUrl(filePath: string): Promise<string> {
  const candidate = filePath.trim();
  if (!candidate) return '';

  const resolved = await rememberProbePromise(localSvnUrlCache, candidate, async () => {
    const result = await runSvnUtf8(['info', '--show-item', 'url', candidate]);
    return result.ok ? result.stdout.trim() : '';
  });

  if (resolved) {
    localVersioningStatusCache.set(candidate, Promise.resolve('versioned'));
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// SVN target resolution
// ---------------------------------------------------------------------------

export async function resolveSvnTarget(): Promise<string> {
  if (getCachedSvnTarget() !== undefined) return getCachedSvnTarget() ?? '';

  const args = getActiveCliArgs();
  const explicitBase = isRemoteRepositoryTarget(args.baseUrl) ? args.baseUrl.trim() : '';
  const explicitMine = isRemoteRepositoryTarget(args.mineUrl) ? args.mineUrl.trim() : '';
  if (explicitBase && explicitMine) {
    if (haveSameExplicitSvnUrl(args)) {
      setCachedSvnTarget(explicitMine);
      setCachedTimelineTarget(explicitMine);
      writeExternalDiffDebugLog('resolve-svn-target', {
        mode: 'explicit-both',
        result: explicitMine,
      });
      return explicitMine;
    }
    setCachedSvnTarget(null);
    setCachedTimelineTarget(null);
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: 'explicit-conflict',
      baseUrl: explicitBase,
      mineUrl: explicitMine,
      result: '',
    });
    return '';
  }

  const explicit = explicitMine || explicitBase;
  if (explicit) {
    setCachedSvnTarget(explicit);
    setCachedTimelineTarget(explicit);
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: explicitMine ? 'explicit-mine' : 'explicit-base',
      result: explicit,
    });
    return explicit;
  }

  const candidatePaths = getCandidateLocalPaths(args);
  if (candidatePaths.length === 0) {
    setCachedSvnTarget(null);
    setCachedTimelineTarget(null);
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: 'no-candidates',
      result: '',
    });
    return '';
  }

  const resolvedTargets = Array.from(new Set((await Promise.all(
    candidatePaths.map(candidatePath => resolveLocalSvnUrl(candidatePath)),
  )).filter(Boolean)));

  if (resolvedTargets.length !== 1) {
    setCachedSvnTarget(null);
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: 'path-probe-mismatch',
      candidatePaths,
      resolvedTargets,
      result: '',
    });
    return '';
  }

  const target = resolvedTargets[0] ?? '';
  setCachedSvnTarget(target || null);
  if (target) {
    setCachedTimelineTarget(target);
  }
  writeExternalDiffDebugLog('resolve-svn-target', {
    mode: 'path-probe',
    candidatePaths,
    resolvedTargets,
    result: target,
  });
  return target;
}

export async function resolveTimelineTargetUrl(): Promise<string> {
  if (getCachedTimelineTarget() !== undefined) return getCachedTimelineTarget() ?? '';

  const cachedSvnTarget = getCachedSvnTarget();
  if (cachedSvnTarget) {
    setCachedTimelineTarget(cachedSvnTarget);
    return cachedSvnTarget;
  }

  const args = getActiveCliArgs();
  const candidatePaths = getCandidateLocalPaths(args);

  for (const candidatePath of candidatePaths) {
    const resolved = await resolveLocalSvnUrl(candidatePath);
    if (!resolved) continue;

    setCachedTimelineTarget(resolved);
    writeExternalDiffDebugLog('resolve-timeline-target', {
      mode: 'working-copy-path',
      candidatePath,
      result: resolved,
    });
    return resolved;
  }

  const explicitBase = isRemoteRepositoryTarget(args.baseUrl) ? normalizeSvnUrlForCompare(args.baseUrl) : '';
  const explicitMine = isRemoteRepositoryTarget(args.mineUrl) ? normalizeSvnUrlForCompare(args.mineUrl) : '';
  const fallback = explicitMine || explicitBase;
  if (explicitBase && explicitMine && explicitBase !== explicitMine) {
    setCachedTimelineTarget(null);
    writeExternalDiffDebugLog('resolve-timeline-target', {
      mode: 'explicit-conflict',
      baseUrl: explicitBase,
      mineUrl: explicitMine,
      result: '',
    });
    return '';
  }

  setCachedTimelineTarget(fallback || null);
  writeExternalDiffDebugLog('resolve-timeline-target', {
    mode: 'fallback',
    result: fallback,
  });
  return fallback;
}

export async function detectLocalSvnVersioningStatus(
  filePath: string,
): Promise<'versioned' | 'unversioned' | 'unknown'> {
  const candidate = filePath.trim();
  if (!candidate) return 'unknown';

  const cached = localVersioningStatusCache.get(candidate);
  if (cached) {
    return cached;
  }

  return rememberProbePromise(localVersioningStatusCache, candidate, async () => {
    const cachedUrl = localSvnUrlCache.get(candidate);
    if (cachedUrl) {
      const resolvedUrl = await cachedUrl;
      if (resolvedUrl) {
        return 'versioned';
      }
    }

    const result = await runSvnUtf8(['status', candidate]);
    if (!result.ok) return 'unknown';

    const firstLine = result.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);

    if (!firstLine) return 'versioned';
    if (firstLine.startsWith('?') || firstLine.startsWith('I')) return 'unversioned';
    return 'versioned';
  });
}

export async function resolveWorkingCopyPathForTarget(
  args: { basePath: string; minePath: string },
  target: string,
): Promise<string> {
  const normalizedTarget = normalizeSvnUrlForCompare(target);
  if (!normalizedTarget) return '';

  const candidates = getCandidateLocalPaths(args);

  for (const candidatePath of candidates) {
    const resolved = await resolveLocalSvnUrl(candidatePath);
    if (!resolved) continue;
    if (normalizeSvnUrlForCompare(resolved) === normalizedTarget) {
      return candidatePath;
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Revision options query
// ---------------------------------------------------------------------------

export async function queryRevisionOptions(
  query: RevisionOptionsQuery | undefined,
): Promise<RevisionOptionsPayload> {
  const start = performance.now();
  const normalized = normalizeRevisionQuery(query);
  const cacheKey = buildRevisionQueryCacheKey(normalized);
  const shouldBypassCache = !normalized.beforeRevisionId && !normalized.anchorDateTime;
  const cached = shouldBypassCache ? null : cachedRevisionOptionPages.get(cacheKey);
  if (cached) return cached;

  const target = await resolveTimelineTargetUrl();
  const specials: SvnRevisionInfo[] = [];
  if (!target) {
    const payload: RevisionOptionsPayload = {
      items: specials,
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: normalized.anchorDateTime || null,
    };
    if (!shouldBypassCache) {
      rememberLimitedEntry(cachedRevisionOptionPages, cacheKey, payload, REVISION_OPTION_PAGES_CACHE_LIMIT);
    }
    logDebugTiming('revision-options:skip', {
      ms: Number((performance.now() - start).toFixed(1)),
      count: payload.items.length,
    });
    return payload;
  }

  if (normalized.beforeRevisionId) {
    const beforeNumber = getRevisionNumberValue(normalized.beforeRevisionId);
    if (beforeNumber != null && beforeNumber <= 1) {
      const payload: RevisionOptionsPayload = {
        items: specials,
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: normalized.anchorDateTime || null,
      };
      if (!shouldBypassCache) {
        rememberLimitedEntry(cachedRevisionOptionPages, cacheKey, payload, REVISION_OPTION_PAGES_CACHE_LIMIT);
      }
      return payload;
    }
  }

  const svnArgs = ['log', '--xml', '--limit', String(normalized.limit + 1)];
  if (normalized.beforeRevisionId) {
    const beforeNumber = getRevisionNumberValue(normalized.beforeRevisionId);
    if (beforeNumber != null) {
      svnArgs.push('-r', `${Math.max(1, beforeNumber - 1)}:1`);
    }
  } else if (normalized.anchorDateTime) {
    svnArgs.push('-r', `{${formatSvnDateQuery(normalized.anchorDateTime)}}:1`);
  }
  svnArgs.push(target);

  const result = await runSvnUtf8(svnArgs);
  if (!result.ok) {
    if (result.stderr.trim()) logMainWarn('svn-log', result.stderr.trim());
    const payload: RevisionOptionsPayload = {
      items: specials,
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: normalized.anchorDateTime || null,
    };
    if (!shouldBypassCache) {
      rememberLimitedEntry(cachedRevisionOptionPages, cacheKey, payload, REVISION_OPTION_PAGES_CACHE_LIMIT);
    }
    logDebugTiming('revision-options:fallback', {
      ms: Number((performance.now() - start).toFixed(1)),
      count: payload.items.length,
    });
    return payload;
  }

  const revisions = parseLogEntries(result.stdout);
  const hasMore = revisions.length > normalized.limit;
  const pageRevisions = revisions.slice(0, normalized.limit);
  const lastVisibleRevision = pageRevisions[pageRevisions.length - 1] ?? null;
  const payload: RevisionOptionsPayload = {
    items: [...specials, ...pageRevisions],
    hasMore,
    nextBeforeRevisionId: hasMore ? lastVisibleRevision?.id ?? null : null,
    anchorRevisionId: normalized.anchorDateTime ? (pageRevisions[0]?.id ?? null) : null,
    queryDateTime: normalized.anchorDateTime || null,
  };
  if (!shouldBypassCache) {
    rememberLimitedEntry(cachedRevisionOptionPages, cacheKey, payload, REVISION_OPTION_PAGES_CACHE_LIMIT);
  }
  logDebugTiming('revision-options:loaded', {
    ms: Number((performance.now() - start).toFixed(1)),
    count: payload.items.length,
    hasMore,
    nextBeforeRevisionId: payload.nextBeforeRevisionId,
    queryDateTime: payload.queryDateTime,
  });
  return payload;
}

export async function getRevisionOptions(): Promise<SvnRevisionInfo[]> {
  const payload = await queryRevisionOptions({
    limit: 60,
    includeSpecials: false,
  });
  return payload.items;
}

// ---------------------------------------------------------------------------
// File equality checks
// ---------------------------------------------------------------------------

async function compareOpenFiles(
  leftHandle: fs.promises.FileHandle,
  rightHandle: fs.promises.FileHandle,
  size: number,
): Promise<boolean> {
  const leftChunk = Buffer.allocUnsafe(FILE_EQUALITY_CHUNK_BYTES);
  const rightChunk = Buffer.allocUnsafe(FILE_EQUALITY_CHUNK_BYTES);
  let position = 0;

  while (position < size) {
    const expectedBytes = Math.min(FILE_EQUALITY_CHUNK_BYTES, size - position);
    const [{ bytesRead: leftBytesRead }, { bytesRead: rightBytesRead }] = await Promise.all([
      leftHandle.read(leftChunk, 0, expectedBytes, position),
      rightHandle.read(rightChunk, 0, expectedBytes, position),
    ]);
    if (leftBytesRead !== expectedBytes || rightBytesRead !== expectedBytes) {
      return false;
    }
    if (!leftChunk.subarray(0, leftBytesRead).equals(rightChunk.subarray(0, rightBytesRead))) {
      return false;
    }
    position += expectedBytes;
  }

  return true;
}

async function compareFileWithBytes(
  filePath: string,
  expectedBytes: Uint8Array,
  fileSize: number,
): Promise<boolean> {
  const handle = await fs.promises.open(filePath, 'r');
  const chunk = Buffer.allocUnsafe(FILE_EQUALITY_CHUNK_BYTES);
  let position = 0;

  try {
    while (position < fileSize) {
      const expectedLength = Math.min(FILE_EQUALITY_CHUNK_BYTES, fileSize - position);
      const { bytesRead } = await handle.read(chunk, 0, expectedLength, position);
      if (bytesRead !== expectedLength) {
        return false;
      }

      for (let index = 0; index < bytesRead; index += 1) {
        if (chunk[index] !== expectedBytes[position + index]) {
          return false;
        }
      }

      position += bytesRead;
    }

    return true;
  } finally {
    await handle.close();
  }
}

export async function haveSameLocalFileContents(
  leftPath: string,
  rightPath: string,
): Promise<boolean> {
  if (!leftPath || !rightPath) return false;
  if (leftPath === rightPath) return true;
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return false;

  try {
    const [leftStat, rightStat] = await Promise.all([
      fs.promises.stat(leftPath),
      fs.promises.stat(rightPath),
    ]);    
    if (leftStat.size !== rightStat.size) return false;

    const cacheKey = buildFileEqualityCacheKey(leftPath, rightPath);
    const cached = fileEqualityCache.get(cacheKey);
    if (
      cached
      && cached.leftPath === leftPath
      && cached.rightPath === rightPath
      && cached.leftMtimeMs === leftStat.mtimeMs
      && cached.rightMtimeMs === rightStat.mtimeMs
      && cached.leftSize === leftStat.size
      && cached.rightSize === rightStat.size
    ) {
      return cached.equal;
    }

    const [leftHandle, rightHandle] = await Promise.all([
      fs.promises.open(leftPath, 'r'),
      fs.promises.open(rightPath, 'r'),
    ]);
    let equal = false;
    try {
      equal = await compareOpenFiles(leftHandle, rightHandle, leftStat.size);
    } finally {
      await Promise.allSettled([
        leftHandle.close(),
        rightHandle.close(),
      ]);
    }

    rememberFileEquality(fileEqualityCache, cacheKey, {
      leftPath,
      rightPath,
      leftMtimeMs: leftStat.mtimeMs,
      rightMtimeMs: rightStat.mtimeMs,
      leftSize: leftStat.size,
      rightSize: rightStat.size,
      equal,
    }, FILE_EQUALITY_CACHE_LIMIT);
    return equal;
  } catch {
    return false;
  }
}

export async function haveSameLocalFileAndBytes(
  filePath: string,
  expectedBytes: Uint8Array | null,
): Promise<boolean> {
  if (!filePath || !expectedBytes) return false;
  if (!fs.existsSync(filePath)) return false;

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size !== expectedBytes.byteLength) {
      return false;
    }

    return compareFileWithBytes(filePath, expectedBytes, stat.size);
  } catch {
    return false;
  }
}

export async function getLocalWorkbookPairCacheContext(
  leftPath: string,
  rightPath: string,
  cacheScope: string,
): Promise<LocalWorkbookPairCacheContext | null> {
  if (!leftPath || !rightPath) return null;
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return null;

  try {
    const [leftStat, rightStat] = await Promise.all([
      fs.promises.stat(leftPath),
      fs.promises.stat(rightPath),
    ]);
    return {
      key: `${cacheScope}::${leftPath}::${rightPath}`,
      leftPath,
      rightPath,
      leftMtimeMs: leftStat.mtimeMs,
      rightMtimeMs: rightStat.mtimeMs,
      leftSize: leftStat.size,
      rightSize: rightStat.size,
    };
  } catch (error) {
    logMainDebug(
      'cache-context',
      'stat skipped:',
      leftPath,
      rightPath,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
