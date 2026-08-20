import { contextBridge, ipcRenderer, webUtils } from 'electron';

const versoraApi = {
  notifyRendererReady: () => ipcRenderer.send('renderer-ready'),
  saveStartupAppearance: (appearance: { themeKey?: 'dark' | 'light' | 'hc'; locale?: 'zh-CN' | 'en-US' }) => ipcRenderer.send('save-startup-appearance', appearance),
  getLaunchContext: () => ipcRenderer.invoke('get-launch-context'),
  getLaunchState: (compareMode?: 'strict' | 'content') => ipcRenderer.invoke('get-launch-state', { compareMode }),
  getDiffData: (compareMode?: 'strict' | 'content') => ipcRenderer.invoke('get-diff-data', { compareMode }),
  loadRevisionDiff: (baseRevisionId: string, mineRevisionId: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-revision-diff', { baseRevisionId, mineRevisionId, compareMode }),
  loadTwoFileRevisionDiff: (baseRevisionId: string, mineRevisionId: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-two-file-revision-diff', { baseRevisionId, mineRevisionId, compareMode }),
  loadLineBlame: (baseRevisionId?: string, mineRevisionId?: string) => ipcRenderer.invoke('load-line-blame', { baseRevisionId, mineRevisionId }),
  loadWorkingCopyLineBlame: (basePath: string, minePath: string) => ipcRenderer.invoke('load-working-copy-line-blame', { basePath, minePath }),
  loadTwoFileVersionLineBlame: (baseRevisionId: string, mineRevisionId: string) => ipcRenderer.invoke('load-two-file-version-line-blame', { baseRevisionId, mineRevisionId }),
  getRevisionOptions: () => ipcRenderer.invoke('get-revision-options'),
  queryRevisionOptions: (query?: {
    limit?: number;
    beforeRevisionId?: string;
    anchorDateTime?: string;
    includeSpecials?: boolean;
    targetSide?: 'base' | 'mine';
  }) => ipcRenderer.invoke('query-revision-options', query),
  loadWorkbookCompareMode: (compareMode: 'strict' | 'content', baseRevisionId?: string, mineRevisionId?: string) => ipcRenderer.invoke('load-workbook-compare-mode', { compareMode, baseRevisionId, mineRevisionId }),
  loadWorkbookMetadata: (baseRevisionId?: string, mineRevisionId?: string) => ipcRenderer.invoke('load-workbook-metadata', { baseRevisionId, mineRevisionId }),
  onCliArgsUpdated: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on('cli-args-updated', wrapped);
    return () => {
      ipcRenderer.removeListener('cli-args-updated', wrapped);
    };
  },
  isDevMode: () => ipcRenderer.invoke('is-dev-mode'),
  pickDiffFile: () => ipcRenderer.invoke('pick-diff-file'),
  pickComparableFile: (side: 'base' | 'mine', requiredExtension?: string) => ipcRenderer.invoke('pick-comparable-file', { side, requiredExtension }),
  getPathForDroppedFile: (file: File) => webUtils.getPathForFile(file),
  loadDevWorkingCopyDiff: (filePath: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-dev-working-copy-diff', { filePath, compareMode }),
  loadLocalDiff: (basePath: string, minePath: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-local-diff', { basePath, minePath, compareMode }),
  loadLocalFileDiff: (basePath: string, minePath: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-local-file-diff', { basePath, minePath, compareMode }),
  getSvnDiffViewerStatus: () => ipcRenderer.invoke('get-svn-diff-viewer-status'),
  configureSvnDiffViewer: (scope: 'all-files' | 'text-only' | 'workbook-only') => ipcRenderer.invoke('configure-svn-diff-viewer', { scope }),
  restoreSvnDefaultDiffViewerConfiguration: () => ipcRenderer.invoke('restore-svn-default-diff-viewer-configuration'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  usesNativeWindowControls: () => ipcRenderer.invoke('uses-native-window-controls'),
  getWindowFrameState: () => ipcRenderer.invoke('get-window-frame-state'),
  onWindowFrameStateChanged: (listener: (state: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on('window-frame-state-changed', wrapped);
    return () => {
      ipcRenderer.removeListener('window-frame-state-changed', wrapped);
    };
  },
  setTitleBarOverlay: (options: { color: string; symbolColor: string; height: number }) => ipcRenderer.send('set-title-bar-overlay', options),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  checkForAppUpdate: (options?: { manual?: boolean }) => ipcRenderer.invoke('check-app-update', options),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update'),
  launchUninstaller: (options?: { silent?: boolean }) => ipcRenderer.invoke('launch-uninstaller', options),
  onAppUpdateState: (listener: (state: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on('app-update-state-changed', wrapped);
    return () => {
      ipcRenderer.removeListener('app-update-state-changed', wrapped);
    };
  },
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  writeClipboardText: (text: string) => ipcRenderer.send('clipboard-write-text', text),
  saveDiagnosticReport: (content: string, defaultFileName?: string) => ipcRenderer.invoke('save-diagnostic-report', { content, defaultFileName }),
  debugLog: (message: string, payload?: unknown) => ipcRenderer.send('debug-log', { message, payload }),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
};

contextBridge.exposeInMainWorld('versora', versoraApi);
// Compatibility bridge for existing integrations and persisted test harnesses.
contextBridge.exposeInMainWorld('svnDiff', versoraApi);
