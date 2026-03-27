import type { App } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  getDefaultInstallerCacheRoot,
  isControlledCacheRoot,
  type InstallerBootstrapConfig,
} from './installerBootstrap';

const DISK_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const STALE_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TEMP_BUDGET_HARD_LIMIT_BYTES = 1024 * 1024 * 1024;
const TEMP_BUDGET_TARGET_BYTES = 512 * 1024 * 1024;

export interface RuntimePathState {
  cacheRoot: string | null;
  sessionDataPath: string | null;
  diskCachePath: string | null;
  tempRootPath: string | null;
  logsPath: string | null;
  userDataPath: string | null;
}

const trackedTempPaths = new Set<string>();

let runtimePathState: RuntimePathState = {
  cacheRoot: null,
  sessionDataPath: null,
  diskCachePath: null,
  tempRootPath: null,
  logsPath: null,
  userDataPath: null,
};

function ensureDirectorySync(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function createCacheSubpaths(cacheRoot: string) {
  return {
    cacheRoot,
    sessionDataPath: path.join(cacheRoot, 'session-data'),
    diskCachePath: path.join(cacheRoot, 'disk-cache'),
    tempRootPath: path.join(cacheRoot, 'temp'),
  };
}

function tryPrepareCacheRoot(cacheRoot: string) {
  const nextPaths = createCacheSubpaths(cacheRoot);
  try {
    ensureDirectorySync(nextPaths.cacheRoot);
    ensureDirectorySync(nextPaths.sessionDataPath);
    ensureDirectorySync(nextPaths.diskCachePath);
    ensureDirectorySync(nextPaths.tempRootPath);
    return nextPaths;
  } catch {
    return null;
  }
}

function resolveConfiguredCacheRoot(installerBootstrap: InstallerBootstrapConfig | null): string {
  if (installerBootstrap?.cacheRoot && isControlledCacheRoot(installerBootstrap.cacheRoot)) {
    return path.resolve(installerBootstrap.cacheRoot);
  }
  return getDefaultInstallerCacheRoot();
}

function cleanupEmptyDirectoriesSync(targetPath: string, stopAtPath: string) {
  let currentPath = targetPath;

  while (currentPath.startsWith(stopAtPath)) {
    if (currentPath === stopAtPath) break;

    try {
      const entries = fs.readdirSync(currentPath);
      if (entries.length > 0) break;
      fs.rmdirSync(currentPath);
    } catch {
      break;
    }

    currentPath = path.dirname(currentPath);
  }
}

interface FileEntryInfo {
  filePath: string;
  size: number;
  mtimeMs: number;
}

function collectFileEntriesSync(rootPath: string): FileEntryInfo[] {
  const entries: FileEntryInfo[] = [];
  const visit = (currentPath: string) => {
    let currentEntries: fs.Dirent[];
    try {
      currentEntries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    currentEntries.forEach((entry) => {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        return;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(entryPath);
      } catch {
        return;
      }

      entries.push({
        filePath: entryPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    });
  };

  visit(rootPath);
  return entries;
}

function removeFileEntrySync(filePath: string, stopAtPath: string) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    return false;
  }

  cleanupEmptyDirectoriesSync(path.dirname(filePath), stopAtPath);
  return true;
}

function enforceTempBudgetSync() {
  const tempRootPath = runtimePathState.tempRootPath;
  if (!tempRootPath || !fs.existsSync(tempRootPath)) return;

  const fileEntries = collectFileEntriesSync(tempRootPath)
    .filter((entry) => !trackedTempPaths.has(entry.filePath))
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  let totalBytes = fileEntries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= TEMP_BUDGET_HARD_LIMIT_BYTES) return;

  for (const entry of fileEntries) {
    if (totalBytes <= TEMP_BUDGET_TARGET_BYTES) break;
    if (!removeFileEntrySync(entry.filePath, tempRootPath)) continue;
    totalBytes -= entry.size;
  }
}

export function cleanupStaleManagedTempFilesSync(now = Date.now()) {
  const tempRootPath = runtimePathState.tempRootPath;
  if (!tempRootPath || !fs.existsSync(tempRootPath)) return;

  collectFileEntriesSync(tempRootPath).forEach((entry) => {
    if (trackedTempPaths.has(entry.filePath)) return;
    if ((now - entry.mtimeMs) < STALE_TEMP_MAX_AGE_MS) return;
    void removeFileEntrySync(entry.filePath, tempRootPath);
  });

  enforceTempBudgetSync();
}

export function configureRuntimePaths(
  app: App,
  devProfileRoot: string,
  installerBootstrap: InstallerBootstrapConfig | null,
): RuntimePathState {
  if (devProfileRoot) {
    const userDataPath = path.join(devProfileRoot, 'user-data');
    const sessionDataPath = path.join(devProfileRoot, 'session-data');
    const logsPath = path.join(devProfileRoot, 'logs');
    const diskCachePath = path.join(sessionDataPath, 'cache');
    const tempRootPath = path.join(devProfileRoot, 'temp');

    [userDataPath, sessionDataPath, logsPath, diskCachePath, tempRootPath].forEach(ensureDirectorySync);

    app.setPath('userData', userDataPath);
    app.setPath('sessionData', sessionDataPath);
    app.setPath('logs', logsPath);
    app.commandLine.appendSwitch('disk-cache-dir', diskCachePath);
    app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_MAX_BYTES));

    runtimePathState = {
      cacheRoot: path.join(devProfileRoot, 'cache'),
      sessionDataPath,
      diskCachePath,
      tempRootPath,
      logsPath,
      userDataPath,
    };
    return runtimePathState;
  }

  const preferredCacheRoot = resolveConfiguredCacheRoot(installerBootstrap);
  const preparedPaths = tryPrepareCacheRoot(preferredCacheRoot)
    ?? tryPrepareCacheRoot(getDefaultInstallerCacheRoot());

  if (!preparedPaths) {
    runtimePathState = {
      cacheRoot: null,
      sessionDataPath: null,
      diskCachePath: null,
      tempRootPath: null,
      logsPath: null,
      userDataPath: app.getPath('userData'),
    };
    return runtimePathState;
  }

  app.setPath('sessionData', preparedPaths.sessionDataPath);
  app.commandLine.appendSwitch('disk-cache-dir', preparedPaths.diskCachePath);
  app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_MAX_BYTES));

  runtimePathState = {
    cacheRoot: preparedPaths.cacheRoot,
    sessionDataPath: preparedPaths.sessionDataPath,
    diskCachePath: preparedPaths.diskCachePath,
    tempRootPath: preparedPaths.tempRootPath,
    logsPath: app.getPath('logs'),
    userDataPath: app.getPath('userData'),
  };

  return runtimePathState;
}

export function getRuntimePathState(): RuntimePathState {
  return runtimePathState;
}

function normalizeExtension(extension: string): string {
  if (!extension) return '.tmp';
  return extension.startsWith('.') ? extension : `.${extension}`;
}

export async function writeManagedTempFile(
  prefix: string,
  extension: string,
  contents: Buffer | Uint8Array,
): Promise<string> {
  const tempRootPath = runtimePathState.tempRootPath;
  if (!tempRootPath) {
    throw new Error('Managed temp root is not configured.');
  }

  ensureDirectorySync(tempRootPath);
  cleanupStaleManagedTempFilesSync();

  const tempFilePath = path.join(
    tempRootPath,
    `svn-diff-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${normalizeExtension(extension)}`,
  );

  await fs.promises.writeFile(tempFilePath, Buffer.from(contents));
  trackedTempPaths.add(tempFilePath);
  return tempFilePath;
}

export async function removeManagedTempFile(tempFilePath: string) {
  trackedTempPaths.delete(tempFilePath);
  await fs.promises.rm(tempFilePath, { force: true });

  const tempRootPath = runtimePathState.tempRootPath;
  if (tempRootPath) {
    cleanupEmptyDirectoriesSync(path.dirname(tempFilePath), tempRootPath);
  }
}

export function cleanupTrackedManagedTempFilesSync() {
  const tempRootPath = runtimePathState.tempRootPath;
  trackedTempPaths.forEach((tempFilePath) => {
    try {
      fs.rmSync(tempFilePath, { force: true });
    } catch {
      // Ignore best-effort cleanup failures.
    }

    if (tempRootPath) {
      cleanupEmptyDirectoriesSync(path.dirname(tempFilePath), tempRootPath);
    }
  });
  trackedTempPaths.clear();
}

export function removeControlledDirectorySync(targetPath: string | null | undefined): boolean {
  const normalized = targetPath?.trim() ? path.resolve(targetPath) : '';
  if (!normalized || !isControlledCacheRoot(normalized)) return false;

  try {
    fs.rmSync(normalized, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
