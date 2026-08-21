import * as fs from 'node:fs';
import * as path from 'node:path';
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent } from 'electron-updater';
import type { PlatformUpdater } from './platformUpdater';
import { normalizeReleaseNotes } from './releaseNotes';
import {
  createAppUpdateState,
  normalizeAppUpdatePlatform,
  type AppUpdateCheckOptions,
  type AppUpdateListener,
  type AppUpdateState,
  type PlatformUpdaterContext,
} from './types';

interface PersistedUpdaterState {
  lastCheckedAt: string | null;
}

const UP_TO_DATE_TO_IDLE_MS = 4_000;

function toIsoString(value: number): string {
  return new Date(value).toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class WindowsUpdater implements PlatformUpdater {
  private readonly listeners = new Set<AppUpdateListener>();
  private readonly updaterStatePath: string;
  private state: AppUpdateState;
  private initialized = false;
  private checkPromise: Promise<void> | null = null;
  private downloadPromise: Promise<void> | null = null;
  private lastCheckWasManual = false;
  private idleResetTimer: NodeJS.Timeout | null = null;

  constructor(private readonly context: PlatformUpdaterContext) {
    this.state = createAppUpdateState(
      context.app.getVersion(),
      normalizeAppUpdatePlatform(process.platform),
      true,
      'idle',
    );
    this.updaterStatePath = path.join(context.app.getPath('userData'), 'updater', 'state.json');
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    this.loadPersistedState();

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoRunAppAfterInstall = false;

    autoUpdater.on('checking-for-update', () => {
      this.clearIdleResetTimer();
      this.setState({
        status: 'checking',
        downloadPercent: 0,
        errorMessage: null,
      });
    });

    autoUpdater.on('update-available', (info) => {
      this.clearIdleResetTimer();
      this.lastCheckWasManual = false;
      this.setState({
        status: 'available',
        availableVersion: info.version ?? null,
        downloadPercent: 0,
        releaseName: info.releaseName ?? info.version ?? null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        publishedAt: info.releaseDate ?? null,
        errorMessage: null,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      const nextState = this.lastCheckWasManual ? 'upToDate' : 'idle';
      this.setState({
        status: nextState,
        availableVersion: null,
        downloadPercent: 0,
        releaseName: info.releaseName ?? info.version ?? null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        publishedAt: info.releaseDate ?? null,
        errorMessage: null,
      });
      if (this.lastCheckWasManual) {
        this.scheduleIdleReset();
      }
      this.lastCheckWasManual = false;
    });

    autoUpdater.on('download-progress', (progress) => {
      this.clearIdleResetTimer();
      this.applyDownloadProgress(progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.clearIdleResetTimer();
      this.applyDownloadedUpdate(info);
    });

    autoUpdater.on('error', (error) => {
      this.clearIdleResetTimer();
      this.lastCheckWasManual = false;
      this.setState({
        status: 'error',
        errorMessage: toErrorMessage(error),
      });
    });
  }

  getState(): AppUpdateState {
    return this.state;
  }

  async checkForUpdates(options: AppUpdateCheckOptions = {}): Promise<void> {
    this.initialize();

    const manual = options.manual ?? false;
    if (this.checkPromise) {
      return this.checkPromise;
    }

    const now = Date.now();
    this.lastCheckWasManual = manual;
    this.setState({
      status: 'checking',
      lastCheckedAt: toIsoString(now),
      downloadPercent: 0,
      errorMessage: null,
    });
    this.persistState();

    this.checkPromise = autoUpdater.checkForUpdates()
      .then(() => undefined)
      .catch((error) => {
        this.setState({
          status: 'error',
          errorMessage: toErrorMessage(error),
        });
      })
      .finally(() => {
        this.lastCheckWasManual = false;
        this.checkPromise = null;
      });

    return this.checkPromise;
  }

  async downloadUpdate(): Promise<void> {
    this.initialize();

    if (this.downloadPromise) {
      return this.downloadPromise;
    }
    if (this.state.status !== 'available' && this.state.status !== 'error') {
      return;
    }

    this.clearIdleResetTimer();
    this.setState({
      status: 'downloading',
      downloadPercent: 0,
      errorMessage: null,
    });

    this.downloadPromise = autoUpdater.downloadUpdate()
      .then(() => undefined)
      .catch((error) => {
        this.setState({
          status: 'error',
          errorMessage: toErrorMessage(error),
        });
      })
      .finally(() => {
        this.downloadPromise = null;
      });

    return this.downloadPromise;
  }

  async installUpdate(): Promise<void> {
    this.initialize();
    if (this.state.status !== 'downloaded') return;
    autoUpdater.quitAndInstall(false, false);
  }

  subscribe(listener: AppUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private loadPersistedState() {
    try {
      if (!fs.existsSync(this.updaterStatePath)) return;
      const raw = fs.readFileSync(this.updaterStatePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedUpdaterState;
      if (parsed.lastCheckedAt) {
        this.state = {
          ...this.state,
          lastCheckedAt: parsed.lastCheckedAt,
        };
      }
    } catch {
      // Ignore invalid persisted state.
    }
  }

  private persistState() {
    try {
      fs.mkdirSync(path.dirname(this.updaterStatePath), { recursive: true });
      const payload: PersistedUpdaterState = {
        lastCheckedAt: this.state.lastCheckedAt,
      };
      fs.writeFileSync(this.updaterStatePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore updater metadata persistence failures.
    }
  }

  private applyDownloadProgress(progress: ProgressInfo) {
    this.setState({
      status: 'downloading',
      downloadPercent: Math.max(0, Math.min(100, progress.percent)),
      errorMessage: null,
    });
  }

  private applyDownloadedUpdate(info: UpdateDownloadedEvent) {
    this.setState({
      status: 'downloaded',
      availableVersion: info.version ?? null,
      downloadPercent: 100,
      releaseName: info.releaseName ?? info.version ?? null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      publishedAt: info.releaseDate ?? null,
      errorMessage: null,
    });
  }

  private scheduleIdleReset() {
    this.clearIdleResetTimer();
    this.idleResetTimer = setTimeout(() => {
      if (this.state.status !== 'upToDate') return;
      this.setState({
        status: 'idle',
      });
    }, UP_TO_DATE_TO_IDLE_MS);
  }

  private clearIdleResetTimer() {
    if (!this.idleResetTimer) return;
    clearTimeout(this.idleResetTimer);
    this.idleResetTimer = null;
  }

  private setState(partial: Partial<AppUpdateState>) {
    const nextState: AppUpdateState = {
      ...this.state,
      ...partial,
      currentVersion: this.context.app.getVersion(),
    };
    this.state = nextState;
    if (partial.lastCheckedAt !== undefined) {
      this.persistState();
    }
    this.listeners.forEach((listener) => listener(nextState));
  }
}
