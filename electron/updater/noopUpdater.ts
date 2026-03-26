import type { PlatformUpdater } from './platformUpdater';
import {
  createAppUpdateState,
  normalizeAppUpdatePlatform,
  type AppUpdateCheckOptions,
  type AppUpdateListener,
  type AppUpdateState,
  type AppUpdateStatus,
  type PlatformUpdaterContext,
} from './types';

export class NoopUpdater implements PlatformUpdater {
  private readonly state: AppUpdateState;

  constructor(context: PlatformUpdaterContext, status: AppUpdateStatus) {
    this.state = createAppUpdateState(
      context.app.getVersion(),
      normalizeAppUpdatePlatform(process.platform),
      false,
      status,
    );
  }

  initialize() {
    // Intentionally empty.
  }

  getState(): AppUpdateState {
    return this.state;
  }

  async checkForUpdates(_options?: AppUpdateCheckOptions): Promise<void> {
    // Intentionally empty.
  }

  async downloadUpdate(): Promise<void> {
    // Intentionally empty.
  }

  async installUpdate(): Promise<void> {
    // Intentionally empty.
  }

  subscribe(_listener: AppUpdateListener): () => void {
    return () => {};
  }
}
