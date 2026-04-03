// ─────────────────────────────────────────────────────────────────────────────
// src/store/selectors.ts — Domain-scoped selector hooks
//
// These hooks let child components subscribe directly to relevant store slices
// instead of receiving everything through props.
//
// Each hook uses fine-grained selectors so components only re-render when their
// specific slice changes.
//
// Usage example:
//   import { useUiSettings } from '@/store/selectors';
//   const { themeKey, setThemeKey, fontSize, setFontSize } = useUiSettings();
// ─────────────────────────────────────────────────────────────────────────────

import { useAppStore } from '@/store/appStore';

// ── UI Settings ─────────────────────────────────────────────────────────────

export function useUiSettings() {
  return useAppStore((s) => ({
    themeKey: s.themeKey,
    layout: s.layout,
    collapseCtx: s.collapseCtx,
    showWhitespace: s.showWhitespace,
    showHiddenColumns: s.showHiddenColumns,
    fontSize: s.fontSize,
    workbookCompareMode: s.workbookCompareMode,
    setThemeKey: s.setThemeKey,
    setLayout: s.setLayout,
    setCollapseCtx: s.setCollapseCtx,
    setShowWhitespace: s.setShowWhitespace,
    setShowHiddenColumns: s.setShowHiddenColumns,
    setFontSize: s.setFontSize,
    setWorkbookCompareMode: s.setWorkbookCompareMode,
  }));
}

// ── Diff Data ───────────────────────────────────────────────────────────────

export function useDiffData() {
  return useAppStore((s) => ({
    diffLines: s.diffLines,
    diffSourceNoticeCode: s.diffSourceNoticeCode,
    diffSourceNoticeDismissed: s.diffSourceNoticeDismissed,
    precomputedWorkbookDelta: s.precomputedWorkbookDelta,
    workbookArtifactDiff: s.workbookArtifactDiff,
    artifactNoticeDismissed: s.artifactNoticeDismissed,
    setDiffLines: s.setDiffLines,
    setDiffSourceNoticeCode: s.setDiffSourceNoticeCode,
    setDiffSourceNoticeDismissed: s.setDiffSourceNoticeDismissed,
    setPrecomputedWorkbookDelta: s.setPrecomputedWorkbookDelta,
    setWorkbookArtifactDiff: s.setWorkbookArtifactDiff,
    setArtifactNoticeDismissed: s.setArtifactNoticeDismissed,
  }));
}

// ── File Names ──────────────────────────────────────────────────────────────

export function useFileNames() {
  return useAppStore((s) => ({
    baseName: s.baseName,
    mineName: s.mineName,
    launchBaseName: s.launchBaseName,
    launchMineName: s.launchMineName,
    fileName: s.fileName,
    setBaseName: s.setBaseName,
    setMineName: s.setMineName,
    setLaunchBaseName: s.setLaunchBaseName,
    setLaunchMineName: s.setLaunchMineName,
    setFileName: s.setFileName,
  }));
}

// ── Search ──────────────────────────────────────────────────────────────────

export function useSearchState() {
  return useAppStore((s) => ({
    searchQ: s.searchQ,
    searchRx: s.searchRx,
    searchCs: s.searchCs,
    searchWorkbookScope: s.searchWorkbookScope,
    activeSearchIdx: s.activeSearchIdx,
    searchJumpNonce: s.searchJumpNonce,
    setSearchQ: s.setSearchQ,
    setSearchRx: s.setSearchRx,
    setSearchCs: s.setSearchCs,
    setSearchWorkbookScope: s.setSearchWorkbookScope,
    setActiveSearchIdx: s.setActiveSearchIdx,
    setSearchJumpNonce: s.setSearchJumpNonce,
  }));
}

// ── Navigation ──────────────────────────────────────────────────────────────

export function useNavigationState() {
  return useAppStore((s) => ({
    hunkIdx: s.hunkIdx,
    guidedPulseNonce: s.guidedPulseNonce,
    setHunkIdx: s.setHunkIdx,
    setGuidedPulseNonce: s.setGuidedPulseNonce,
  }));
}

// ── Electron Environment ────────────────────────────────────────────────────

export function useElectronEnv() {
  return useAppStore((s) => ({
    isElectron: s.isElectron,
    isDevMode: s.isDevMode,
    usesNativeWindowControls: s.usesNativeWindowControls,
    isWindowMaximized: s.isWindowMaximized,
    setIsElectron: s.setIsElectron,
    setIsDevMode: s.setIsDevMode,
    setUsesNativeWindowControls: s.setUsesNativeWindowControls,
    setIsWindowMaximized: s.setIsWindowMaximized,
  }));
}

// ── SVN Revision ────────────────────────────────────────────────────────────

export function useRevisionState() {
  return useAppStore((s) => ({
    compareContext: s.compareContext,
    resetPair: s.resetPair,
    revisionOptions: s.revisionOptions,
    baseRevisionInfo: s.baseRevisionInfo,
    mineRevisionInfo: s.mineRevisionInfo,
    canSwitchRevisions: s.canSwitchRevisions,
    setCompareContext: s.setCompareContext,
    setResetPair: s.setResetPair,
    setRevisionOptions: s.setRevisionOptions,
    setBaseRevisionInfo: s.setBaseRevisionInfo,
    setMineRevisionInfo: s.setMineRevisionInfo,
    setCanSwitchRevisions: s.setCanSwitchRevisions,
  }));
}

// ── Workbook UI ─────────────────────────────────────────────────────────────

export function useWorkbookUiState() {
  return useAppStore((s) => ({
    workbookSelection: s.workbookSelection,
    workbookHiddenStateBySheet: s.workbookHiddenStateBySheet,
    workbookContextMenu: s.workbookContextMenu,
    workbookFreezeBySheet: s.workbookFreezeBySheet,
    workbookColumnWidthBySheet: s.workbookColumnWidthBySheet,
    activeWorkbookSheetName: s.activeWorkbookSheetName,
    baseWorkbookMetadata: s.baseWorkbookMetadata,
    mineWorkbookMetadata: s.mineWorkbookMetadata,
    setWorkbookSelection: s.setWorkbookSelection,
    setWorkbookHiddenStateBySheet: s.setWorkbookHiddenStateBySheet,
    setWorkbookContextMenu: s.setWorkbookContextMenu,
    setWorkbookFreezeBySheet: s.setWorkbookFreezeBySheet,
    setWorkbookColumnWidthBySheet: s.setWorkbookColumnWidthBySheet,
    setActiveWorkbookSheetName: s.setActiveWorkbookSheetName,
    setBaseWorkbookMetadata: s.setBaseWorkbookMetadata,
    setMineWorkbookMetadata: s.setMineWorkbookMetadata,
  }));
}

// ── App Update ──────────────────────────────────────────────────────────────

export function useAppUpdateState() {
  return useAppStore((s) => ({
    appUpdateState: s.appUpdateState,
    setAppUpdateState: s.setAppUpdateState,
  }));
}

// ── SVN Diff Viewer Config ──────────────────────────────────────────────────

export function useSvnDiffViewerState() {
  return useAppStore((s) => ({
    svnDiffViewerStatus: s.svnDiffViewerStatus,
    isLoadingSvnDiffViewerStatus: s.isLoadingSvnDiffViewerStatus,
    applyingSvnDiffViewerScope: s.applyingSvnDiffViewerScope,
    isRestoringSvnDiffViewerDefault: s.isRestoringSvnDiffViewerDefault,
    svnDiffViewerError: s.svnDiffViewerError,
    setSvnDiffViewerStatus: s.setSvnDiffViewerStatus,
    setIsLoadingSvnDiffViewerStatus: s.setIsLoadingSvnDiffViewerStatus,
    setApplyingSvnDiffViewerScope: s.setApplyingSvnDiffViewerScope,
    setIsRestoringSvnDiffViewerDefault: s.setIsRestoringSvnDiffViewerDefault,
    setSvnDiffViewerError: s.setSvnDiffViewerError,
  }));
}
