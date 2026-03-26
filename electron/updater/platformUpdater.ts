import type { AppUpdateCheckOptions, AppUpdateListener, AppUpdateState } from './types';

export interface PlatformUpdater {
  initialize(): void;
  getState(): AppUpdateState;
  checkForUpdates(options?: AppUpdateCheckOptions): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  subscribe(listener: AppUpdateListener): () => void;
}
