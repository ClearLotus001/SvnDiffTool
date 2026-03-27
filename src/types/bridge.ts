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
  WindowFrameState,
  DiffData,
} from '@/types/svn';
import type {
  WorkbookCompareMode,
  WorkbookCompareModePayload,
  WorkbookMetadataPayload,
} from '@/types/workbook';
import type { AppUpdateState } from '@/types/update';

export interface SvnDiffBridge {
  getDiffData(compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadRevisionDiff(baseRevisionId: string, mineRevisionId: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getRevisionOptions(): Promise<SvnRevisionInfo[]>;
  queryRevisionOptions(query?: RevisionOptionsQuery): Promise<RevisionOptionsPayload>;
  loadWorkbookCompareMode(compareMode: WorkbookCompareMode, baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookCompareModePayload>;
  loadWorkbookMetadata(baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookMetadataPayload>;
  onCliArgsUpdated?(listener: () => void): () => void;
  isDevMode(): Promise<boolean>;
  pickDiffFile(): Promise<LocalDiffFilePickResult | null>;
  loadDevWorkingCopyDiff(filePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadLocalDiff(basePath: string, minePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getSvnDiffViewerStatus(): Promise<SvnDiffViewerStatus>;
  configureSvnDiffViewer(scope: SvnDiffViewerScope): Promise<SvnDiffViewerStatus>;
  getTheme(): Promise<'dark' | 'light'>;
  usesNativeWindowControls(): Promise<boolean>;
  getWindowFrameState(): Promise<WindowFrameState>;
  onWindowFrameStateChanged?(listener: (state: WindowFrameState) => void): () => void;
  setTitleBarOverlay?(options: { color: string; symbolColor: string; height: number }): void;
  getUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdate(options?: { manual?: boolean }): Promise<void>;
  downloadAppUpdate(): Promise<void>;
  installDownloadedUpdate(): Promise<void>;
  launchUninstaller(): Promise<void>;
  onAppUpdateState?(listener: (state: AppUpdateState) => void): () => void;
  writeClipboardText(text: string): void;
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
