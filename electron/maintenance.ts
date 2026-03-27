import type { App } from 'electron';
import * as fs from 'node:fs';

import {
  type InstallerBootstrapConfig,
  type InstallerDiffViewerMode,
  getInstallerBootstrapPath,
  getPreviousInstallerBootstrapPath,
  readInstallerBootstrapSync,
  readPreviousInstallerBootstrapSync,
} from './installerBootstrap';
import {
  cleanupStaleManagedTempFilesSync,
  getRuntimePathState,
  removeControlledDirectorySync,
} from './runtimePaths';
import {
  configureSvnDiffViewer,
  getSvnDiffViewerStatus,
  restoreSvnDiffViewerConfiguration,
} from './svnDiffViewerConfig';

export type MaintenanceMode = 'post-install' | 'prepare-uninstall';

function isMaintenanceMode(value: string): value is MaintenanceMode {
  return value === 'post-install' || value === 'prepare-uninstall';
}

export function getMaintenanceModeFromArgv(argv: string[]): MaintenanceMode | null {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]?.trim() ?? '';
    if (!current) continue;

    if (current.startsWith('--maintenance=')) {
      const value = current.slice('--maintenance='.length).trim();
      return isMaintenanceMode(value) ? value : null;
    }

    if (current === '--maintenance') {
      const value = argv[index + 1]?.trim() ?? '';
      return isMaintenanceMode(value) ? value : null;
    }
  }

  return null;
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

function deleteFileSync(targetPath: string) {
  try {
    fs.rmSync(targetPath, { force: true });
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

function getDesiredDiffViewerScope(diffViewerMode: InstallerDiffViewerMode) {
  if (diffViewerMode === 'excel-only' || diffViewerMode === 'all-files') {
    return diffViewerMode;
  }
  return null;
}

async function applyDesiredDiffViewerMode(config: InstallerBootstrapConfig | null) {
  const desiredScope = getDesiredDiffViewerScope(config?.diffViewerMode ?? 'keep');
  if (!desiredScope) return;

  const status = await getSvnDiffViewerStatus();
  if (status.currentMode === desiredScope) return;
  await configureSvnDiffViewer(desiredScope);
}

function cleanupPreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
) {
  const previousCacheRoot = previousConfig?.cacheRoot ?? '';
  const currentCacheRoot = currentConfig?.cacheRoot ?? '';
  if (!previousCacheRoot || previousCacheRoot === currentCacheRoot) return;
  void removeControlledDirectorySync(previousCacheRoot);
}

function clearBootstrapArtifacts(app: App) {
  deleteFileSync(getInstallerBootstrapPath(app.getPath('exe')));
  deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
}

export async function runMaintenance(app: App, mode: MaintenanceMode): Promise<void> {
  const installerBootstrap = readInstallerBootstrapSync(app.getPath('exe'));
  const previousInstallerBootstrap = readPreviousInstallerBootstrapSync(app.getPath('exe'));

  if (mode === 'post-install') {
    cleanupStaleManagedTempFilesSync();
    cleanupPreviousCacheRoot(previousInstallerBootstrap, installerBootstrap);
    await applyDesiredDiffViewerMode(installerBootstrap);
    deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
    return;
  }

  await restoreSvnDiffViewerConfiguration();
  cleanupStaleManagedTempFilesSync();

  const runtimePathState = getRuntimePathState();
  removeDirectorySync(app.getPath('userData'));
  removeDirectorySync(runtimePathState.sessionDataPath);
  void removeControlledDirectorySync(installerBootstrap?.cacheRoot ?? runtimePathState.cacheRoot);
  void removeControlledDirectorySync(previousInstallerBootstrap?.cacheRoot);
  clearBootstrapArtifacts(app);
}
