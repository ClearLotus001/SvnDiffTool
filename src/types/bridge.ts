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
import type { LineBlamePayload } from '@/types/diff';
import type {
  WorkbookCompareMode,
} from '@/types/workbook';
import type {
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from '@/types/analysis';
import type { AppUpdateState } from '@/types/update';
import type { ThemeKey } from '@/types/theme';

export interface LaunchContextPayload {
  hasDiffRequest: boolean;
  isDevMode: boolean;
  usesNativeWindowControls: boolean;
  windowFrameState: WindowFrameState;
  launchedAfterUpdate: boolean;
  updateState: AppUpdateState;
}

export interface VersoraBridge {
  notifyRendererReady?(): void;
  saveStartupAppearance?(appearance: { themeKey?: ThemeKey; locale?: 'zh-CN' | 'en-US' }): void;
  getLaunchContext(): Promise<LaunchContextPayload>;
  getDiffData(compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadRevisionDiff(baseRevisionId: string, mineRevisionId: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadTwoFileRevisionDiff(baseRevisionId: string, mineRevisionId: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadLineBlame(baseRevisionId?: string, mineRevisionId?: string): Promise<LineBlamePayload>;
  loadWorkingCopyLineBlame(basePath: string, minePath: string): Promise<LineBlamePayload>;
  loadTwoFileVersionLineBlame(baseRevisionId: string, mineRevisionId: string): Promise<LineBlamePayload>;
  getRevisionOptions(): Promise<SvnRevisionInfo[]>;
  queryRevisionOptions(query?: RevisionOptionsQuery): Promise<RevisionOptionsPayload>;
  loadWorkbookCompareMode(compareMode: WorkbookCompareMode, baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookCompareModePayload>;
  loadWorkbookMetadata(baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookMetadataPayload>;
  onCliArgsUpdated?(listener: () => void): () => void;
  isDevMode(): Promise<boolean>;
  pickDiffFile(): Promise<LocalDiffFilePickResult | null>;
  pickComparableFile(side: LocalFilePickSide, requiredExtension?: string): Promise<LocalDiffFilePickResult | null>;
  getPathForDroppedFile?(file: File): string;
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
    versora?: VersoraBridge;
  }
}
