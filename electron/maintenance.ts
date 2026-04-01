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
} from './runtimePaths';
import {
  cleanupPreviousCacheRoot,
  cleanupRuntimeArtifactsForUninstall,
  migratePreviousCacheRoot,
} from './maintenancePaths';
import {
  configureSvnDiffViewer,
  getSvnDiffViewerStatus,
  restoreSvnDefaultDiffViewerConfiguration,
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

export function shouldDeleteAppDataFromArgv(argv: string[]): boolean {
  return argv.some((arg) => arg.trim() === '--delete-app-data');
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

function clearBootstrapArtifacts(app: App) {
  deleteFileSync(getInstallerBootstrapPath(app.getPath('exe')));
  deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
}

export async function runMaintenance(app: App, mode: MaintenanceMode, argv: string[] = process.argv): Promise<void> {
  const installerBootstrap = readInstallerBootstrapSync(app.getPath('exe'));
  const previousInstallerBootstrap = readPreviousInstallerBootstrapSync(app.getPath('exe'));
  const shouldDeleteAppData = shouldDeleteAppDataFromArgv(argv);

  if (mode === 'post-install') {
    cleanupStaleManagedTempFilesSync();
    migratePreviousCacheRoot(previousInstallerBootstrap, installerBootstrap);
    cleanupPreviousCacheRoot(previousInstallerBootstrap, installerBootstrap);
    await applyDesiredDiffViewerMode(installerBootstrap);
    deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
    return;
  }

  await restoreSvnDefaultDiffViewerConfiguration();

  if (shouldDeleteAppData) {
    const runtimePathState = getRuntimePathState();
    cleanupRuntimeArtifactsForUninstall({
      userDataPath: app.getPath('userData'),
      sessionDataPath: runtimePathState.sessionDataPath,
      currentCacheRoot: installerBootstrap?.cacheRoot ?? runtimePathState.cacheRoot,
      previousCacheRoot: previousInstallerBootstrap?.cacheRoot ?? null,
    });
  }
  clearBootstrapArtifacts(app);
}
