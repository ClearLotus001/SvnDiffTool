// ─────────────────────────────────────────────────────────────────────────────
// Electron bridge types
// ─────────────────────────────────────────────────────────────────────────────

import type {
  LocalDiffFilePickResult,
  RevisionOptionsPayload,
  RevisionOptionsQuery,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
  SvnRevisionInfo,
  LocalFilePickSide,
  WindowFrameState,
  DiffData,
} from '@/types/svn';
import type {
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from '@/types/workbook';
import type { AppUpdateState } from '@/types/update';
import type { ThemeKey } from '@/types/theme';

export interface LaunchContextPayload {
  isDevMode: boolean;
  usesNativeWindowControls: boolean;
  windowFrameState: WindowFrameState;
  launchedAfterUpdate: boolean;
  updateState: AppUpdateState;
}

export interface LaunchStatePayload extends LaunchContextPayload {
  diffData: DiffData;
}

export interface SvnDiffBridge {
  notifyRendererReady?(): void;
  saveStartupAppearance?(appearance: { themeKey?: ThemeKey; locale?: 'zh-CN' | 'en-US' }): void;
  getLaunchContext(): Promise<LaunchContextPayload>;
  getLaunchState(compareMode?: WorkbookCompareMode): Promise<LaunchStatePayload>;
  getDiffData(compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadRevisionDiff(baseRevisionId: string, mineRevisionId: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getRevisionOptions(): Promise<SvnRevisionInfo[]>;
  queryRevisionOptions(query?: RevisionOptionsQuery): Promise<RevisionOptionsPayload>;
  loadWorkbookCompareMode(compareMode: WorkbookCompareMode, baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookCompareModePayload>;
  loadWorkbookMetadata(baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookMetadataPayload>;
  onCliArgsUpdated?(listener: () => void): () => void;
  isDevMode(): Promise<boolean>;
  pickDiffFile(): Promise<LocalDiffFilePickResult | null>;
  pickComparableFile(side: LocalFilePickSide, requiredExtension?: string): Promise<LocalDiffFilePickResult | null>;
  loadDevWorkingCopyDiff(filePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadLocalDiff(basePath: string, minePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadLocalFileDiff(basePath: string, minePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getSvnDiffViewerStatus(): Promise<SvnDiffViewerStatus>;
  configureSvnDiffViewer(scope: SvnDiffViewerScope): Promise<SvnDiffViewerStatus>;
  restoreSvnDefaultDiffViewerConfiguration(): Promise<SvnDiffViewerStatus>;
  getTheme(): Promise<'dark' | 'light'>;
  usesNativeWindowControls(): Promise<boolean>;
  getWindowFrameState(): Promise<WindowFrameState>;
  onWindowFrameStateChanged?(listener: (state: WindowFrameState) => void): () => void;
  setTitleBarOverlay?(options: { color: string; symbolColor: string; height: number }): void;
  getUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdate(options?: { manual?: boolean }): Promise<void>;
  downloadAppUpdate(): Promise<void>;
  installDownloadedUpdate(): Promise<void>;
  launchUninstaller(options?: { silent?: boolean }): Promise<void>;
  onAppUpdateState?(listener: (state: AppUpdateState) => void): () => void;
  writeClipboardText(text: string): void;
  saveDiagnosticReport?(content: string, defaultFileName?: string): Promise<string | null>;
  debugLog?(message: string, payload?: unknown): void;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  openExternal(url: string): void;
}

declare global {
  interface Window {
    svnDiff?: SvnDiffBridge;
  }
}
