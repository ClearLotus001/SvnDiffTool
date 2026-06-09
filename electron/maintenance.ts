import type { App } from 'electron';
import * as fs from 'node:fs';

import {
  clearInstallerMaintenancePendingSync,
  type InstallerBootstrapConfig,
  type InstallerDiffViewerMode,
  getInstallerBootstrapPath,
  getPreviousInstallerBootstrapPath,
  hasInstallerMaintenancePendingSync,
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
import type {
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from './svnDiffViewerConfig';

export type MaintenanceMode = 'post-install' | 'prepare-uninstall';
type SvnDiffViewerConfigModule = {
  configureSvnDiffViewer: (scope: SvnDiffViewerScope) => Promise<SvnDiffViewerStatus>;
  getSvnDiffViewerStatus: () => Promise<SvnDiffViewerStatus>;
  restoreSvnDefaultDiffViewerConfiguration: () => Promise<SvnDiffViewerStatus>;
};

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

export function wasLaunchedAfterUpdateFromArgv(argv: string[]): boolean {
  return argv.some((arg) => arg.trim() === '--updated');
}

function deleteFileSync(targetPath: string) {
  try {
    fs.rmSync(targetPath, { force: true });
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

function getDesiredDiffViewerScope(diffViewerMode: InstallerDiffViewerMode) {
  if (diffViewerMode === 'workbook-only' || diffViewerMode === 'text-only' || diffViewerMode === 'all-files') {
    return diffViewerMode;
  }
  return null;
}

async function applyDesiredDiffViewerMode(config: InstallerBootstrapConfig | null) {
  const desiredScope = getDesiredDiffViewerScope(config?.diffViewerMode ?? 'keep');
  if (!desiredScope) return;

  const {
    configureSvnDiffViewer,
    getSvnDiffViewerStatus,
  }: SvnDiffViewerConfigModule = await import('./svnDiffViewerConfig.js');
  const status = await getSvnDiffViewerStatus();
  if (status.currentMode === desiredScope) return;
  await configureSvnDiffViewer(desiredScope);
}

function clearBootstrapArtifacts(app: App) {
  deleteFileSync(getInstallerBootstrapPath(app.getPath('exe')));
  deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
  clearInstallerMaintenancePendingSync(app.getPath('exe'));
}

async function runPostInstallMaintenance(
  app: App,
  installerBootstrap: InstallerBootstrapConfig | null,
  previousInstallerBootstrap: InstallerBootstrapConfig | null,
) {
  cleanupStaleManagedTempFilesSync(Date.now(), { force: true });
  migratePreviousCacheRoot(previousInstallerBootstrap, installerBootstrap);
  cleanupPreviousCacheRoot(previousInstallerBootstrap, installerBootstrap);
  await applyDesiredDiffViewerMode(installerBootstrap);
  deleteFileSync(getPreviousInstallerBootstrapPath(app.getPath('exe')));
  clearInstallerMaintenancePendingSync(app.getPath('exe'));
}

export function hasPendingPostInstallMaintenance(execPath: string = process.execPath): boolean {
  return hasInstallerMaintenancePendingSync(execPath)
    || fs.existsSync(getPreviousInstallerBootstrapPath(execPath));
}

export async function runPendingPostInstallMaintenance(app: App): Promise<boolean> {
  const execPath = app.getPath('exe');
  if (!hasPendingPostInstallMaintenance(execPath)) {
    return false;
  }

  const installerBootstrap = readInstallerBootstrapSync(execPath);
  const previousInstallerBootstrap = readPreviousInstallerBootstrapSync(execPath);
  await runPostInstallMaintenance(app, installerBootstrap, previousInstallerBootstrap);
  return true;
}

export async function runMaintenance(app: App, mode: MaintenanceMode, argv: string[] = process.argv): Promise<void> {
  const installerBootstrap = readInstallerBootstrapSync(app.getPath('exe'));
  const previousInstallerBootstrap = readPreviousInstallerBootstrapSync(app.getPath('exe'));
  const shouldDeleteAppData = shouldDeleteAppDataFromArgv(argv);

  if (mode === 'post-install') {
    await runPostInstallMaintenance(app, installerBootstrap, previousInstallerBootstrap);
    return;
  }

  const {
    restoreSvnDefaultDiffViewerConfiguration,
  }: SvnDiffViewerConfigModule = await import('./svnDiffViewerConfig.js');
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
