// ─────────────────────────────────────────────────────────────────────────────
// src/App.tsx  —  SvnDiffTool root
//
// This file is now a thin orchestrator:
//   - Reads state from Zustand store (only fields needed for rendering)
//   - Manages imperative refs
//   - Renders the layout, delegating visuals to components/
// ─────────────────────────────────────────────────────────────────────────────

import {
  useRef, useCallback, useEffect, useMemo, useState, startTransition, type SetStateAction,
} from 'react';

import type {
  DiffData,
  SvnRevisionInfo,
  TextLayoutSnapshot,
  TextLineSelectionSummary,
  WorkbookCompareLayoutSnapshot,
  WorkbookHorizontalLayoutSnapshot,
  WorkbookMoveDirection,
} from '@/types';
import { createEmptyTextLayoutSnapshots, type TextLayoutSnapshotsByMode } from '@/utils/diff/textLayoutState';
import {
  buildReplacementPairIndexFromPairs,
} from '@/utils/diff/preparedTextAnalysis';
import { buildVersionCopyText } from '@/utils/diff/textCopy';
import { useI18n } from '@/context/i18n';
import { ThemeContext } from '@/context/theme';
import {
  applyWorkbookExpandedBlocksChange,
  applyWorkbookLayoutSnapshot,
  createEmptyWorkbookLayoutSnapshots,
  type WorkbookLayoutSnapshotsByMode,
} from '@/utils/workbook/workbookLayoutState';
import {
  cloneCollapseExpansionState,
  EMPTY_COLLAPSE_EXPANSION_STATE,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';
import { AppContent, AppDialogs } from '@/components/app-shell';
import {
  useAppChromeEffects,
  useAppKeyboardShortcuts,
  useAppRuntimeEffects,
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
import { getPreparedWorkbookDeltaForMode } from '@/hooks/app/helpers';
import { useAppStore } from '@/store/appStore';
import PerfBar from '@/components/app/PerfBar';
import AppUpdateInstalledNoticeBar from '@/components/app/AppUpdateInstalledNoticeBar';
import DiffSourceNoticeBar from '@/components/diff/DiffSourceNoticeBar';
import SearchBar from '@/components/diff/SearchBar';
import WorkbookFormulaBar from '@/components/workbook/WorkbookFormulaBar';
import WorkbookArtifactNoticeBar from '@/components/workbook/WorkbookArtifactNoticeBar';
import Toolbar from '@/components/navigation/Toolbar';
import SplitHeader from '@/components/navigation/SplitHeader';
import StatsBar from '@/components/navigation/StatsBar';
import { copyText } from '@/utils/app/clipboard';
import { recordPerfBridgeEvent } from '@/utils/app/perfBridge';
import { findWorkbookDiffRegionNavigationIndex } from '@/utils/workbook/workbookDiffRegion';

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
  const setTextSplitHeaderRatio = useAppStore((s) => s.setTextSplitHeaderRatio);

  // Diff Data (needed by JSX: notice bars, panelProps, debug)
  const diffLines = useAppStore((s) => s.diffLines);
  const diffSourceNoticeCode = useAppStore((s) => s.diffSourceNoticeCode);
  const diffSourceNoticeDismissed = useAppStore((s) => s.diffSourceNoticeDismissed);
  const workbookArtifactDiff = useAppStore((s) => s.workbookArtifactDiff);
  const compareContext = useAppStore((s) => s.compareContext);
  const artifactNoticeDismissed = useAppStore((s) => s.artifactNoticeDismissed);
  const setArtifactNoticeDismissed = useAppStore((s) => s.setArtifactNoticeDismissed);
  const setDiffSourceNoticeDismissed = useAppStore((s) => s.setDiffSourceNoticeDismissed);

  // Search (needed by JSX: SearchBar, panelProps)
  const searchQ = useAppStore((s) => s.searchQ);
  const searchRx = useAppStore((s) => s.searchRx);
  const searchCs = useAppStore((s) => s.searchCs);
  const searchWorkbookScope = useAppStore((s) => s.searchWorkbookScope);
  const activeSearchIdx = useAppStore((s) => s.activeSearchIdx);
  const resetSearchState = useAppStore((s) => s.resetSearchState);

  // Navigation (needed by JSX: Toolbar, panelProps, handlers)
  const hunkIdx = useAppStore((s) => s.hunkIdx);
  const setHunkIdx = useAppStore((s) => s.setHunkIdx);
  const setGuidedPulseNonce = useAppStore((s) => s.setGuidedPulseNonce);

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
  const startupRevealRequestedRef = useRef(false);
  const hasLoadedDiffRef = useRef(false);
  const workbookCompareModeRef = useRef(workbookCompareMode);
  const currentDiffDataRef = useRef<DiffData | null>(null);
  const diffResultCacheRef = useRef<Map<string, CachedDiffResult>>(new Map());
  const textLayoutSnapshotsRef = useRef<TextLayoutSnapshotsByMode>(
    createEmptyTextLayoutSnapshots(),
  );
  const textSharedExpandedBlocksRef = useRef<CollapseExpansionState>(EMPTY_COLLAPSE_EXPANSION_STATE);
  const workbookLayoutSnapshotsRef = useRef<WorkbookLayoutSnapshotsByMode>(
    createEmptyWorkbookLayoutSnapshots(),
  );
  const workbookSharedExpandedBlocksRef = useRef<Map<string, CollapseExpansionState>>(new Map());
  const revisionOptionsRef = useRef<SvnRevisionInfo[]>([]);
  const revisionQuerySeqRef = useRef(0);
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
    showLocalFileCompare,
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
  const setShowLocalFileCompare = useCallback((value: SetStateAction<boolean>) => {
    dialogActions.set('localFileCompare', value);
  }, [dialogActions]);
  const closeAllDialogs = dialogActions.closeAll;
  const previousShowSearchRef = useRef(showSearch);
  const [installedUpdateVersion, setInstalledUpdateVersion] = useState<string | null>(null);

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
    twoFileBasePath,
    twoFileMinePath,
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
    preparedTextAnalysis,
    textDiffStats,
    hunkPositions,
    searchJumpNonce,
    isSearching,
    searchMatches,
    searchResultItemResolver,
    workbookSections,
    workbookSectionRowIndex,
    modifiedWorkbookSheetNames,
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
    currentDiffData: currentDiffDataRef.current,
  });
  const textDiffPresentation = useMemo(() => ({
    stats: preparedTextAnalysis?.stats ?? textDiffStats,
    replacementPairIndex: (!isWorkbookMode && layout === 'unified')
      ? buildReplacementPairIndexFromPairs(preparedTextAnalysis?.replacementPairs ?? [])
      : EMPTY_REPLACEMENT_PAIR_INDEX,
  }), [isWorkbookMode, layout, preparedTextAnalysis, textDiffStats]);
  const syntaxPresentation = useSyntaxHighlightPresentation({
    currentDiffData: currentDiffDataRef.current,
    isWorkbookMode,
    themeKey,
  });
  const preparedWorkbookDelta = getPreparedWorkbookDeltaForMode(
    currentDiffDataRef.current,
    workbookCompareMode,
  );

  useEffect(() => {
    if (previousShowSearchRef.current && !showSearch) {
      resetSearchState();
    }
    previousShowSearchRef.current = showSearch;
  }, [resetSearchState, showSearch]);

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
    pickComparableFile,
    handleCompareLocalFiles,
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
    textLayoutSnapshotsRef,
    textSharedExpandedBlocksRef,
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
    onLaunchedAfterUpdate: setInstalledUpdateVersion,
    workbookCompareModeRef,
    loadSeqRef,
    revisionQuerySeqRef,
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
    if (nextLayout === layout) return;
    recordPerfBridgeEvent('layout-change:start', {
      fileName: displayFileName,
      fromLayout: layout,
      toLayout: nextLayout,
      isWorkbookMode,
      compareMode: workbookCompareMode,
    });
    startTransition(() => {
      setLayout(nextLayout);
    });
  }, [displayFileName, isWorkbookMode, layout, setLayout, workbookCompareMode]);
  const handleTextLayoutSnapshotChange = useCallback((snapshot: TextLayoutSnapshot) => {
    textLayoutSnapshotsRef.current = {
      ...textLayoutSnapshotsRef.current,
      [snapshot.layout]: snapshot,
    };
    if (snapshot.layout === 'split-h') {
      setTextSplitHeaderRatio(snapshot.splitRatio);
    }
  }, [setTextSplitHeaderRatio]);
  const handleTextExpandedBlocksChange = useCallback((expandedBlocks: CollapseExpansionState) => {
    const nextExpandedBlocks = cloneCollapseExpansionState(expandedBlocks);
    textSharedExpandedBlocksRef.current = nextExpandedBlocks;
    textLayoutSnapshotsRef.current = {
      unified: textLayoutSnapshotsRef.current.unified
        ? { ...textLayoutSnapshotsRef.current.unified, expandedBlocks: nextExpandedBlocks }
        : textLayoutSnapshotsRef.current.unified,
      'split-h': textLayoutSnapshotsRef.current['split-h']
        ? { ...textLayoutSnapshotsRef.current['split-h'], expandedBlocks: nextExpandedBlocks }
        : textLayoutSnapshotsRef.current['split-h'],
      'split-v': textLayoutSnapshotsRef.current['split-v']
        ? { ...textLayoutSnapshotsRef.current['split-v'], expandedBlocks: nextExpandedBlocks }
        : textLayoutSnapshotsRef.current['split-v'],
    };
  }, []);
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

  const [textLineSelectionSummary, setTextLineSelectionSummary] = useState<TextLineSelectionSummary | null>(null);

  const panelProps = useMemo(() => ({
    diffLines,
    splitRowDescriptors: preparedTextAnalysis?.splitRowDescriptors ?? null,
    textDiffPresentation,
    syntaxPresentation,
    baseVersionLabel,
    mineVersionLabel,
    collapseCtx,
    activeHunkIdx: hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions, searchJumpNonce,
    showWhitespace, fontSize,
    guidedLineIdx: null,
    guidedHunkRange: isWorkbookMode ? activeWorkbookGuidedRange : (hunks[hunkIdx] ?? null),
    onScrollerReady: handleScrollerReady,
    onCollapseNavigationReady: handleCollapseNavigationReady,
    onLineSelectionChange: setTextLineSelectionSummary,
  }), [
    diffLines, preparedTextAnalysis, textDiffPresentation, syntaxPresentation, baseVersionLabel, mineVersionLabel, collapseCtx, hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions, searchJumpNonce,
    showWhitespace, fontSize,
    isWorkbookMode, activeWorkbookGuidedRange, hunks,
    handleScrollerReady, handleCollapseNavigationReady,
  ]);

  const handleNavigationStep = useCallback((direction: -1 | 1) => startTransition(() => {
    // A cyclic navigation can resolve to the current index (most notably for
    // a single diff). Keep a separate activation nonce so clicking the button
    // still re-focuses an off-screen workbook cell.
    setGuidedPulseNonce((currentNonce: number) => currentNonce + 1);
    setHunkIdx((currentIndex: number) => {
      if (!isWorkbookMode) {
        return cycleHunkIndex(currentIndex, navigationCount, direction);
      }

      return findWorkbookDiffRegionNavigationIndex({
        regions: workbookDiffRegions,
        currentIndex,
        direction,
        activeSheetName: activeWorkbookSheetName,
        sheetOrder: workbookSections.map((section) => section.name),
      });
    });
  }), [
    activeWorkbookSheetName,
    isWorkbookMode,
    navigationCount,
    setGuidedPulseNonce,
    setHunkIdx,
    workbookDiffRegions,
    workbookSections,
  ]);
  const handleHunkPrev = useCallback(() => {
    handleNavigationStep(-1);
  }, [handleNavigationStep]);
  const handleHunkNext = useCallback(() => {
    handleNavigationStep(1);
  }, [handleNavigationStep]);
  const handleCopyBaseVersion = useCallback(async () => (
    copyText(buildVersionCopyText(diffLines, 'base'))
  ), [diffLines]);
  const handleCopyMineVersion = useCallback(async () => (
    copyText(buildVersionCopyText(diffLines, 'mine'))
  ), [diffLines]);
  const handleOpenLocalFileCompare = useCallback(() => {
    setShowLocalFileCompare(true);
  }, [setShowLocalFileCompare]);
  const handlePickFile = useCallback(() => {
    if (compareContext === 'literal_two_file_compare') {
      handleOpenLocalFileCompare();
      return;
    }
    void handlePickWorkingCopyFile();
  }, [compareContext, handleOpenLocalFileCompare, handlePickWorkingCopyFile]);
  const handleInitialVisualReady = useCallback(() => {
    if (startupRevealRequestedRef.current) return;
    startupRevealRequestedRef.current = true;
    window.svnDiff?.notifyRendererReady?.();
  }, []);
  const handleToggleGoto = useCallback(() => setShowGoto((v: boolean) => !v), [setShowGoto]);
  const handleToggleHelp = useCallback(() => setShowHelp((v: boolean) => !v), [setShowHelp]);
  const handleToggleAbout = useCallback(() => setShowAbout((v: boolean) => !v), [setShowAbout]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────
  useAppKeyboardShortcuts({
    dialogs,
    isWorkbookMode,
    selectedCell,
    handleNavigationStep,
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
    searchJumpNonce,
    searchMatches,
    activeWorkbookDiffRegion,
    hunkPositions,
    hunkIdx,
    activeWorkbookTargetCell,
    hunks,
    scrollToIndexRef,
    diffLines,
  });

  useAppRuntimeEffects({
    applyDiffData,
    displayFileName,
    hasLoadedDiff,
    isDevMode,
    isElectron,
    isLoadingDiff,
    isWorkbookMode,
    layout,
    loadPhase,
    loadPerfMetrics,
    setCollapseCtx,
    setLayout,
    activeSearchIdx,
    searchJumpNonce,
    searchMatches,
    scrollToIndexRef,
    setTextLineSelectionSummary,
    activeWorkbookDiffRegion,
    activeWorkbookSheetName,
    preparedWorkbookSectionsDelta: preparedWorkbookDelta?.sections ?? null,
    workbookCompareMode,
    workbookSectionRowIndex,
    workbookSections,
  });

  // ── Render ─────────────────────────────────────────────────────────────

  const isHomeSurfaceVisible = !hasLoadedDiff && loadPhase !== 'loading' && loadPhase !== 'bootstrapping';
  const windowFrameClassName = isElectron && !isWindowMaximized
    ? 'app-window-frame app-window-frame--floating'
    : 'app-window-frame app-window-frame--flush';
  const windowSurfaceBaseClassName = isElectron && !isWindowMaximized
    ? 'app-window-surface app-window-surface--floating app-shell-no-select font-ui text-text-title flex flex-col relative flex-auto w-full h-full overflow-hidden min-w-0 min-h-0'
    : 'app-window-surface app-window-surface--flush app-shell-no-select font-ui text-text-title flex flex-col relative flex-auto w-full h-full overflow-hidden min-w-0 min-h-0';
  const windowSurfaceClassName = isHomeSurfaceVisible
    ? `${windowSurfaceBaseClassName} app-window-surface--home`
    : windowSurfaceBaseClassName;

  return (
    <ThemeContext.Provider value={themeKey}>
      <div className={windowFrameClassName}>
        <div className={windowSurfaceClassName}>
          <Toolbar
            fileName={displayFileName}
            isHome={isHomeSurfaceVisible}
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

          {!isHomeSurfaceVisible && showSearch && (
            <SearchBar
              query={searchQ}
              isRegex={searchRx}
              isCaseSensitive={searchCs}
              isWorkbookMode={isWorkbookMode}
              workbookSearchScope={searchWorkbookScope}
              activeSheetName={activeWorkbookSheetName}
              matchCount={searchMatches.length}
              activeIdx={activeSearchIdx}
              isSearching={isSearching}
              resolveResult={searchResultItemResolver}
              onSearch={handleSearch}
              onPreviewNav={handleSearchPreviewNav}
              onNav={handleSearchNav}
              onJump={handleSearchJump}
              onClose={() => setShowSearch(false)}
            />
          )}

          {installedUpdateVersion && (
            <AppUpdateInstalledNoticeBar
              version={installedUpdateVersion}
              onClose={() => setInstalledUpdateVersion(null)}
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
              isTwoFileCompare={compareContext === 'literal_two_file_compare'}
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
              onBaseCopy={!isWorkbookMode ? handleCopyBaseVersion : undefined}
              onMineCopy={!isWorkbookMode ? handleCopyMineVersion : undefined}
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
            textLayoutSnapshots={textLayoutSnapshotsRef.current}
            onTextLayoutSnapshotChange={handleTextLayoutSnapshotChange}
            textSharedExpandedBlocks={textSharedExpandedBlocksRef.current}
            onTextExpandedBlocksChange={handleTextExpandedBlocksChange}
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
            modifiedWorkbookSheetNames={modifiedWorkbookSheetNames}
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
            onOpenLocalFileCompare={handleOpenLocalFileCompare}
            onOpenSvnConfig={handleOpenSvnConfig}
            setWorkbookHiddenStateBySheet={setWorkbookHiddenStateBySheet}
            onInitialVisualReady={handleInitialVisualReady}
          />

          {hasLoadedDiff && (
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
              lineSelectionSummary={!isWorkbookMode ? textLineSelectionSummary : null}
            />
          )}

          <AppDialogs
            showGoto={showGoto}
            showHelp={showHelp}
            showAbout={showAbout}
            showSvnConfig={showSvnConfig}
            showLocalFileCompare={showLocalFileCompare}
            localFileCompareLoading={isLoadingDiff}
            localFileCompareError={loadError}
            localFileCompareBasePath={twoFileBasePath}
            localFileCompareMinePath={twoFileMinePath}
            totalLines={totalLines}
            onGoto={handleGoto}
            onCloseGoto={() => setShowGoto(false)}
            onCloseHelp={() => setShowHelp(false)}
            onCloseAbout={() => setShowAbout(false)}
            onCloseSvnConfig={() => setShowSvnConfig(false)}
            onCloseLocalFileCompare={() => setShowLocalFileCompare(false)}
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
            onPickComparableFile={pickComparableFile}
            onCompareLocalFiles={handleCompareLocalFiles}
          />
        </div>
      </div>
    </ThemeContext.Provider>
  );
}
