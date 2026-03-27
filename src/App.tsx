// ─────────────────────────────────────────────────────────────────────────────
// src/App.tsx  —  SvnExcelDiffTool root
//
// This file is now a thin orchestrator:
//   - Loads diff data (Electron IPC)
//   - Manages all top-level state
//   - Handles keyboard shortcuts
//   - Renders the layout, delegating visuals to components/
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useRef, useCallback, useMemo, startTransition, type SetStateAction,
} from 'react';

import type {
  DiffLine,
  DiffData,
  ThemeKey,
  LayoutMode,
  AppUpdateState,
  CompareContext,
  RevisionSelectionPair,
  SvnRevisionInfo,
  WorkbookArtifactDiff,
  WorkbookCompareMode,
  WorkbookCompareLayoutSnapshot,
  DiffSourceNoticeCode,
  WorkbookHiddenStateBySheet,
  WorkbookHorizontalLayoutSnapshot,
  WorkbookMetadataMap,
  WorkbookMoveDirection,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSelectionState,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from '@/types';
import { THEMES } from '@/theme';
import { useI18n } from '@/context/i18n';
import { ThemeContext } from '@/context/theme';
import { FONT_UI } from '@/constants/typography';
import {
  applyWorkbookExpandedBlocksChange,
  applyWorkbookLayoutSnapshot,
  createEmptyWorkbookLayoutSnapshots,
  type WorkbookLayoutSnapshotsByMode,
} from '@/utils/workbook/workbookLayoutState';
import { getStoredAppSettings } from '@/utils/app/settings';
import {
  type WorkbookColumnWidthBySheet,
} from '@/utils/workbook/workbookColumnWidths';
import { createWorkbookSelectionState } from '@/utils/workbook/workbookSelectionState';
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
  useWorkbookActions,
  useWorkbookViewEffects,
  cycleHunkIndex,
  type CachedDiffResult,
  type WorkbookContextMenuState,
  type WorkbookFreezeStateMap,
  type WorkbookUiController,
} from '@/hooks/app';
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

export default function App() {
  const { t } = useI18n();
  const initialSettingsRef = useRef(getStoredAppSettings());
  const initialSettings = initialSettingsRef.current;

  // ── State ──────────────────────────────────────────────────────────────────
  const [themeKey, setThemeKey]             = useState<ThemeKey>(initialSettings.themeKey);
  const [layout, setLayout]                 = useState<LayoutMode>(initialSettings.layout);
  const [diffLines, setDiffLines]           = useState<DiffLine[]>([]);
  const [baseName, setBaseName]             = useState('');
  const [mineName, setMineName]             = useState('');
  const [launchBaseName, setLaunchBaseName] = useState('');
  const [launchMineName, setLaunchMineName] = useState('');
  const [fileName, setFileName]             = useState('');
  const [collapseCtx, setCollapseCtx]       = useState(initialSettings.collapseCtx);
  const [showWhitespace, setShowWhitespace] = useState(initialSettings.showWhitespace);
  const [showHiddenColumns, setShowHiddenColumns] = useState(initialSettings.showHiddenColumns);
  const [workbookCompareMode, setWorkbookCompareMode] = useState<WorkbookCompareMode>(initialSettings.workbookCompareMode);
  const [fontSize, setFontSize]             = useState(initialSettings.fontSize);
  const [hunkIdx, setHunkIdx]               = useState(0);
  const [searchQ, setSearchQ]               = useState('');
  const [searchRx, setSearchRx]             = useState(false);
  const [searchCs, setSearchCs]             = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const [isElectron, setIsElectron]         = useState(false);
  const [isDevMode, setIsDevMode]           = useState(false);
  const [usesNativeWindowControls, setUsesNativeWindowControls] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [workbookSelection, setWorkbookSelection] = useState<WorkbookSelectionState>(() => createWorkbookSelectionState(null));
  const [workbookHiddenStateBySheet, setWorkbookHiddenStateBySheet] = useState<WorkbookHiddenStateBySheet>({});
  const [workbookContextMenu, setWorkbookContextMenu] = useState<WorkbookContextMenuState | null>(null);
  const [baseWorkbookMetadata, setBaseWorkbookMetadata] = useState<WorkbookMetadataMap | null>(null);
  const [mineWorkbookMetadata, setMineWorkbookMetadata] = useState<WorkbookMetadataMap | null>(null);
  const [precomputedWorkbookDelta, setPrecomputedWorkbookDelta] = useState<WorkbookPrecomputedDeltaPayload | null>(null);
  const [workbookArtifactDiff, setWorkbookArtifactDiff] = useState<WorkbookArtifactDiff | null>(null);
  const [artifactNoticeDismissed, setArtifactNoticeDismissed] = useState(false);
  const [diffSourceNoticeCode, setDiffSourceNoticeCode] = useState<DiffSourceNoticeCode | null>(null);
  const [diffSourceNoticeDismissed, setDiffSourceNoticeDismissed] = useState(false);
  const [compareContext, setCompareContext] = useState<CompareContext>('literal_two_file_compare');
  const [resetPair, setResetPair] = useState<RevisionSelectionPair | null>(null);
  const [revisionOptions, setRevisionOptions] = useState<SvnRevisionInfo[]>([]);
  const [baseRevisionInfo, setBaseRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [mineRevisionInfo, setMineRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [canSwitchRevisions, setCanSwitchRevisions] = useState(false);
  const [workbookFreezeBySheet, setWorkbookFreezeBySheet] = useState<WorkbookFreezeStateMap>({});
  const [workbookColumnWidthBySheet, setWorkbookColumnWidthBySheet] = useState<WorkbookColumnWidthBySheet>({});
  const [activeWorkbookSheetName, setActiveWorkbookSheetName] = useState<string | null>(null);
  const [guidedPulseNonce, setGuidedPulseNonce] = useState(0);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState | null>(null);
  const [svnDiffViewerStatus, setSvnDiffViewerStatus] = useState<SvnDiffViewerStatus | null>(null);
  const [isLoadingSvnDiffViewerStatus, setIsLoadingSvnDiffViewerStatus] = useState(false);
  const [applyingSvnDiffViewerScope, setApplyingSvnDiffViewerScope] = useState<SvnDiffViewerScope | null>(null);
  const [svnDiffViewerError, setSvnDiffViewerError] = useState('');
  const loadSeqRef = useRef(0);
  const hasLoadedDiffRef = useRef(false);
  const workbookCompareModeRef = useRef<WorkbookCompareMode>(workbookCompareMode);
  const currentDiffDataRef = useRef<DiffData | null>(null);
  const diffResultCacheRef = useRef<Map<string, CachedDiffResult>>(new Map());
  const workbookLayoutSnapshotsRef = useRef<WorkbookLayoutSnapshotsByMode>(
    createEmptyWorkbookLayoutSnapshots(),
  );
  const workbookSharedExpandedBlocksRef = useRef<Map<string, CollapseExpansionState>>(new Map());
  const revisionOptionsRef = useRef<SvnRevisionInfo[]>([]);
  const revisionQuerySeqRef = useRef(0);
  const updateAutoCheckRequestedRef = useRef(false);

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

  const T = THEMES[themeKey];

  // scrollToIndex exposed by the active panel — used by Goto and hunk nav
  const scrollToIndexRef = useRef<((idx: number, align?: 'start' | 'center') => void) | null>(null);
  const workbookMoveRef = useRef<((direction: WorkbookMoveDirection) => void) | null>(null);
  const collapseNavigationRef = useRef<((direction: 'prev' | 'next') => void) | null>(null);

  const persistedSettings = useMemo(() => ({
    themeKey,
    layout,
    collapseCtx,
    showWhitespace,
    showHiddenColumns,
    workbookCompareMode,
    fontSize,
  }), [
    collapseCtx,
    fontSize,
    layout,
    showHiddenColumns,
    showWhitespace,
    themeKey,
    workbookCompareMode,
  ]);

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
  ]);

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
    textDiffPresentation,
    hunkPositions,
    searchMatches,
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
    handleSearchNav,
    handleGoto,
  } = useAppViewModel({
    t,
    compareContext,
    launchBaseName,
    baseName,
    launchMineName,
    mineName,
    fileName,
    baseRevisionInfo,
    mineRevisionInfo,
    workbookSelection,
    workbookFreezeBySheet,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
    workbookArtifactDiff,
    diffSourceNoticeCode,
    diffLines,
    searchQ,
    searchRx,
    searchCs,
    isElectron,
    isDevMode,
    workbookCompareMode,
    precomputedWorkbookDelta,
    hunkIdx,
    activeWorkbookSheetName,
    workbookSharedExpandedBlocksRef,
    setSearchQ,
    setSearchRx,
    setSearchCs,
    setActiveSearchIdx,
    scrollToIndexRef,
  });

  useAppChromeEffects({
    theme: T,
    isElectron,
    usesNativeWindowControls,
    revisionOptions,
    revisionOptionsRef,
    artifactNoticeKey,
    setArtifactNoticeDismissed,
    diffSourceNoticeKey,
    setDiffSourceNoticeDismissed,
    hasLoadedDiff,
    hasLoadedDiffRef,
    workbookCompareMode,
    workbookCompareModeRef,
    settings: persistedSettings,
  });

  const {
    beginDiffLoad,
    failDiffLoad,
    applyDiffData,
    handleWorkbookCompareModeChange,
    handlePickWorkingCopyFile,
    loadSvnDiffViewerStatus,
    handleOpenSvnConfig,
    handleApplySvnDiffViewerScope,
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
    setBaseName,
    setMineName,
    setLaunchBaseName,
    setLaunchMineName,
    setFileName,
    setPrecomputedWorkbookDelta,
    setWorkbookArtifactDiff,
    setBaseWorkbookMetadata,
    setMineWorkbookMetadata,
    setRevisionOptions,
    setBaseRevisionInfo,
    setMineRevisionInfo,
    setCompareContext,
    setResetPair,
    setCanSwitchRevisions,
    setDiffLines,
    setDiffSourceNoticeCode,
    setHunkIdx,
    setWorkbookCompareMode,
    setIsLoadingSvnDiffViewerStatus,
    setSvnDiffViewerError,
    setSvnDiffViewerStatus,
    setApplyingSvnDiffViewerScope,
  });

  const {
    queryRevisionOptionsPage,
    handleLoadMoreRevisionOptions,
    handleRevisionDateTimeQuery,
    handleRevisionCompareChange,
    handleResetRevisionCompare,
  } = useRevisionCompare({
    revisionOptionsRef,
    revisionQuerySeqRef,
    loadSeqRef,
    workbookCompareModeRef,
    resetPair,
    revisionQuery,
    applyDiffData,
    beginDiffLoad,
    failDiffLoad,
    setRevisionOptions,
    setBaseRevisionInfo,
    setMineRevisionInfo,
  });

  useElectronLifecycleEffects({
    applyDiffData,
    beginDiffLoad,
    reloadCliDiffData,
    queryRevisionOptionsPage,
    workbookCompareModeRef,
    loadSeqRef,
    revisionQuerySeqRef,
    updateAutoCheckRequestedRef,
    diffLoad,
    revisionQuery,
    canSwitchRevisions,
    setIsElectron,
    setRevisionOptions,
    setDiffSourceNoticeCode,
    setCompareContext,
    setResetPair,
    setLaunchBaseName,
    setLaunchMineName,
    setIsDevMode,
    setUsesNativeWindowControls,
    setIsWindowMaximized,
    setAppUpdateState,
  });

  const {
    handleCheckForAppUpdate,
    handleDownloadAppUpdate,
    handleInstallDownloadedUpdate,
    handleLaunchUninstaller,
  } = useAppUpdateActions(t);

  const handleScrollerReady = useCallback(
    (fn: (idx: number, align?: 'start' | 'center') => void) => {
      scrollToIndexRef.current = fn;
    },
    [],
  );
  const handleLayoutChange = useCallback((nextLayout: LayoutMode) => {
    startTransition(() => {
      setLayout(nextLayout);
    });
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

  const panelProps = {
    diffLines, textDiffPresentation, collapseCtx, activeHunkIdx: hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions,
    showWhitespace, fontSize,
    guidedLineIdx: null,
    guidedHunkRange: isWorkbookMode ? activeWorkbookGuidedRange : (hunks[hunkIdx] ?? null),
    guidedPulseNonce,
    onScrollerReady: handleScrollerReady,
    onCollapseNavigationReady: handleCollapseNavigationReady,
  };

  useAppKeyboardShortcuts({
    dialogs,
    isWorkbookMode,
    selectedCell,
    navigationCount,
    handleSearchNav,
    setHunkIdx,
    setShowWhitespace,
    setFontSize,
    setWorkbookContextMenu,
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemeContext.Provider value={T}>
      <div style={{
        fontFamily: FONT_UI,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 22%, ${T.bg0} 100%)`,
        color: T.t0,
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        minWidth: 0, minHeight: 0,
      }}>
        <Toolbar
          fileName={displayFileName}
          themeKey={themeKey}         setThemeKey={setThemeKey}
          layout={layout}             setLayout={handleLayoutChange}
          hunkIdx={hunkIdx}           totalHunks={navigationCount}
          hunkTargetLabel={currentNavigationLabel}
          onPrev={() => setHunkIdx(i => cycleHunkIndex(i, navigationCount, -1))}
          onNext={() => setHunkIdx(i => cycleHunkIndex(i, navigationCount, 1))}
          showSearch={showSearch}     setShowSearch={setShowSearch}
          collapseCtx={collapseCtx}   setCollapseCtx={setCollapseCtx}
          showWhitespace={showWhitespace} setShowWhitespace={setShowWhitespace}
          showHiddenColumns={showHiddenColumns} setShowHiddenColumns={setShowHiddenColumns}
          workbookCompareMode={workbookCompareMode}
          setWorkbookCompareMode={handleWorkbookCompareModeChange}
          fontSize={fontSize}         setFontSize={setFontSize}
          onPickFile={() => {
            void handlePickWorkingCopyFile();
          }}
          onGoto={() => setShowGoto(v => !v)}
          onHelp={() => setShowHelp(v => !v)}
          onAbout={() => setShowAbout(v => !v)}
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
            matchCount={searchMatches.length}
            activeIdx={activeSearchIdx}
            onSearch={handleSearch}
            onNav={handleSearchNav}
            onClose={() => setShowSearch(false)}
          />
        )}

        {(isLoadingDiff || hasLoadedDiff) && (
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
          theme={T}
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
          svnDiffViewerError={svnDiffViewerError}
          onApplySvnDiffViewerScope={(scope) => {
            void handleApplySvnDiffViewerScope(scope);
          }}
          onRefreshSvnDiffViewerStatus={() => {
            void loadSvnDiffViewerStatus();
          }}
        />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes guidedPulse{0%{box-shadow:0 0 0 0 ${T.acc2}00,inset 0 0 0 2px ${T.acc2}f2}50%{box-shadow:0 0 0 8px ${T.acc2}26,inset 0 0 0 2px ${T.acc2}}100%{box-shadow:0 0 0 0 ${T.acc2}00,inset 0 0 0 2px ${T.acc2}b8}}@keyframes regionDashTravel{from{stroke-dashoffset:0}to{stroke-dashoffset:-100}}@keyframes regionDashTravelReverse{from{stroke-dashoffset:0}to{stroke-dashoffset:100}}@keyframes regionGlowPulse{0%{opacity:.44;transform:scale(.985)}50%{opacity:.82;transform:scale(1.02)}100%{opacity:.44;transform:scale(.985)}}`}</style>
      </div>
    </ThemeContext.Provider>
  );
}
