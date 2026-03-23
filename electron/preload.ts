import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('svnDiff', {
  getDiffData: () => ipcRenderer.invoke('get-diff-data'),
  loadRevisionDiff: (baseRevisionId: string, mineRevisionId: string) => ipcRenderer.invoke('load-revision-diff', { baseRevisionId, mineRevisionId }),
  isDevMode: () => ipcRenderer.invoke('is-dev-mode'),
  pickDiffFile: () => ipcRenderer.invoke('pick-diff-file'),
  loadDevWorkingCopyDiff: (filePath: string) => ipcRenderer.invoke('load-dev-working-copy-diff', { filePath }),
  loadLocalDiff: (basePath: string, minePath: string) => ipcRenderer.invoke('load-local-diff', { basePath, minePath }),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  writeClipboardText: (text: string) => ipcRenderer.send('clipboard-write-text', text),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
});
