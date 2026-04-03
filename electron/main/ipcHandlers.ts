import { clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AUTO_EXIT_AFTER_LOAD_MS, USE_NATIVE_WINDOW_CONTROLS } from './constants.js';
import { logDebugTiming } from './logger.js';
import { getAppUpdater, getMainWindow } from './state.js';
import { getStartupPalette, readStartupAppearance, writeStartupAppearance } from './startupAppearance.js';
import {
  buildDiffData,
  buildDevWorkingCopyDiffData,
  buildLocalDiffData,
  loadWorkbookCompareModeData,
  loadWorkbookMetadataData,
} from './diffBuilder.js';
import { getRevisionOptions, queryRevisionOptions } from './svnOperations.js';
import {
  configureSvnDiffViewer,
  getSvnDiffViewerStatus,
  restoreSvnDefaultDiffViewerConfiguration,
} from '../svnDiffViewerConfig.js';
import {
  launchInstalledUninstaller,
  showMainWindow,
} from './windowManager.js';
import { app } from 'electron';
import type {
  LaunchStatePayload,
  RevisionOptionsQuery,
  SvnDiffViewerScope,
  TitleBarOverlayPayload,
  WorkbookCompareMode,
} from './types.js';

// ---------------------------------------------------------------------------
// Safe IPC handler wrapper
// ---------------------------------------------------------------------------

function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ipc:${channel}] handler error:`, message);
      throw new Error(message);
    }
  });
}

let launchStateInFlight:
  | { compareMode: WorkbookCompareMode; promise: Promise<LaunchStatePayload> }
  | null = null;

function getWindowFrameStateSnapshot() {
  return {
    isMaximized: Boolean(getMainWindow()?.isMaximized()),
  };
}

function buildDiagnosticReportFileName(defaultFileName?: string): string {
  const fallbackName = `svndiff-renderer-error-${new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')}.log`;
  const rawName = typeof defaultFileName === 'string' && defaultFileName.trim()
    ? defaultFileName.trim()
    : fallbackName;

  return rawName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
}

// ---------------------------------------------------------------------------
// Register all IPC handlers
// ---------------------------------------------------------------------------

export function registerIpcHandlers(): void {
  safeHandle('get-launch-state', async (_, ...args: unknown[]) => {
    const payload = args[0] as { compareMode?: WorkbookCompareMode } | undefined;
    const compareMode = payload?.compareMode ?? 'strict';

    if (launchStateInFlight?.compareMode === compareMode) {
      return launchStateInFlight.promise;
    }

    const promise = (async (): Promise<LaunchStatePayload> => ({
      diffData: await buildDiffData({
        workbookCompareMode: compareMode,
      }),
      isDevMode: process.env.NODE_ENV === 'development',
      usesNativeWindowControls: USE_NATIVE_WINDOW_CONTROLS,
      windowFrameState: getWindowFrameStateSnapshot(),
      updateState: getAppUpdater().getState(),
    }))();

    launchStateInFlight = {
      compareMode,
      promise,
    };

    try {
      return await promise;
    } finally {
      if (launchStateInFlight?.promise === promise) {
        launchStateInFlight = null;
      }
    }
  });

  safeHandle('get-diff-data', async (_, ...args: unknown[]) => {
    const payload = args[0] as { compareMode?: WorkbookCompareMode } | undefined;
    return buildDiffData({
      workbookCompareMode: payload?.compareMode ?? 'strict',
    });
  });

  safeHandle('load-revision-diff', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      baseRevisionId?: string;
      mineRevisionId?: string;
      compareMode?: WorkbookCompareMode;
    } | undefined;
    return buildDiffData({
      baseRevisionId: payload?.baseRevisionId,
      mineRevisionId: payload?.mineRevisionId,
      workbookCompareMode: payload?.compareMode ?? 'strict',
    });
  });

  safeHandle('get-revision-options', async () => getRevisionOptions());

  safeHandle('query-revision-options', async (_, ...args: unknown[]) => {
    const payload = args[0] as RevisionOptionsQuery | undefined;
    return queryRevisionOptions(payload);
  });

  safeHandle('load-workbook-compare-mode', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      compareMode?: WorkbookCompareMode;
      baseRevisionId?: string;
      mineRevisionId?: string;
    } | undefined;
    return loadWorkbookCompareModeData(
      payload?.compareMode ?? 'strict',
      payload?.baseRevisionId,
      payload?.mineRevisionId,
    );
  });

  safeHandle('load-workbook-metadata', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      baseRevisionId?: string;
      mineRevisionId?: string;
    } | undefined;
    return loadWorkbookMetadataData(
      payload?.baseRevisionId,
      payload?.mineRevisionId,
    );
  });

  safeHandle('is-dev-mode', () => process.env.NODE_ENV === 'development');

  safeHandle('pick-diff-file', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select working copy file',
      properties: ['openFile'],
    });

    const selectedPath = result.canceled ? '' : (result.filePaths[0] ?? '');
    if (!selectedPath) return null;
    return {
      path: selectedPath,
      name: path.basename(selectedPath),
    };
  });

  safeHandle('load-dev-working-copy-diff', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      filePath?: string;
      compareMode?: WorkbookCompareMode;
    } | undefined;
    return buildDevWorkingCopyDiffData(payload?.filePath ?? '', payload?.compareMode ?? 'strict');
  });

  safeHandle('load-local-diff', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      basePath?: string;
      minePath?: string;
      compareMode?: WorkbookCompareMode;
    } | undefined;
    return buildLocalDiffData(payload?.basePath ?? '', payload?.minePath ?? '', payload?.compareMode ?? 'strict');
  });

  safeHandle('get-svn-diff-viewer-status', async () => getSvnDiffViewerStatus());

  safeHandle('configure-svn-diff-viewer', async (_, ...args: unknown[]) => {
    const payload = args[0] as { scope?: SvnDiffViewerScope } | undefined;
    return configureSvnDiffViewer(payload?.scope ?? 'excel-only');
  });

  safeHandle('restore-svn-default-diff-viewer-configuration', async () => (
    restoreSvnDefaultDiffViewerConfiguration()
  ));

  safeHandle('get-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
  safeHandle('uses-native-window-controls', () => USE_NATIVE_WINDOW_CONTROLS);

  safeHandle('get-window-frame-state', () => getWindowFrameStateSnapshot());

  safeHandle('get-update-state', () => getAppUpdater().getState());

  safeHandle('check-app-update', async (_, ...args: unknown[]) => {
    const payload = args[0] as { manual?: boolean } | undefined;
    return getAppUpdater().checkForUpdates({ manual: payload?.manual ?? false });
  });

  safeHandle('download-app-update', async () => getAppUpdater().downloadUpdate());
  safeHandle('install-downloaded-update', async () => getAppUpdater().installUpdate());

  safeHandle('launch-uninstaller', async (_, ...args: unknown[]) => {
    const payload = args[0] as { silent?: boolean } | undefined;
    return launchInstalledUninstaller(app, payload?.silent);
  });

  safeHandle('save-diagnostic-report', async (_, ...args: unknown[]) => {
    const payload = args[0] as {
      content?: string;
      defaultFileName?: string;
    } | undefined;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    if (!content.trim()) {
      throw new Error('Diagnostic report is empty.');
    }

    const suggestedFileName = buildDiagnosticReportFileName(payload?.defaultFileName);
    const targetWindow = getMainWindow();
    const pickDirectoryOptions: Electron.OpenDialogOptions = {
      title: '选择导出目录',
      defaultPath: app.getPath('desktop'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const directoryResult = targetWindow
      ? await dialog.showOpenDialog(targetWindow, pickDirectoryOptions)
      : await dialog.showOpenDialog(pickDirectoryOptions);

    const targetDirectory = directoryResult.canceled ? '' : (directoryResult.filePaths[0] ?? '');
    if (!targetDirectory) {
      return null;
    }

    const targetPath = path.join(targetDirectory, suggestedFileName);
    await fs.writeFile(targetPath, content, 'utf-8');
    return targetPath;
  });

  // ---------------------------------------------------------------------------
  // Fire-and-forget IPC (ipcMain.on)
  // ---------------------------------------------------------------------------

  ipcMain.on('clipboard-write-text', (_, text: unknown) => {
    if (typeof text === 'string') {
      clipboard.writeText(text);
    }
  });

  ipcMain.on('renderer-ready', () => {
    showMainWindow();
  });

  ipcMain.on('save-startup-appearance', (_, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const appearance = payload as { themeKey?: 'dark' | 'light' | 'hc'; locale?: 'zh-CN' | 'en-US' };
    const nextAppearance: {
      themeKey?: 'dark' | 'light' | 'hc';
      locale?: 'zh-CN' | 'en-US';
    } = {};
    if (appearance.themeKey) {
      nextAppearance.themeKey = appearance.themeKey;
    }
    if (appearance.locale) {
      nextAppearance.locale = appearance.locale;
    }
    writeStartupAppearance(nextAppearance);

    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    const resolvedAppearance = readStartupAppearance();
    const palette = getStartupPalette(resolvedAppearance.themeKey);
    win.setBackgroundColor(palette.backgroundColor);

    if (USE_NATIVE_WINDOW_CONTROLS) {
      win.setTitleBarOverlay({
        color: palette.titleBarColor,
        symbolColor: palette.titleBarSymbolColor,
        height: 44,
      });
    }
  });

  ipcMain.on('set-title-bar-overlay', (_, payload: TitleBarOverlayPayload | undefined) => {
    const win = getMainWindow();
    if (!USE_NATIVE_WINDOW_CONTROLS || !win || win.isDestroyed()) return;
    const color = typeof payload?.color === 'string' ? payload.color : '#f2efe6';
    const symbolColor = typeof payload?.symbolColor === 'string' ? payload.symbolColor : '#141413';
    const rawHeight = typeof payload?.height === 'number' ? payload.height : Number(payload?.height);
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 44;
    win.setTitleBarOverlay({
      color,
      symbolColor,
      height,
    });
  });

  ipcMain.on('debug-log', (_, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const message = typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : '';
    if (!message) return;
    logDebugTiming(`renderer:${message}`, (payload as { payload?: unknown }).payload);
    if (AUTO_EXIT_AFTER_LOAD_MS > 0 && message === 'apply-diff-data:done') {
      setTimeout(() => {
        app.quit();
      }, AUTO_EXIT_AFTER_LOAD_MS);
    }
  });

  ipcMain.on('window-minimize', () => getMainWindow()?.minimize());
  ipcMain.on('window-maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
  });
  ipcMain.on('window-close', () => getMainWindow()?.close());

  ipcMain.on('open-external', (_, url: unknown) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      void shell.openExternal(url);
    }
  });
}
