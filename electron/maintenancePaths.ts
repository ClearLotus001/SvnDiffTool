import * as fs from 'node:fs';
import * as path from 'node:path';

import { isControlledCacheRoot, type InstallerBootstrapConfig } from './installerBootstrap';
import { removeControlledDirectorySync } from './runtimePaths';

const CACHE_SUBDIRECTORIES_TO_MIGRATE = ['session-data', 'disk-cache'] as const;

export interface UninstallCleanupPaths {
  userDataPath?: string | null;
  sessionDataPath?: string | null;
  currentCacheRoot?: string | null;
  previousCacheRoot?: string | null;
}

function removeDirectorySync(targetPath: string | null | undefined) {
  const normalized = targetPath?.trim();
  if (!normalized) return false;

  try {
    fs.rmSync(normalized, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function cleanupPreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
) {
  const previousCacheRoot = previousConfig?.cacheRoot ?? '';
  const currentCacheRoot = currentConfig?.cacheRoot ?? '';
  if (!previousCacheRoot || previousCacheRoot === currentCacheRoot) return;
  void removeControlledDirectorySync(previousCacheRoot);
}

export function migratePreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
) {
  const previousCacheRoot = previousConfig?.cacheRoot?.trim() ?? '';
  const currentCacheRoot = currentConfig?.cacheRoot?.trim() ?? '';

  if (!previousCacheRoot || !currentCacheRoot || previousCacheRoot === currentCacheRoot) return;
  if (!isControlledCacheRoot(previousCacheRoot) || !isControlledCacheRoot(currentCacheRoot)) return;
  if (!fs.existsSync(previousCacheRoot)) return;

  CACHE_SUBDIRECTORIES_TO_MIGRATE.forEach((directoryName) => {
    const sourcePath = path.join(previousCacheRoot, directoryName);
    if (!fs.existsSync(sourcePath)) return;

    const targetPath = path.join(currentCacheRoot, directoryName);
    try {
      fs.mkdirSync(targetPath, { recursive: true });
      fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    } catch (error) {
      console.warn(`[maintenance] failed to migrate ${directoryName}`, error);
    }
  });
}

export function cleanupRuntimeArtifactsForUninstall(paths: UninstallCleanupPaths) {
  removeDirectorySync(paths.userDataPath);
  removeDirectorySync(paths.sessionDataPath);
  void removeControlledDirectorySync(paths.currentCacheRoot);
  void removeControlledDirectorySync(paths.previousCacheRoot);
}
