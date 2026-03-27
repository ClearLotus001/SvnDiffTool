// ─────────────────────────────────────────────────────────────────────────────
// App update types
// ─────────────────────────────────────────────────────────────────────────────

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
