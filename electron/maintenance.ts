import type { App } from 'electron';
import * as fs from 'node:fs';

import {
  clearInstallerMaintenancePendingSync,
  type InstallerBootstrapConfig,
  getInstallerBootstrapPath,
  getPreviousInstallerBootstrapPath,
  hasInstallerMaintenancePendingSync,
  readInstallerBootstrapSync,
  readPreviousInstallerBootstrapSync,
  updateInstallerBootstrapDiffViewerMode,
} from './installerBootstrap';
import {
  cleanupStaleManagedTempFilesSync,
  getRuntimePathState,
} from './runtimePaths';
import {
  cleanupRuntimeArtifactsForUninstall,
  migrateAndCleanupPreviousCacheRoot,
} from './maintenancePaths';
import type {
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from './svnDiffViewerConfig';
import {
  resolveEffectiveSvnDiffViewerPreference,
  resolveInstallerDiffViewerScope,
  writeSvnDiffViewerPreference,
} from './svnDiffViewerPreferences';
import { normalizeSvnDiffViewerScope } from './svnDiffViewerConfigShared';

export type MaintenanceMode = 'post-install' | 'prepare-uninstall';
type SvnDiffViewerConfigModule = {
  configureSvnDiffViewer: (scope: SvnDiffViewerScope) => Promise<SvnDiffViewerStatus>;
  getSvnDiffViewerStatus: () => Promise<SvnDiffViewerStatus>;
  restoreSvnDefaultDiffViewerConfiguration: (options?: { rememberPreference?: boolean }) => Promise<SvnDiffViewerStatus>;
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

async function rememberDesiredDiffViewerScope(app: App, scope: SvnDiffViewerScope) {
  await writeSvnDiffViewerPreference(app.getPath('userData'), scope);

  try {
    await updateInstallerBootstrapDiffViewerMode(scope, app.getPath('exe'));
  } catch {
    // The userData preference is enough for future startup reconciliation.
  }
}

async function applyDesiredDiffViewerMode(
  app: App,
  config: InstallerBootstrapConfig | null,
  options: { allowInstallerOverride?: boolean } = {},
) {
  const {
    configureSvnDiffViewer,
    getSvnDiffViewerStatus,
  }: SvnDiffViewerConfigModule = await import('./svnDiffViewerConfig.js');

  const installerOverrideScope = options.allowInstallerOverride
    ? resolveInstallerDiffViewerScope(config?.diffViewerMode ?? null)
    : null;
  const preference = installerOverrideScope
    ? {
      desiredScope: installerOverrideScope,
      source: 'installer-bootstrap' as const,
    }
    : resolveEffectiveSvnDiffViewerPreference(app.getPath('userData'), config);
  if (!preference.desiredScope) {
    if (preference.source !== 'none') return;

    const currentStatus = await getSvnDiffViewerStatus();
    const currentScope = normalizeSvnDiffViewerScope(currentStatus.currentMode);
    if (currentStatus.available && currentScope) {
      await rememberDesiredDiffViewerScope(app, currentScope);
    }
    return;
  }

  if (preference.source === 'installer-bootstrap') {
    await rememberDesiredDiffViewerScope(app, preference.desiredScope);
  }

  const status = await getSvnDiffViewerStatus();
  if (status.currentMode === preference.desiredScope) return;
  await configureSvnDiffViewer(preference.desiredScope);
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
  if (!migrateAndCleanupPreviousCacheRoot(previousInstallerBootstrap, installerBootstrap)) {
    throw new Error('Unable to safely migrate the previous managed cache root.');
  }
  await applyDesiredDiffViewerMode(app, installerBootstrap, {
    allowInstallerOverride: previousInstallerBootstrap == null,
  });
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

export async function runStartupSvnDiffViewerMaintenance(app: App): Promise<boolean> {
  const didRunPostInstallMaintenance = await runPendingPostInstallMaintenance(app);
  if (didRunPostInstallMaintenance) return true;

  await applyDesiredDiffViewerMode(app, readInstallerBootstrapSync(app.getPath('exe')));
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
  await restoreSvnDefaultDiffViewerConfiguration({ rememberPreference: false });

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
