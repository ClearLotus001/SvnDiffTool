import { contextBridge, ipcRenderer } from 'electron';

type DiffViewerMode = 'keep' | 'excel-only' | 'all-files';

interface InstallOptions {
  installDir: string;
  cacheParent: string;
  diffViewerMode: DiffViewerMode;
  createDesktopShortcut: boolean;
  launchAfterInstall: boolean;
}

interface InstallState {
  status: 'idle' | 'running' | 'success' | 'error';
  phase: 'ready' | 'prepare' | 'install' | 'configure' | 'finalize' | 'done' | 'error';
  progress: number;
  message: string;
  error: string;
}

interface SetupContext {
  productName: string;
  version: string;
  payloadReady: boolean;
  defaultInstallDir: string;
  defaultCacheParent: string;
  managedCacheRoot: string;
}

interface WindowStatePayload {
  isMaximized: boolean;
}

contextBridge.exposeInMainWorld('setupBridge', {
  getContext: (): Promise<SetupContext> => ipcRenderer.invoke('bootstrapper-get-context'),
  pickInstallDir: (): Promise<string | null> => ipcRenderer.invoke('bootstrapper-pick-install-dir'),
  pickCacheParent: (): Promise<string | null> => ipcRenderer.invoke('bootstrapper-pick-cache-parent'),
  startInstall: (options: InstallOptions): Promise<{ ok: true }> => ipcRenderer.invoke('bootstrapper-start-install', options),
  getInstallState: (): Promise<InstallState> => ipcRenderer.invoke('bootstrapper-get-install-state'),
  onInstallState: (listener: (payload: InstallState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: InstallState) => listener(payload);
    ipcRenderer.on('bootstrapper-install-state', wrapped);
    return () => ipcRenderer.removeListener('bootstrapper-install-state', wrapped);
  },
  openPath: (targetPath: string): Promise<void> => ipcRenderer.invoke('bootstrapper-open-path', targetPath),
  getWindowState: (): Promise<WindowStatePayload> => ipcRenderer.invoke('bootstrapper-get-window-state'),
  onWindowState: (listener: (payload: WindowStatePayload) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: WindowStatePayload) => listener(payload);
    ipcRenderer.on('bootstrapper-window-state', wrapped);
    return () => ipcRenderer.removeListener('bootstrapper-window-state', wrapped);
  },
  windowMinimize: () => ipcRenderer.send('bootstrapper-window-minimize'),
  windowMaximize: () => ipcRenderer.send('bootstrapper-window-maximize'),
  windowClose: () => ipcRenderer.send('bootstrapper-window-close'),
});
