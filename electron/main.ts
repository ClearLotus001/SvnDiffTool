import { app, BrowserWindow } from 'electron';
import { EMPTY_CLI_ARGS, type CliArgs } from './cliArgs';
import { resolveLaunchCliArgsFromArgv } from './externalDiffRequest';
import { readInstallerBootstrapSync } from './installerBootstrap';
import { getMaintenanceModeFromArgv, runMaintenance } from './maintenance';
import {
  cleanupStaleManagedTempFilesSync,
  cleanupTrackedManagedTempFilesSync,
  configureRuntimePaths,
  getRuntimePathState,
} from './runtimePaths';
import { ensureLegacyUserDataMigration } from './userDataMigration';
import { DEV_PROFILE_ROOT } from './main/constants';
import { registerIpcHandlers } from './main/ipcHandlers';
import { writeExternalDiffDebugLog } from './main/logger';
import { initAppUpdater, setActiveCliArgs } from './main/state';
import {
  createWindow,
  focusMainWindow,
  notifyAppUpdateState,
  notifyCliArgsUpdated,
} from './main/windowManager';

// ---------------------------------------------------------------------------
// Early startup — executed at module load time
// ---------------------------------------------------------------------------

const maintenanceMode = getMaintenanceModeFromArgv(process.argv);
const installerBootstrap = readInstallerBootstrapSync(process.execPath);

configureRuntimePaths(app, DEV_PROFILE_ROOT, installerBootstrap);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let parsedStartupCliArgs: CliArgs | null = null;
let cliArgs: CliArgs = { ...EMPTY_CLI_ARGS };

const gotSingleInstanceLock = maintenanceMode ? true : app.requestSingleInstanceLock();

if (gotSingleInstanceLock) {
  parsedStartupCliArgs = resolveLaunchCliArgsFromArgv(process.argv);
  cliArgs = parsedStartupCliArgs ?? { ...EMPTY_CLI_ARGS };
  setActiveCliArgs(cliArgs);
}

writeExternalDiffDebugLog('process-start', {
  execPath: process.execPath,
  argv: process.argv,
  cwd: process.cwd(),
  maintenanceMode,
  gotSingleInstanceLock,
  parsedStartupCliArgs,
  activeCliArgs: cliArgs,
  logsPath: getRuntimePathState().logsPath,
});

// ---------------------------------------------------------------------------
// Register all IPC handlers (must happen before window creation)
// ---------------------------------------------------------------------------

registerIpcHandlers();

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (maintenanceMode) {
  ensureLegacyUserDataMigration();
  void app.whenReady().then(async () => {
    try {
      await runMaintenance(app, maintenanceMode, process.argv);
      app.quit();
    } catch (error) {
      console.error('[maintenance] failed', error);
      app.quit();
    }
  });
} else if (!gotSingleInstanceLock) {
  console.warn('[electron] single-instance lock denied; another SvnDiffTool instance is already running');
  writeExternalDiffDebugLog('single-instance-lock-denied', {
    argv: process.argv,
    parsedStartupCliArgs,
  });
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const nextArgs = resolveLaunchCliArgsFromArgv(commandLine);
    writeExternalDiffDebugLog('second-instance', {
      commandLine,
      parsedCliArgs: nextArgs,
    });
    if (nextArgs) {
      setActiveCliArgs(nextArgs);
      notifyCliArgsUpdated();
    }
    focusMainWindow();
  });

  ensureLegacyUserDataMigration();
  cleanupStaleManagedTempFilesSync();

  void app.whenReady().then(() => {
    writeExternalDiffDebugLog('app-ready', {
      logsPath: getRuntimePathState().logsPath,
      userDataPath: getRuntimePathState().userDataPath,
    });
    const updater = initAppUpdater(app);
    updater.subscribe((state) => {
      notifyAppUpdateState(state);
    });
    updater.initialize();
    createWindow();
  });
}

app.on('before-quit', () => {
  cleanupTrackedManagedTempFilesSync();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
