import { BrowserWindow, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_LAUNCH_MAXIMIZED, DEV_SERVER_URL, PRELOAD_PATH, RENDERER_DIST, USE_NATIVE_WINDOW_CONTROLS } from './constants.js';
import { getStartupPalette, readStartupAppearance } from './startupAppearance.js';
import { getMainWindow, setMainWindow } from './state.js';
import { resolveIconPath } from './svnHelpers.js';
import type { AppUpdateState } from './types.js';

const INITIAL_SHOW_FALLBACK_MS = 2500;

function shouldUseStableStartupBounds(): boolean {
  return process.platform === 'win32' && DEFAULT_LAUNCH_MAXIMIZED;
}

function getStartupWindowBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return display.workArea;
}

function revealWindow(win: BrowserWindow, options?: { focus?: boolean }): void {
  if (win.isDestroyed()) return;
  if (!win.isVisible()) {
    win.show();
  }
  if (options?.focus) {
    win.focus();
  }
  notifyWindowFrameState();
}

// ---------------------------------------------------------------------------
// Window notifications
// ---------------------------------------------------------------------------

export function notifyAppUpdateState(state: AppUpdateState): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('app-update-state-changed', state);
}

export function notifyWindowFrameState(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window-frame-state-changed', {
    isMaximized: win.isMaximized(),
  });
}

export function notifyCliArgsUpdated(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('cli-args-updated');
}

export function focusMainWindow(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  revealWindow(win, { focus: true });
}

export function showMainWindow(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  revealWindow(win);
}

// ---------------------------------------------------------------------------
// Uninstaller helpers
// ---------------------------------------------------------------------------

export function resolveInstalledUninstallerPath(app: Electron.App): string | null {
  if (process.platform !== 'win32' || !app.isPackaged) return null;

  const installDir = path.dirname(process.execPath);
  const executableName = path.basename(process.execPath);
  const candidates = [
    path.join(installDir, `Uninstall ${executableName}`),
    path.join(installDir, 'Uninstall SvnDiffTool.exe'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

export async function launchInstalledUninstaller(
  app: Electron.App,
  silent?: boolean,
): Promise<void> {
  const uninstallerPath = resolveInstalledUninstallerPath(app);
  if (!uninstallerPath) {
    throw new Error('The installed uninstaller could not be found.');
  }

  const { spawn: nodeSpawn } = await import('node:child_process');

  if (silent) {
    return new Promise<void>((resolve, reject) => {
      const child = nodeSpawn(uninstallerPath, ['/S'], {
        windowsHide: true,
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Uninstall exit code ${code}`));
      });
      child.on('error', reject);
    });
  }

  const child = nodeSpawn(uninstallerPath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  setTimeout(() => {
    app.quit();
  }, 150);
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

export function createWindow(): void {
  const iconPath = resolveIconPath();
  const startupAppearance = readStartupAppearance();
  const startupPalette = getStartupPalette(startupAppearance.themeKey);
  const titleBarOverlay = USE_NATIVE_WINDOW_CONTROLS
    ? {
        color: startupPalette.titleBarColor,
        symbolColor: startupPalette.titleBarSymbolColor,
        height: 44,
      }
    : undefined;
  const stableStartupBounds = shouldUseStableStartupBounds() ? getStartupWindowBounds() : null;

  const win = new BrowserWindow({
    width: stableStartupBounds?.width ?? 1440,
    height: stableStartupBounds?.height ?? 900,
    ...(stableStartupBounds ? { x: stableStartupBounds.x, y: stableStartupBounds.y } : {}),
    minWidth: 900,
    minHeight: 500,
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    thickFrame: process.platform === 'win32' ? false : true,
    frame: false,
    titleBarStyle: 'hidden',
    ...(titleBarOverlay ? { titleBarOverlay } : {}),
    backgroundColor: startupPalette.backgroundColor,
    ...(process.platform === 'win32' ? { roundedCorners: false } : {}),
    title: 'SvnDiffTool',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: PRELOAD_PATH,
    },
    ...(iconPath ? { icon: iconPath } : {}),
  });

  setMainWindow(win);

  if (DEFAULT_LAUNCH_MAXIMIZED && !stableStartupBounds) {
    win.maximize();
  }

  if (process.env.NODE_ENV === 'development') {
    void win.loadURL(DEV_SERVER_URL);
    if (process.env.OPEN_ELECTRON_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.on('maximize', notifyWindowFrameState);
  win.on('unmaximize', notifyWindowFrameState);
  win.on('restore', notifyWindowFrameState);

  win.on('closed', () => {
    clearTimeout(initialShowFallbackTimer);
    setMainWindow(null);
  });

  win.once('ready-to-show', () => {
    const current = getMainWindow();
    if (!current || current.isDestroyed()) return;
    revealWindow(current);
    notifyWindowFrameState();
  });

  const initialShowFallbackTimer = setTimeout(() => {
    const current = getMainWindow();
    if (!current || current.isDestroyed()) return;
    revealWindow(current);
  }, INITIAL_SHOW_FALLBACK_MS);

  win.once('show', () => {
    clearTimeout(initialShowFallbackTimer);
  });

  win.webContents.on('did-finish-load', () => {
    notifyWindowFrameState();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] failed to load window', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
}
