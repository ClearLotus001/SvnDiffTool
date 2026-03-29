import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type DiffViewerMode = 'keep' | 'excel-only' | 'all-files';
type InstallStatus = 'idle' | 'running' | 'success' | 'error';
type InstallPhase = 'ready' | 'prepare' | 'install' | 'configure' | 'finalize' | 'done' | 'error';

interface InstallState {
  status: InstallStatus;
  phase: InstallPhase;
  progress: number;
  message: string;
  error: string;
}

interface WindowStatePayload {
  isMaximized: boolean;
}

interface SetupContext {
  productName: string;
  version: string;
  payloadReady: boolean;
  defaultInstallDir: string;
  defaultCacheParent: string;
  managedCacheRoot: string;
  iconPath: string;
}

interface InstallOptions {
  installDir: string;
  cacheParent: string;
  diffViewerMode: DiffViewerMode;
  createDesktopShortcut: boolean;
  launchAfterInstall: boolean;
}

const PRODUCT_NAME = 'SvnDiffTool';
const PRODUCT_EXE = 'SvnDiffTool.exe';
const PAYLOAD_EXE = 'SvnDiffTool-installer.exe';

let mainWindow: BrowserWindow | null = null;
let installTimer: NodeJS.Timeout | null = null;
let installChild: ChildProcess | null = null;
let installState: InstallState = {
  status: 'idle',
  phase: 'ready',
  progress: 0,
  message: '',
  error: '',
};

function resolveLocalAppData(): string {
  return process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local');
}

function getDefaultInstallDir(): string {
  return path.join(resolveLocalAppData(), 'Programs', PRODUCT_NAME);
}

function getDefaultCacheParent(): string {
  return resolveLocalAppData();
}

function getManagedCacheRoot(parentDir: string): string {
  return path.join(parentDir, PRODUCT_NAME, 'Cache');
}

function getPayloadInstallerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'payload', PAYLOAD_EXE);
  }

  return path.join(app.getAppPath(), '..', 'release', `SvnDiffTool-${app.getVersion()}.exe`);
}

function getIconPath(): string {
  return path.join(app.getAppPath(), 'assets', 'icon.png');
}

function emitInstallState(partial: Partial<InstallState>) {
  installState = {
    ...installState,
    ...partial,
  };

  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('bootstrapper-install-state', installState);
}

function getWindowState(): WindowStatePayload {
  return {
    isMaximized: Boolean(mainWindow?.isMaximized()),
  };
}

function notifyWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('bootstrapper-window-state', getWindowState());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 560,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    show: false,
    frame: false,
    backgroundColor: '#f2efe6',
    title: `${PRODUCT_NAME} Setup`,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('maximize', notifyWindowState);
  mainWindow.on('unmaximize', notifyWindowState);
  mainWindow.on('restore', notifyWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    notifyWindowState();
  });

  void mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function buildSilentInstallerArgs(options: InstallOptions): string[] {
  const args = ['/S'];

  args.push(`/DIFFMODE=${options.diffViewerMode}`);
  args.push(`/CACHEPARENT=${options.cacheParent}`);
  args.push(`/DESKTOPSHORTCUT=${options.createDesktopShortcut ? '1' : '0'}`);
  args.push('/LAUNCHAFTERINSTALL=0');
  args.push(`/D=${options.installDir}`);

  return args;
}

function beginProgressAnimation() {
  const phases: Array<{ upper: number; message: string; phase: InstallPhase }> = [
    { upper: 0.18, message: 'Checking installer payload', phase: 'prepare' },
    { upper: 0.34, message: 'Applying installation options', phase: 'prepare' },
    { upper: 0.74, message: 'Installing application files', phase: 'install' },
    { upper: 0.9, message: 'Writing integration and cache settings', phase: 'configure' },
    { upper: 0.96, message: 'Finalizing setup', phase: 'finalize' },
  ];

  installTimer = setInterval(() => {
    const currentProgress = installState.progress;
    const nextProgress = Math.min(0.96, currentProgress + 0.018);
    const activePhase = phases.find((item) => nextProgress <= item.upper) ?? phases[phases.length - 1];
    if (!activePhase) return;

    emitInstallState({
      progress: nextProgress,
      phase: activePhase.phase,
      message: activePhase.message,
    });
  }, 380);
}

function stopProgressAnimation() {
  if (!installTimer) return;
  clearInterval(installTimer);
  installTimer = null;
}

async function launchInstalledApp(installDir: string) {
  const installedAppPath = path.join(installDir, PRODUCT_EXE);
  if (!fs.existsSync(installedAppPath)) return;

  const child = spawn(installedAppPath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function startSilentInstall(options: InstallOptions) {
  if (installChild) {
    throw new Error('An installation is already running.');
  }

  const installerPath = getPayloadInstallerPath();
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Installer payload not found: ${installerPath}`);
  }

  emitInstallState({
    status: 'running',
    phase: 'prepare',
    progress: 0.08,
    message: 'Preparing installation',
    error: '',
  });

  const args = buildSilentInstallerArgs(options);
  const child = spawn(installerPath, args, {
    windowsHide: true,
    stdio: 'ignore',
  });

  installChild = child;
  beginProgressAnimation();

  return await new Promise<{ ok: true }>((resolve, reject) => {
    child.once('error', (error) => {
      stopProgressAnimation();
      installChild = null;
      emitInstallState({
        status: 'error',
        phase: 'error',
        progress: 0,
        message: 'Installation failed to start',
        error: error.message,
      });
      reject(error);
    });

    child.once('exit', (code) => {
      stopProgressAnimation();
      installChild = null;

      void (async () => {
        if (code !== 0) {
          const errorMessage = `Installer exited with code ${code ?? 'unknown'}.`;
          emitInstallState({
            status: 'error',
            phase: 'error',
            progress: 0,
            message: 'Installation failed',
            error: errorMessage,
          });
          reject(new Error(errorMessage));
          return;
        }

        emitInstallState({
          status: 'running',
          phase: 'finalize',
          progress: 0.98,
          message: 'Completing installation',
        });

        if (options.launchAfterInstall) {
          await launchInstalledApp(options.installDir);
        }

        emitInstallState({
          status: 'success',
          phase: 'done',
          progress: 1,
          message: options.launchAfterInstall
            ? 'Installation complete. SvnDiffTool has been launched.'
            : 'Installation complete.',
          error: '',
        });

        resolve({ ok: true });
      })().catch(reject);
    });
  });
}

function getSetupContext(): SetupContext {
  const defaultCacheParent = getDefaultCacheParent();
  return {
    productName: PRODUCT_NAME,
    version: app.getVersion(),
    payloadReady: fs.existsSync(getPayloadInstallerPath()),
    defaultInstallDir: getDefaultInstallDir(),
    defaultCacheParent,
    managedCacheRoot: getManagedCacheRoot(defaultCacheParent),
    iconPath: getIconPath(),
  };
}

void app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('bootstrapper-get-context', async () => getSetupContext());
ipcMain.handle('bootstrapper-pick-install-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose install folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('bootstrapper-pick-cache-parent', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose session and temp parent folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('bootstrapper-start-install', async (_event: IpcMainInvokeEvent, options: InstallOptions) => (
  startSilentInstall(options)
));
ipcMain.handle('bootstrapper-get-install-state', async () => installState);
ipcMain.handle('bootstrapper-open-path', async (_event: IpcMainInvokeEvent, targetPath: string) => {
  if (!targetPath.trim()) return;
  await shell.openPath(targetPath);
});
ipcMain.handle('bootstrapper-get-window-state', async () => getWindowState());
ipcMain.on('bootstrapper-window-minimize', () => mainWindow?.minimize());
ipcMain.on('bootstrapper-window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }
  mainWindow.maximize();
});
ipcMain.on('bootstrapper-window-close', () => mainWindow?.close());
