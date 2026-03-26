import type { App } from 'electron';

export type AppUpdatePlatform = 'win32' | 'darwin' | 'linux' | 'unknown';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'error'
  | 'unsupported'
  | 'disabled';

export interface AppUpdateState {
  status: AppUpdateStatus;
  platform: AppUpdatePlatform;
  supportsAutoUpdate: boolean;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  errorMessage: string | null;
}

export interface AppUpdateCheckOptions {
  manual?: boolean;
}

export type AppUpdateListener = (state: AppUpdateState) => void;

export interface PlatformUpdater {
  initialize(): void;
  getState(): AppUpdateState;
  checkForUpdates(options?: AppUpdateCheckOptions): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  subscribe(listener: AppUpdateListener): () => void;
}

export interface PlatformUpdaterContext {
  app: App;
}

export function normalizeAppUpdatePlatform(platform: string): AppUpdatePlatform {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform;
  }
  return 'unknown';
}

export function createAppUpdateState(
  currentVersion: string,
  platform: AppUpdatePlatform,
  supportsAutoUpdate: boolean,
  status: AppUpdateStatus = 'idle',
): AppUpdateState {
  return {
    status,
    platform,
    supportsAutoUpdate,
    currentVersion,
    availableVersion: null,
    downloadPercent: 0,
    releaseName: null,
    releaseNotes: null,
    publishedAt: null,
    lastCheckedAt: null,
    errorMessage: null,
  };
}
