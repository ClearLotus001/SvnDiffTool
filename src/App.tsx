// ─────────────────────────────────────────────────────────────────────────────
// src/App.tsx  —  SvnExcelDiffTool root
//
// This file is now a thin orchestrator:
//   - Reads state from Zustand store (only fields needed for rendering)
//   - Manages imperative refs
//   - Renders the layout, delegating visuals to components/
// ─────────────────────────────────────────────────────────────────────────────

import {
  useRef, useEffect, useCallback, useMemo, startTransition, type SetStateAction,
} from 'react';

import type {
  DiffData,
  SplitRow,
  SvnRevisionInfo,
  WorkbookCompareLayoutSnapshot,
  WorkbookHorizontalLayoutSnapshot,
  WorkbookMoveDirection,
} from '@/types';
import { useI18n } from '@/context/i18n';
import { ThemeContext } from '@/context/theme';
import { buildReplacementPairIndex } from '@/engine/text/textChangeAlignment';
import {
  applyWorkbookExpandedBlocksChange,
  applyWorkbookLayoutSnapshot,
  createEmptyWorkbookLayoutSnapshots,
  type WorkbookLayoutSnapshotsByMode,
} from '@/utils/workbook/workbookLayoutState';
import { parseWorkbookRowLine } from '@/utils/workbook/workbookCompare';
import {
  setWorkbookDebugEnabled,
  workbookDebugLog,
} from '@/utils/workbook/workbookDebug';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { AppContent, AppDialogs } from '@/components/app-shell';
import {
  useAppChromeEffects,
  useAppKeyboardShortcuts,
  useAppUpdateActions,
  useAppViewModel,
  useDialogState,
  useDiffLoader,
  useDiffLoadState,
  useElectronLifecycleEffects,
  useRevisionCompare,
  useRevisionQueryState,
  useSyntaxHighlightPresentation,
  useWorkbookActions,
  useWorkbookViewEffects,
  cycleHunkIndex,
  type CachedDiffResult,
  type WorkbookUiController,
} from '@/hooks/app';
import { useAppStore } from '@/store/appStore';
import PerfBar from '@/components/app/PerfBar';
import DiffSourceNoticeBar from '@/components/diff/DiffSourceNoticeBar';
import SearchBar from '@/components/diff/SearchBar';
import WorkbookFormulaBar from '@/components/workbook/WorkbookFormulaBar';
import WorkbookArtifactNoticeBar from '@/components/workbook/WorkbookArtifactNoticeBar';
import Toolbar from '@/components/navigation/Toolbar';
import SplitHeader from '@/components/navigation/SplitHeader';
import StatsBar from '@/components/navigation/StatsBar';

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════

const EMPTY_REPLACEMENT_PAIR_INDEX = new Map<number, number>();

export default function App() {
  const { t } = useI18n();

  // ── Zustand Store (only fields needed for rendering / remaining hooks) ─
  // UI Settings (needed by JSX: Toolbar, panelProps, etc.)
  const themeKey = useAppStore((s) => s.themeKey);
  const layout = useAppStore((s) => s.layout);
  const collapseCtx = useAppStore((s) => s.collapseCtx);
  const showWhitespace = useAppStore((s) => s.showWhitespace);
  const showHiddenColumns = useAppStore((s) => s.showHiddenColumns);
  const fontSize = useAppStore((s) => s.fontSize);
  const workbookCompareMode = useAppStore((s) => s.workbookCompareMode);
  const setThemeKey = useAppStore((s) => s.setThemeKey);
  const setLayout = useAppStore((s) => s.setLayout);
  const setCollapseCtx = useAppStore((s) => s.setCollapseCtx);
  const setShowWhitespace = useAppStore((s) => s.setShowWhitespace);
  const setShowHiddenColumns = useAppStore((s) => s.setShowHiddenColumns);
  const setFontSize = useAppStore((s) => s.setFontSize);

  // Diff Data (needed by JSX: notice bars, panelProps, debug)
  const diffLines = useAppStore((s) => s.diffLines);
  const diffSourceNoticeCode = useAppStore((s) => s.diffSourceNoticeCode);
  const diffSourceNoticeDismissed = useAppStore((s) => s.diffSourceNoticeDismissed);
  const precomputedWorkbookDelta = useAppStore((s) => s.precomputedWorkbookDelta);
  const workbookArtifactDiff = useAppStore((s) => s.workbookArtifactDiff);
  const artifactNoticeDismissed = useAppStore((s) => s.artifactNoticeDismissed);
  const setArtifactNoticeDismissed = useAppStore((s) => s.setArtifactNoticeDismissed);
  const setDiffSourceNoticeDismissed = useAppStore((s) => s.setDiffSourceNoticeDismissed);

  // Search (needed by JSX: SearchBar, panelProps)
  const searchQ = useAppStore((s) => s.searchQ);
  const searchRx = useAppStore((s) => s.searchRx);
  const searchCs = useAppStore((s) => s.searchCs);
  const searchWorkbookScope = useAppStore((s) => s.searchWorkbookScope);
  const activeSearchIdx = useAppStore((s) => s.activeSearchIdx);

  // Navigation (needed by JSX: Toolbar, panelProps, handlers)
  const hunkIdx = useAppStore((s) => s.hunkIdx);
  const setHunkIdx = useAppStore((s) => s.setHunkIdx);
  const setGuidedPulseNonce = useAppStore((s) => s.setGuidedPulseNonce);
  const guidedPulseNonce = useAppStore((s) => s.guidedPulseNonce);

  // Electron Environment (needed by JSX: Toolbar, SplitHeader, AppContent)
  const isElectron = useAppStore((s) => s.isElectron);
  const isDevMode = useAppStore((s) => s.isDevMode);
  const usesNativeWindowControls = useAppStore((s) => s.usesNativeWindowControls);
  const isWindowMaximized = useAppStore((s) => s.isWindowMaximized);

  // SVN Revision (needed by JSX: SplitHeader)
  const resetPair = useAppStore((s) => s.resetPair);
  const revisionOptions = useAppStore((s) => s.revisionOptions);
  const baseRevisionInfo = useAppStore((s) => s.baseRevisionInfo);
  const mineRevisionInfo = useAppStore((s) => s.mineRevisionInfo);
  const canSwitchRevisions = useAppStore((s) => s.canSwitchRevisions);

  // Workbook UI (needed by JSX: AppContent, WorkbookFormulaBar, workbookUi controller)
  const workbookSelection = useAppStore((s) => s.workbookSelection);
  const workbookHiddenStateBySheet = useAppStore((s) => s.workbookHiddenStateBySheet);
  const workbookContextMenu = useAppStore((s) => s.workbookContextMenu);
  const workbookFreezeBySheet = useAppStore((s) => s.workbookFreezeBySheet);
  const workbookColumnWidthBySheet = useAppStore((s) => s.workbookColumnWidthBySheet);
  const activeWorkbookSheetName = useAppStore((s) => s.activeWorkbookSheetName);
  const baseWorkbookMetadata = useAppStore((s) => s.baseWorkbookMetadata);
  const mineWorkbookMetadata = useAppStore((s) => s.mineWorkbookMetadata);
  const setWorkbookSelection = useAppStore((s) => s.setWorkbookSelection);
  const setWorkbookHiddenStateBySheet = useAppStore((s) => s.setWorkbookHiddenStateBySheet);
  const setWorkbookContextMenu = useAppStore((s) => s.setWorkbookContextMenu);
  const setWorkbookFreezeBySheet = useAppStore((s) => s.setWorkbookFreezeBySheet);
  const setWorkbookColumnWidthBySheet = useAppStore((s) => s.setWorkbookColumnWidthBySheet);
  const setActiveWorkbookSheetName = useAppStore((s) => s.setActiveWorkbookSheetName);

  // App Update (needed by JSX: Toolbar, AppDialogs)
  const appUpdateState = useAppStore((s) => s.appUpdateState);

  // SVN Diff Viewer Config (needed by JSX: AppDialogs)
  const svnDiffViewerStatus = useAppStore((s) => s.svnDiffViewerStatus);
  const isLoadingSvnDiffViewerStatus = useAppStore((s) => s.isLoadingSvnDiffViewerStatus);
  const applyingSvnDiffViewerScope = useAppStore((s) => s.applyingSvnDiffViewerScope);
  const isRestoringSvnDiffViewerDefault = useAppStore((s) => s.isRestoringSvnDiffViewerDefault);
  const svnDiffViewerError = useAppStore((s) => s.svnDiffViewerError);

  // ── Imperative Refs (not in store) ──────────────────────────────────────
  const loadSeqRef = useRef(0);
  const startupBootstrapStartedRef = useRef(false);
  const hasLoadedDiffRef = useRef(false);
  const workbookCompareModeRef = useRef(workbookCompareMode);
  const currentDiffDataRef = useRef<DiffData | null>(null);
  const diffResultCacheRef = useRef<Map<string, CachedDiffResult>>(new Map());
  const workbookLayoutSnapshotsRef = useRef<WorkbookLayoutSnapshotsByMode>(
    createEmptyWorkbookLayoutSnapshots(),
  );
  const workbookSharedExpandedBlocksRef = useRef<Map<string, CollapseExpansionState>>(new Map());
  const revisionOptionsRef = useRef<SvnRevisionInfo[]>([]);
  const revisionQuerySeqRef = useRef(0);
  const updateAutoCheckRequestedRef = useRef(false);
  const scrollToIndexRef = useRef<((idx: number, align?: 'start' | 'center') => void) | null>(null);
  const workbookMoveRef = useRef<((direction: WorkbookMoveDirection) => void) | null>(null);
  const collapseNavigationRef = useRef<((direction: 'prev' | 'next') => void) | null>(null);

  // ── Controller Hooks (useReducer-based, retained) ───────────────────────
  const dialogs = useDialogState();
  const { state: dialogState, actions: dialogActions } = dialogs;
  const {
    showSearch,
    showGoto,
    showHelp,
    showAbout,
    showSvnConfig,
  } = dialogState;
  const setShowSearch = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('search', value);
  }, [dialogActions]);
  const setShowGoto = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('goto', value);
  }, [dialogActions]);
  const setShowHelp = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('help', value);
  }, [dialogActions]);
  const setShowAbout = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('about', value);
  }, [dialogActions]);
  const setShowSvnConfig = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('svnConfig', value);
  }, [dialogActions]);
  const closeAllDialogs = dialogActions.closeAll;

  const diffLoad = useDiffLoadState();
  const { state: diffLoadState } = diffLoad;
  const {
    isLoadingDiff,
    hasLoadedDiff,
    loadPhase,
    loadError,
    loadPerfMetrics,
  } = diffLoadState;

  const revisionQuery = useRevisionQueryState();
  const { state: revisionQueryState } = revisionQuery;
  const {
    revisionOptionsStatus,
    revisionHasMore,
    revisionQueryDateTime,
    revisionQueryError,
    isLoadingMoreRevisions,
    isSearchingRevisionDateTime,
    isSwitchingRevisions,
  } = revisionQueryState;

  // ── Derived State ───────────────────────────────────────────────────────
  const workbookUi = useMemo<WorkbookUiController>(() => ({
    state: {
      selection: workbookSelection,
      hiddenStateBySheet: workbookHiddenStateBySheet,
      contextMenu: workbookContextMenu,
      freezeBySheet: workbookFreezeBySheet,
      columnWidthBySheet: workbookColumnWidthBySheet,
      activeSheetName: activeWorkbookSheetName,
      showHiddenColumns,
    },
    actions: {
      setSelection: setWorkbookSelection,
      setHiddenStateBySheet: setWorkbookHiddenStateBySheet,
      setContextMenu: setWorkbookContextMenu,
      setFreezeBySheet: setWorkbookFreezeBySheet,
      setColumnWidthBySheet: setWorkbookColumnWidthBySheet,
      setActiveSheetName: setActiveWorkbookSheetName,
      setShowHiddenColumns,
    },
  }), [
    activeWorkbookSheetName,
    showHiddenColumns,
    workbookColumnWidthBySheet,
    workbookContextMenu,
    workbookFreezeBySheet,
    workbookHiddenStateBySheet,
    workbookSelection,
    setWorkbookSelection,
    setWorkbookHiddenStateBySheet,
    setWorkbookContextMenu,
    setWorkbookFreezeBySheet,
    setWorkbookColumnWidthBySheet,
    setActiveWorkbookSheetName,
    setShowHiddenColumns,
  ]);

  // ── useAppViewModel ───────────────────────────────────────────────────
  const {
    displayBaseName,
    displayMineName,
    displayFileName,
    selectedCell,
    baseVersionLabel,
    mineVersionLabel,
    baseRoleTitle,
    mineRoleTitle,
    baseStatsTitle,
    mineStatsTitle,
    activeFreezeState,
    activeSelectionMergeRanges,
    artifactNoticeKey,
    diffSourceNoticeKey,
    hunks,
    textDiffStats,
    hunkPositions,
    searchJumpNonce,
    searchMatches,
    searchResultItems,
    workbookSections,
    workbookSectionRowIndex,
    isWorkbookMode,
    workbookDiffRegions,
    activeWorkbookDiffRegion,
    activeWorkbookSharedExpandedBlocks,
    activeWorkbookTargetCell,
    activeWorkbookGuidedRange,
    navigationCount,
    currentNavigationLabel,
    totalLines,
    canLaunchUninstaller,
    handleSearch,
    handleSearchPreviewNav,
    handleSearchNav,
    handleSearchJump,
    handleGoto,
  } = useAppViewModel({
    t,
    workbookSharedExpandedBlocksRef,
    scrollToIndexRef,
  });
  const textDiffPresentation = useMemo(() => ({
    stats: textDiffStats,
    replacementPairIndex: (!isWorkbookMode && layout === 'unified')
      ? buildReplacementPairIndex(diffLines)
      : EMPTY_REPLACEMENT_PAIR_INDEX,
  }), [diffLines, isWorkbookMode, layout, textDiffStats]);
  const syntaxPresentation = useSyntaxHighlightPresentation({
    currentDiffData: currentDiffDataRef.current,
    isWorkbookMode,
    themeKey,
  });

  // ── Chrome Effects ────────────────────────────────────────────────────
  useAppChromeEffects({
    revisionOptionsRef,
    artifactNoticeKey,
    diffSourceNoticeKey,
    hasLoadedDiff,
    hasLoadedDiffRef,
    workbookCompareModeRef,
  });

  // ── Diff Loader ───────────────────────────────────────────────────────
  const {
    beginDiffLoad,
    failDiffLoad,
    applyDiffData,
    handleWorkbookCompareModeChange,
    handlePickWorkingCopyFile,
    loadSvnDiffViewerStatus,
    handleOpenSvnConfig,
    handleApplySvnDiffViewerScope,
    handleRestoreSvnDiffViewerDefault,
    reloadCliDiffData,
  } = useDiffLoader({
    loadSeqRef,
    hasLoadedDiffRef,
    workbookCompareModeRef,
    currentDiffDataRef,
    diffResultCacheRef,
    workbookLayoutSnapshotsRef,
    workbookSharedExpandedBlocksRef,
    revisionQuerySeqRef,
    dialogs,
    diffLoad,
    revisionQuery,
    workbookUi,
  });

  // ── Revision Compare ──────────────────────────────────────────────────
  const {
    handleEnsureRevisionOptionsLoaded,
    handleLoadMoreRevisionOptions,
    handleRevisionDateTimeQuery,
    handleRevisionCompareChange,
    handleResetRevisionCompare,
  } = useRevisionCompare({
    revisionOptionsRef,
    revisionQuerySeqRef,
    loadSeqRef,
    workbookCompareModeRef,
    revisionQuery,
    applyDiffData,
    beginDiffLoad,
    failDiffLoad,
  });

  // ── Electron Lifecycle ────────────────────────────────────────────────
  useElectronLifecycleEffects({
    applyDiffData,
    reloadCliDiffData,
    startupBootstrapStartedRef,
    workbookCompareModeRef,
    loadSeqRef,
    revisionQuerySeqRef,
    updateAutoCheckRequestedRef,
    diffLoad,
    revisionQuery,
  });

  const {
    handleCheckForAppUpdate,
    handleDownloadAppUpdate,
    handleInstallDownloadedUpdate,
    handleLaunchUninstaller,
  } = useAppUpdateActions(t);

  // ── Event Handlers ────────────────────────────────────────────────────
  const handleScrollerReady = useCallback(
    (fn: (idx: number, align?: 'start' | 'center') => void) => {
      scrollToIndexRef.current = fn;
    },
    [],
  );
  const handleLayoutChange = useCallback((nextLayout: typeof layout) => {
    startTransition(() => {
      setLayout(nextLayout);
    });
  }, [setLayout]);
  const handleWorkbookLayoutSnapshotChange = useCallback((
    snapshot: WorkbookCompareLayoutSnapshot | WorkbookHorizontalLayoutSnapshot,
  ) => {
    const nextState = applyWorkbookLayoutSnapshot(
      workbookSharedExpandedBlocksRef.current,
      workbookLayoutSnapshotsRef.current,
      snapshot,
    );
    workbookSharedExpandedBlocksRef.current = nextState.sharedExpandedBlocksByContext;
    workbookLayoutSnapshotsRef.current = nextState.snapshots;
  }, []);
  const handleWorkbookExpandedBlocksChange = useCallback((
    sheetName: string | null,
    activeRegionId: string | null,
    expandedBlocks: CollapseExpansionState,
  ) => {
    const nextState = applyWorkbookExpandedBlocksChange(
      workbookSharedExpandedBlocksRef.current,
      workbookLayoutSnapshotsRef.current,
      sheetName,
      activeRegionId,
      expandedBlocks,
    );
    workbookSharedExpandedBlocksRef.current = nextState.sharedExpandedBlocksByContext;
    workbookLayoutSnapshotsRef.current = nextState.snapshots;
  }, []);

  const handleWorkbookNavigationReady = useCallback(
    (fn: ((direction: WorkbookMoveDirection) => void) | null) => {
      workbookMoveRef.current = fn;
    },
    [],
  );
  const handleCollapseNavigationReady = useCallback(
    (fn: ((direction: 'prev' | 'next') => void) | null) => {
      collapseNavigationRef.current = fn;
    },
    [],
  );
  const {
    handleFreezeRow,
    handleFreezeColumn,
    handleFreezePane,
    handleUnfreezeRow,
    handleUnfreezeColumn,
    handleResetFreeze,
    handleWorkbookColumnWidthChange,
    handleWorkbookSelectionRequest,
    workbookContextMenuSections,
  } = useWorkbookActions({
    t,
    selectedCell,
    fontSize,
    workbookCompareMode,
    workbookSections,
    workbookSectionRowIndex,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
    workbookUi,
    workbookDiffRegions,
    isWorkbookMode,
    setHunkIdx,
  });

  const panelProps = useMemo(() => ({
    diffLines, textDiffPresentation, syntaxPresentation, collapseCtx, activeHunkIdx: hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions, searchJumpNonce,
    showWhitespace, fontSize,
    guidedLineIdx: null,
    guidedHunkRange: isWorkbookMode ? activeWorkbookGuidedRange : (hunks[hunkIdx] ?? null),
    guidedPulseNonce,
    onScrollerReady: handleScrollerReady,
    onCollapseNavigationReady: handleCollapseNavigationReady,
  }), [
    diffLines, textDiffPresentation, syntaxPresentation, collapseCtx, hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions, searchJumpNonce,
    showWhitespace, fontSize,
    isWorkbookMode, activeWorkbookGuidedRange, hunks,
    guidedPulseNonce,
    handleScrollerReady, handleCollapseNavigationReady,
  ]);

  const handleHunkPrev = useCallback(() => startTransition(() => {
    setHunkIdx((i: number) => cycleHunkIndex(i, navigationCount, -1));
  }), [navigationCount, setHunkIdx]);
  const handleHunkNext = useCallback(() => startTransition(() => {
    setHunkIdx((i: number) => cycleHunkIndex(i, navigationCount, 1));
  }), [navigationCount, setHunkIdx]);
  const handlePickFile = useCallback(() => {
    void handlePickWorkingCopyFile();
  }, [handlePickWorkingCopyFile]);
  const handleToggleGoto = useCallback(() => setShowGoto((v: boolean) => !v), [setShowGoto]);
  const handleToggleHelp = useCallback(() => setShowHelp((v: boolean) => !v), [setShowHelp]);
  const handleToggleAbout = useCallback(() => setShowAbout((v: boolean) => !v), [setShowAbout]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────
  useAppKeyboardShortcuts({
    dialogs,
    isWorkbookMode,
    selectedCell,
    navigationCount,
    handleSearchPreviewNav,
    handleSearchNav,
    workbookMoveRef,
    collapseNavigationRef,
  });

  useWorkbookViewEffects({
    navigationCount,
    setHunkIdx,
    workbookSections,
    workbookUi,
    isWorkbookMode,
    selectedCell,
    activeSearchIdx,
    searchMatches,
    activeWorkbookDiffRegion,
    hunkPositions,
    hunkIdx,
    hasLoadedDiff,
    setGuidedPulseNonce,
    activeWorkbookTargetCell,
    hunks,
    scrollToIndexRef,
    diffLines,
  });

  useEffect(() => {
    if (isWorkbookMode) return;
    if (activeSearchIdx < 0) return;
    const activeSearchMatch = searchMatches[activeSearchIdx] ?? null;
    if (!activeSearchMatch) return;

    const rafId = requestAnimationFrame(() => {
      scrollToIndexRef.current?.(activeSearchMatch.lineIdx, 'center');
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeSearchIdx, isWorkbookMode, searchJumpNonce, searchMatches]);

  useEffect(() => {
    setWorkbookDebugEnabled(isDevMode);
  }, [isDevMode]);

  useEffect(() => {
    if (!isDevMode || !isWorkbookMode) return;
    const activeSheetName = activeWorkbookSheetName ?? workbookSections[0]?.name ?? null;
    if (!activeSheetName) return;
    const activeSectionRows = workbookSectionRowIndex.get(activeSheetName)?.rows ?? [];
    const activePayloadSection = precomputedWorkbookDelta?.sections.find((section) => section.name === activeSheetName) ?? null;

    workbookDebugLog('app/workbook-sheet-state', {
      activeSheetName,
      compareMode: workbookCompareMode,
      sectionCount: workbookSections.length,
      payloadSectionCount: precomputedWorkbookDelta?.sections.length ?? 0,
      activePayloadRowCount: activePayloadSection?.rows.length ?? 0,
      activeSectionRowCount: activeSectionRows.length,
      activeSectionPreview: activeSectionRows.slice(0, 8).map((row: SplitRow) => ({
        lineIdx: row.lineIdx,
        lineIdxs: row.lineIdxs,
        leftRowNumber: parseWorkbookRowLine(row.left)?.rowNumber ?? null,
        rightRowNumber: parseWorkbookRowLine(row.right)?.rowNumber ?? null,
        leftColumnCount: parseWorkbookRowLine(row.left)?.cells.length ?? 0,
        rightColumnCount: parseWorkbookRowLine(row.right)?.cells.length ?? 0,
        changedColumns: row.workbookRowDelta?.changedColumns ?? [],
      })),
      workbookSections: workbookSections.map((section) => ({
        name: section.name,
        changeType: section.changeType,
        startLineIdx: section.startLineIdx,
        endLineIdx: section.endLineIdx,
        maxColumns: section.maxColumns,
      })),
      activeDiffRegion: activeWorkbookDiffRegion
        ? {
            id: activeWorkbookDiffRegion.id,
            sheetName: activeWorkbookDiffRegion.sheetName,
            startRowIndex: activeWorkbookDiffRegion.startRowIndex,
            endRowIndex: activeWorkbookDiffRegion.endRowIndex,
            startCol: activeWorkbookDiffRegion.startCol,
            endCol: activeWorkbookDiffRegion.endCol,
          }
        : null,
    });
  }, [
    activeWorkbookDiffRegion,
    activeWorkbookSheetName,
    isDevMode,
    isWorkbookMode,
    precomputedWorkbookDelta,
    workbookCompareMode,
    workbookSectionRowIndex,
    workbookSections,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <ThemeContext.Provider value={themeKey}>
      <div className="font-ui bg-bg-surface-solid text-text-title flex flex-col relative flex-auto w-full h-full overflow-hidden min-w-0 min-h-0">
        <Toolbar
          fileName={displayFileName}
          themeKey={themeKey}         setThemeKey={setThemeKey}
          layout={layout}             setLayout={handleLayoutChange}
          hunkIdx={hunkIdx}           totalHunks={navigationCount}
          hunkTargetLabel={currentNavigationLabel}
          onPrev={handleHunkPrev}
          onNext={handleHunkNext}
          showSearch={showSearch}     setShowSearch={setShowSearch}
          collapseCtx={collapseCtx}   setCollapseCtx={setCollapseCtx}
          showWhitespace={showWhitespace} setShowWhitespace={setShowWhitespace}
          showHiddenColumns={showHiddenColumns} setShowHiddenColumns={setShowHiddenColumns}
          workbookCompareMode={workbookCompareMode}
          setWorkbookCompareMode={handleWorkbookCompareModeChange}
          fontSize={fontSize}         setFontSize={setFontSize}
          onPickFile={handlePickFile}
          onGoto={handleToggleGoto}
          onHelp={handleToggleHelp}
          onAbout={handleToggleAbout}
          isElectron={isElectron}
          usesNativeWindowControls={usesNativeWindowControls}
          isWindowMaximized={isWindowMaximized}
          isWorkbookMode={isWorkbookMode}
          updateState={appUpdateState}
          onCheckForUpdates={handleCheckForAppUpdate}
          onDownloadUpdate={handleDownloadAppUpdate}
          onInstallUpdate={handleInstallDownloadedUpdate}
        />

        {isDevMode && <PerfBar metrics={loadPerfMetrics} />}

        {showSearch && (
          <SearchBar
            query={searchQ}
            isRegex={searchRx}
            isCaseSensitive={searchCs}
            isWorkbookMode={isWorkbookMode}
            workbookSearchScope={searchWorkbookScope}
            activeSheetName={activeWorkbookSheetName}
            matchCount={searchMatches.length}
            activeIdx={activeSearchIdx}
            results={searchResultItems}
            onSearch={handleSearch}
            onPreviewNav={handleSearchPreviewNav}
            onNav={handleSearchNav}
            onJump={handleSearchJump}
            onClose={() => setShowSearch(false)}
          />
        )}

        {hasLoadedDiff && !isLoadingDiff && (
          <SplitHeader
            baseName={displayBaseName}
            mineName={displayMineName}
            baseTitle={baseRoleTitle}
            mineTitle={mineRoleTitle}
            baseValueLabel={baseVersionLabel}
            mineValueLabel={mineVersionLabel}
            layout={layout}
            isWorkbookMode={isWorkbookMode}
            baseRevisionInfo={baseRevisionInfo}
            mineRevisionInfo={mineRevisionInfo}
            revisionOptions={revisionOptions}
            canSwitchRevisions={canSwitchRevisions && isElectron}
            isLoadingRevisionOptions={revisionOptionsStatus === 'loading'}
            isSwitchingRevisions={isSwitchingRevisions || isLoadingDiff}
            revisionHasMore={revisionHasMore}
            revisionQueryDateTime={revisionQueryDateTime}
            revisionQueryError={revisionQueryError}
            isLoadingMoreRevisions={isLoadingMoreRevisions}
            isSearchingRevisionDateTime={isSearchingRevisionDateTime}
            onOpenRevisionPicker={handleEnsureRevisionOptionsLoaded}
            onRevisionChange={handleRevisionCompareChange}
            onResetCompare={canSwitchRevisions ? handleResetRevisionCompare : undefined}
            canResetCompare={Boolean(resetPair?.baseRevisionId || resetPair?.mineRevisionId)}
            onLoadMoreRevisions={handleLoadMoreRevisionOptions}
            onRevisionDateTimeQuery={handleRevisionDateTimeQuery}
          />
        )}

        {hasLoadedDiff && isWorkbookMode && (
          <WorkbookFormulaBar
            selection={workbookSelection}
            fontSize={fontSize}
            baseTitle={baseRoleTitle}
            mineTitle={mineRoleTitle}
            freezeState={activeFreezeState}
            mergeRanges={activeSelectionMergeRanges}
            onFreezeRow={handleFreezeRow}
            onFreezeColumn={handleFreezeColumn}
            onFreezePane={handleFreezePane}
            onUnfreezeRow={handleUnfreezeRow}
            onUnfreezeColumn={handleUnfreezeColumn}
            onResetFreeze={handleResetFreeze}
          />
        )}
        {hasLoadedDiff && isWorkbookMode && workbookArtifactDiff?.hasArtifactOnlyDiff && !artifactNoticeDismissed && (
          <WorkbookArtifactNoticeBar onClose={() => setArtifactNoticeDismissed(true)} />
        )}
        {hasLoadedDiff && diffSourceNoticeCode && !diffSourceNoticeDismissed && (
          <DiffSourceNoticeBar
            code={diffSourceNoticeCode}
            onClose={() => setDiffSourceNoticeDismissed(true)}
          />
        )}

        <AppContent
          loadingLabel={t('appLoadingDiff')}
          loadPhase={loadPhase}
          hasLoadedDiff={hasLoadedDiff}
          loadError={loadError}
          isElectron={isElectron}
          isLoadingDiff={isLoadingDiff}
          isWorkbookMode={isWorkbookMode}
          layout={layout}
          panelProps={panelProps}
          baseRoleTitle={baseRoleTitle}
          mineRoleTitle={mineRoleTitle}
          baseVersionLabel={baseVersionLabel}
          mineVersionLabel={mineVersionLabel}
          activeWorkbookDiffRegion={activeWorkbookDiffRegion}
          activeWorkbookTargetCell={activeWorkbookTargetCell}
          workbookSelection={workbookSelection}
          onWorkbookSelectionRequest={handleWorkbookSelectionRequest}
          onWorkbookNavigationReady={handleWorkbookNavigationReady}
          baseWorkbookMetadata={baseWorkbookMetadata}
          mineWorkbookMetadata={mineWorkbookMetadata}
          workbookHiddenStateBySheet={workbookHiddenStateBySheet}
          workbookFreezeBySheet={workbookFreezeBySheet}
          workbookColumnWidthBySheet={workbookColumnWidthBySheet}
          onWorkbookColumnWidthChange={handleWorkbookColumnWidthChange}
          workbookSections={workbookSections}
          workbookSectionRowIndex={workbookSectionRowIndex}
          activeWorkbookSheetName={activeWorkbookSheetName}
          onActiveWorkbookSheetChange={setActiveWorkbookSheetName}
          workbookCompareMode={workbookCompareMode}
          activeWorkbookSharedExpandedBlocks={activeWorkbookSharedExpandedBlocks}
          onWorkbookExpandedBlocksChange={handleWorkbookExpandedBlocksChange}
          isDevMode={isDevMode}
          showHiddenColumns={showHiddenColumns}
          workbookLayoutSnapshots={workbookLayoutSnapshotsRef.current}
          onWorkbookLayoutSnapshotChange={handleWorkbookLayoutSnapshotChange}
          workbookContextMenu={workbookContextMenu}
          workbookContextMenuSections={workbookContextMenuSections}
          onCloseWorkbookContextMenu={() => setWorkbookContextMenu(null)}
          onPickWorkingCopyFile={() => {
            void handlePickWorkingCopyFile();
          }}
          onOpenSvnConfig={handleOpenSvnConfig}
          setWorkbookHiddenStateBySheet={setWorkbookHiddenStateBySheet}
        />

        <StatsBar
          textDiffPresentation={textDiffPresentation}
          baseName={displayBaseName}
          mineName={displayMineName}
          baseTitle={baseStatsTitle}
          mineTitle={mineStatsTitle}
          fileName={displayFileName}
          totalLines={totalLines}
          baseVersionLabel={baseVersionLabel}
          mineVersionLabel={mineVersionLabel}
          isWorkbookMode={isWorkbookMode}
          workbookCompareMode={workbookCompareMode}
          workbookArtifactDiff={workbookArtifactDiff}
          workbookSections={workbookSections}
        />

        <AppDialogs
          showGoto={showGoto}
          showHelp={showHelp}
          showAbout={showAbout}
          showSvnConfig={showSvnConfig}
          totalLines={totalLines}
          onGoto={handleGoto}
          onCloseGoto={() => setShowGoto(false)}
          onCloseHelp={() => setShowHelp(false)}
          onCloseAbout={() => setShowAbout(false)}
          onCloseSvnConfig={() => setShowSvnConfig(false)}
          onCloseAll={closeAllDialogs}
          appUpdateState={appUpdateState}
          canLaunchUninstaller={canLaunchUninstaller}
          onCheckForUpdates={handleCheckForAppUpdate}
          onDownloadUpdate={handleDownloadAppUpdate}
          onInstallUpdate={handleInstallDownloadedUpdate}
          onLaunchUninstaller={() => {
            void handleLaunchUninstaller();
          }}
          svnDiffViewerStatus={svnDiffViewerStatus}
          isLoadingSvnDiffViewerStatus={isLoadingSvnDiffViewerStatus}
          applyingSvnDiffViewerScope={applyingSvnDiffViewerScope}
          isRestoringSvnDiffViewerDefault={isRestoringSvnDiffViewerDefault}
          svnDiffViewerError={svnDiffViewerError}
          onApplySvnDiffViewerScope={(scope) => {
            void handleApplySvnDiffViewerScope(scope);
          }}
          onRestoreSvnDiffViewerDefault={() => {
            void handleRestoreSvnDiffViewerDefault();
          }}
          onRefreshSvnDiffViewerStatus={() => {
            void loadSvnDiffViewerStatus();
          }}
        />
      </div>
    </ThemeContext.Provider>
  );
}
