import * as fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  FILE_EQUALITY_CACHE_LIMIT,
  FILE_EQUALITY_MAX_BYTES,
  REVISION_OPTION_PAGES_CACHE_LIMIT,
} from './constants.js';
import { rememberFileEquality, rememberLimitedEntry } from './cache.js';
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
import type {
  LocalWorkbookPairCacheContext,
  RevisionOptionsPayload,
  RevisionOptionsQuery,
  SvnRevisionInfo,
} from './types.js';

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
      writeExternalDiffDebugLog('resolve-svn-target', {
        mode: 'explicit-both',
        result: explicitMine,
      });
      return explicitMine;
    }
    setCachedSvnTarget(null);
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
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: explicitMine ? 'explicit-mine' : 'explicit-base',
      result: explicit,
    });
    return explicit;
  }

  const candidatePaths = Array.from(
    new Set([args.minePath, args.basePath].map(value => value.trim()).filter(Boolean)),
  );
  if (candidatePaths.length === 0) {
    setCachedSvnTarget(null);
    writeExternalDiffDebugLog('resolve-svn-target', {
      mode: 'no-candidates',
      result: '',
    });
    return '';
  }

  const resolvedTargets = Array.from(new Set((await Promise.all(
    candidatePaths.map(async (candidatePath) => {
      const result = await runSvnUtf8(['info', '--show-item', 'url', candidatePath]);
      return result.ok ? result.stdout.trim() : '';
    }),
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

  const args = getActiveCliArgs();
  const candidatePaths = [args.minePath, args.basePath]
    .map(value => value.trim())
    .filter(Boolean);

  for (const candidatePath of candidatePaths) {
    const versioningStatus = await detectLocalSvnVersioningStatus(candidatePath);
    if (versioningStatus !== 'versioned') continue;

    const result = await runSvnUtf8(['info', '--show-item', 'url', candidatePath]);
    if (!result.ok) continue;
    const resolved = result.stdout.trim();
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

  const result = await runSvnUtf8(['status', candidate]);
  if (!result.ok) return 'unknown';

  const firstLine = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);

  if (!firstLine) return 'versioned';
  if (firstLine.startsWith('?') || firstLine.startsWith('I')) return 'unversioned';
  return 'versioned';
}

export async function resolveWorkingCopyPathForTarget(
  args: { basePath: string; minePath: string },
  target: string,
): Promise<string> {
  const normalizedTarget = normalizeSvnUrlForCompare(target);
  if (!normalizedTarget) return '';

  const candidates = [args.minePath, args.basePath]
    .map(value => value.trim())
    .filter(Boolean);

  for (const candidatePath of candidates) {
    const versioningStatus = await detectLocalSvnVersioningStatus(candidatePath);
    if (versioningStatus !== 'versioned') continue;

    const result = await runSvnUtf8(['info', '--show-item', 'url', candidatePath]);
    if (!result.ok) continue;
    if (normalizeSvnUrlForCompare(result.stdout) === normalizedTarget) {
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
    if (result.stderr.trim()) console.warn('[svn-log]', result.stderr.trim());
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
    if (leftStat.size > FILE_EQUALITY_MAX_BYTES) return false;

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

    const [leftBuffer, rightBuffer] = await Promise.all([
      fs.promises.readFile(leftPath),
      fs.promises.readFile(rightPath),
    ]);
    const equal = leftBuffer.equals(rightBuffer);
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
    console.debug(
      '[cache-context] stat skipped:',
      leftPath,
      rightPath,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
