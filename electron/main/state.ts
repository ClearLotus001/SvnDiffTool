import type { BrowserWindow } from 'electron';
import { EMPTY_CLI_ARGS } from '../cliArgs.js';
import { createPlatformUpdater } from '../updater/index.js';
import { writeExternalDiffDebugLog } from './logger.js';
import { clearSvnProbeCaches } from './svnProbeCache.js';
import type {
  CliArgs,
  FileEqualityCacheEntry,
  FilePayloadCacheEntry,
  RevisionOptionsPayload,
  RevisionPayloadCacheEntry,
  ResolvedWorkbookCompareModePayload,
  WorkbookCompareCacheEntry,
  WorkbookMetadataCacheEntry,
  WorkbookMetadataPayload,
} from './types.js';

// ---------------------------------------------------------------------------
// Mutable singletons — accessed via getter/setter pairs because CJS cannot
// re-export `let` bindings.
// ---------------------------------------------------------------------------

let _mainWindow: BrowserWindow | null = null;
let _cachedSvnTarget: string | null | undefined;
let _cachedTimelineTarget: string | null | undefined;
let _activeCliArgs: CliArgs = { ...EMPTY_CLI_ARGS };

export function getMainWindow(): BrowserWindow | null {
  return _mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
  _mainWindow = win;
}

export function getCachedSvnTarget(): string | null | undefined {
  return _cachedSvnTarget;
}

export function setCachedSvnTarget(value: string | null | undefined): void {
  _cachedSvnTarget = value;
}

export function getCachedTimelineTarget(): string | null | undefined {
  return _cachedTimelineTarget;
}

export function setCachedTimelineTarget(value: string | null | undefined): void {
  _cachedTimelineTarget = value;
}

export function getActiveCliArgs(): CliArgs {
  return _activeCliArgs;
}

export function setActiveCliArgs(nextArgs: CliArgs): void {
  _activeCliArgs = { ...nextArgs };
  _cachedSvnTarget = undefined;
  _cachedTimelineTarget = undefined;
  cachedRevisionOptionPages.clear();
  clearSvnProbeCaches();
  writeExternalDiffDebugLog('active-cli-args-updated', _activeCliArgs);
}

// ---------------------------------------------------------------------------
// Map caches — exported directly; consumers use the Map API.
// ---------------------------------------------------------------------------

export const cachedRevisionOptionPages = new Map<string, RevisionOptionsPayload>();

export const filePayloadCache = new Map<string, FilePayloadCacheEntry>();

export const revisionPayloadCache = new Map<string, RevisionPayloadCacheEntry>();

export const fileEqualityCache = new Map<string, FileEqualityCacheEntry>();

export const workbookCompareCache = new Map<string, WorkbookCompareCacheEntry>();

export const workbookCompareInFlight = new Map<string, Promise<ResolvedWorkbookCompareModePayload | null>>();

export const workbookMetadataCache = new Map<string, WorkbookMetadataCacheEntry>();

export const workbookMetadataInFlight = new Map<string, Promise<WorkbookMetadataPayload>>();

// ---------------------------------------------------------------------------
// App updater singleton — must be initialised lazily after `app` is available.
// We accept the `app` reference at creation time via `initAppUpdater`.
// ---------------------------------------------------------------------------

let _appUpdater: ReturnType<typeof createPlatformUpdater> | null = null;

export function initAppUpdater(electronApp: Electron.App): ReturnType<typeof createPlatformUpdater> {
  if (!_appUpdater) {
    _appUpdater = createPlatformUpdater({ app: electronApp });
  }
  return _appUpdater;
}

export function getAppUpdater(): ReturnType<typeof createPlatformUpdater> {
  if (!_appUpdater) {
    throw new Error('appUpdater has not been initialised – call initAppUpdater(app) first');
  }
  return _appUpdater;
}
