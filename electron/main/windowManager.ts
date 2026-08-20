import { BrowserWindow, screen } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_LAUNCH_MAXIMIZED, DEV_SERVER_URL, PRELOAD_PATH, RENDERER_DIST, USE_NATIVE_WINDOW_CONTROLS } from './constants.js';
import { writeExternalDiffDebugLog } from './logger.js';
import { logMainError } from '../logging.js';
import { getStartupPalette, readStartupAppearance } from './startupAppearance.js';
import { getMainWindow, setMainWindow } from './state.js';
import { resolveIconPath } from './svnHelpers.js';
import type { AppUpdateState } from './types.js';

const INITIAL_SHOW_FALLBACK_MS = 2500;
const WINDOWED_STARTUP_INSET = 14;
const WINDOW_CORNER_RADIUS = 18;
const NATIVE_ROUNDED_CORNERS_MIN_WINDOWS_BUILD = 22000;

function shouldEnablePerfBridge(): boolean {
  return process.env.SVN_DIFF_PERF_BRIDGE?.trim() === '1';
}

function getWindowsBuildNumber(): number {
  if (process.platform !== 'win32') return 0;
  const releaseParts = os.release().split('.');
  const buildPart = releaseParts[2] ?? releaseParts[releaseParts.length - 1] ?? '0';
  const buildNumber = Number.parseInt(buildPart, 10);
  return Number.isFinite(buildNumber) ? buildNumber : 0;
}

function supportsNativeRoundedCorners(): boolean {
  return process.platform === 'win32'
    && getWindowsBuildNumber() >= NATIVE_ROUNDED_CORNERS_MIN_WINDOWS_BUILD;
}

function shouldUseStableStartupBounds(): boolean {
  return process.platform === 'win32' && DEFAULT_LAUNCH_MAXIMIZED;
}

function getStartupWindowBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const horizontalInset = Math.min(
    Math.max(WINDOWED_STARTUP_INSET, Math.round(width * 0.012)),
    Math.max(0, Math.floor((width - 960) / 2)),
  );
  const verticalInset = Math.min(
    Math.max(WINDOWED_STARTUP_INSET, Math.round(height * 0.018)),
    Math.max(0, Math.floor((height - 640) / 2)),
  );

  return {
    x: x + horizontalInset,
    y: y + verticalInset,
    width: Math.max(900, width - (horizontalInset * 2)),
    height: Math.max(500, height - (verticalInset * 2)),
  };
}

function buildRoundedWindowShape(width: number, height: number, radius: number) {
  if (width <= 0 || height <= 0) return [];

  const safeRadius = Math.max(0, Math.min(radius, Math.floor(width / 2), Math.floor(height / 2)));
  if (safeRadius <= 0) {
    return [{ x: 0, y: 0, width, height }];
  }

  const rects: { x: number; y: number; width: number; height: number }[] = [];

  for (let y = 0; y < safeRadius; y += 1) {
    const distanceFromCornerCenter = safeRadius - y - 0.5;
    const inset = Math.max(
      0,
      Math.ceil(safeRadius - Math.sqrt(Math.max(0, (safeRadius * safeRadius) - (distanceFromCornerCenter * distanceFromCornerCenter)))),
    );
    const rowWidth = Math.max(0, width - (inset * 2));
    if (rowWidth <= 0) continue;

    rects.push({ x: inset, y, width: rowWidth, height: 1 });

    const mirroredY = height - y - 1;
    if (mirroredY !== y) {
      rects.push({ x: inset, y: mirroredY, width: rowWidth, height: 1 });
    }
  }

  const middleHeight = Math.max(0, height - (safeRadius * 2));
  if (middleHeight > 0) {
    rects.push({
      x: 0,
      y: safeRadius,
      width,
      height: middleHeight,
    });
  }

  return rects;
}

function applyRoundedShape(win: BrowserWindow): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return;
  if (supportsNativeRoundedCorners()) {
    win.setShape([]);
    return;
  }

  const isSnapped = typeof (win as BrowserWindow & { isSnapped?: () => boolean }).isSnapped === 'function'
    ? Boolean((win as BrowserWindow & { isSnapped: () => boolean }).isSnapped())
    : false;

  if (win.isMaximized() || win.isFullScreen() || isSnapped) {
    win.setShape([]);
    return;
  }

  const { width, height } = win.getBounds();
  win.setShape(buildRoundedWindowShape(width, height, WINDOW_CORNER_RADIUS));
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

function notifyWindowFrameState(): void {
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

function resolveInstalledUninstallerPath(app: Electron.App): string | null {
  if (process.platform !== 'win32' || !app.isPackaged) return null;

  const installDir = path.dirname(process.execPath);
  const executableName = path.basename(process.execPath);
  const candidates = [
    path.join(installDir, `Uninstall ${executableName}`),
    path.join(installDir, 'Uninstall Versora.exe'),
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
    thickFrame: true,
    frame: false,
    titleBarStyle: 'hidden',
    ...(titleBarOverlay ? { titleBarOverlay } : {}),
    backgroundColor: startupPalette.backgroundColor,
    ...(process.platform === 'win32' ? { roundedCorners: true } : {}),
    title: 'Versora',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: PRELOAD_PATH,
    },
    ...(iconPath ? { icon: iconPath } : {}),
  });
  writeExternalDiffDebugLog('window:create', {
    bounds: win.getBounds(),
    isDev: process.env.NODE_ENV === 'development',
    devServerUrl: process.env.NODE_ENV === 'development' ? DEV_SERVER_URL : null,
  });

  setMainWindow(win);

  if (DEFAULT_LAUNCH_MAXIMIZED && !stableStartupBounds) {
    win.maximize();
  }

  applyRoundedShape(win);

  win.on('resize', () => applyRoundedShape(win));
  win.on('maximize', () => applyRoundedShape(win));
  win.on('unmaximize', () => applyRoundedShape(win));
  win.on('enter-full-screen', () => applyRoundedShape(win));
  win.on('leave-full-screen', () => applyRoundedShape(win));
  win.on('show', () => {
    writeExternalDiffDebugLog('window:show', {
      bounds: win.getBounds(),
      visible: win.isVisible(),
    });
  });
  win.on('hide', () => {
    writeExternalDiffDebugLog('window:hide', {
      visible: win.isVisible(),
    });
  });
  win.on('closed', () => {
    writeExternalDiffDebugLog('window:closed');
  });

  if (process.env.NODE_ENV === 'development') {
    const targetUrl = shouldEnablePerfBridge()
      ? `${DEV_SERVER_URL}${DEV_SERVER_URL.includes('?') ? '&' : '?'}__perf=1`
      : DEV_SERVER_URL;
    void win.loadURL(targetUrl);
    if (process.env.OPEN_ELECTRON_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'), shouldEnablePerfBridge()
      ? { query: { __perf: '1' } }
      : undefined);
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
    applyRoundedShape(current);
    writeExternalDiffDebugLog('window:ready-to-show', {
      bounds: current.getBounds(),
      visible: current.isVisible(),
    });
    // Keep the window hidden until the renderer explicitly reports that the
    // React shell has painted; `ready-to-show` can fire while only the boot
    // document is visible, which causes a first-frame flash on Windows.
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
    applyRoundedShape(win);
    writeExternalDiffDebugLog('window:did-finish-load', {
      url: win.webContents.getURL(),
    });
    notifyWindowFrameState();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logMainError('electron', 'failed to load window', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
}
