import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('svnDiff', {
  getDiffData: (compareMode?: 'strict' | 'content') => ipcRenderer.invoke('get-diff-data', { compareMode }),
  loadRevisionDiff: (baseRevisionId: string, mineRevisionId: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-revision-diff', { baseRevisionId, mineRevisionId, compareMode }),
  getRevisionOptions: () => ipcRenderer.invoke('get-revision-options'),
  queryRevisionOptions: (query?: {
    limit?: number;
    beforeRevisionId?: string;
    anchorDateTime?: string;
    includeSpecials?: boolean;
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
  loadDevWorkingCopyDiff: (filePath: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-dev-working-copy-diff', { filePath, compareMode }),
  loadLocalDiff: (basePath: string, minePath: string, compareMode?: 'strict' | 'content') => ipcRenderer.invoke('load-local-diff', { basePath, minePath, compareMode }),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  writeClipboardText: (text: string) => ipcRenderer.send('clipboard-write-text', text),
  debugLog: (message: string, payload?: unknown) => ipcRenderer.send('debug-log', { message, payload }),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
});
