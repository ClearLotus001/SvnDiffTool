import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type {
  CompareContext,
  DiffData,
  DiffLine,
  DiffSourceNoticeCode,
  RevisionSelectionPair,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
  SvnRevisionInfo,
  WorkbookArtifactDiff,
  WorkbookCompareMode,
  WorkbookMetadataMap,
  WorkbookMetadataSource,
  WorkbookPrecomputedDeltaPayload,
} from '@/types';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { buildDiffCacheKey } from '@/utils/diff/diffCacheKey';
import { isWorkbookFileName, resolveDiffTexts } from '@/utils/diff/diffSource';
import { computeTextDiffAsync } from '@/utils/diff/computeTextDiffAsync';
import { createEmptyWorkbookLayoutSnapshots, type WorkbookLayoutSnapshotsByMode } from '@/utils/workbook/workbookLayoutState';
import { resolveWorkbookMetadataAsync } from '@/utils/workbook/resolveWorkbookMetadataAsync';
import { computeWorkbookDiffAsync } from '@/utils/workbook/computeWorkbookDiffAsync';
import { isWorkbookTextPair } from '@/engine/workbook/workbookDiff';
import { createWorkbookSelectionState } from '@/utils/workbook/workbookSelectionState';
import {
  debugLog,
  getNow,
  getPrecomputedDiffLinesForMode,
  getPrecomputedWorkbookDeltaForMode,
  getRevisionOptionsStatus,
  hasBytePayload,
  mergeWorkbookCompareModePayload,
  shouldResolveWorkbookMetadata,
  waitForNextPaint,
} from '@/hooks/app/helpers';
import type {
  CachedDiffResult,
} from '@/hooks/app/types';
import type { DialogController, DiffLoadController, RevisionQueryController, WorkbookUiController } from '@/hooks/app/contracts';

type SetState<T> = Dispatch<SetStateAction<T>>;

interface UseDiffLoaderArgs {
  loadSeqRef: MutableRefObject<number>;
  hasLoadedDiffRef: MutableRefObject<boolean>;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  currentDiffDataRef: MutableRefObject<DiffData | null>;
  diffResultCacheRef: MutableRefObject<Map<string, CachedDiffResult>>;
  workbookLayoutSnapshotsRef: MutableRefObject<WorkbookLayoutSnapshotsByMode>;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  revisionQuerySeqRef: MutableRefObject<number>;
  dialogs: DialogController;
  diffLoad: DiffLoadController;
  revisionQuery: RevisionQueryController;
  workbookUi: WorkbookUiController;
  setBaseName: SetState<string>;
  setMineName: SetState<string>;
  setLaunchBaseName: SetState<string>;
  setLaunchMineName: SetState<string>;
  setFileName: SetState<string>;
  setPrecomputedWorkbookDelta: SetState<WorkbookPrecomputedDeltaPayload | null>;
  setWorkbookArtifactDiff: SetState<WorkbookArtifactDiff | null>;
  setBaseWorkbookMetadata: SetState<WorkbookMetadataMap | null>;
  setMineWorkbookMetadata: SetState<WorkbookMetadataMap | null>;
  setRevisionOptions: SetState<SvnRevisionInfo[]>;
  setBaseRevisionInfo: SetState<SvnRevisionInfo | null>;
  setMineRevisionInfo: SetState<SvnRevisionInfo | null>;
  setCompareContext: SetState<CompareContext>;
  setResetPair: SetState<RevisionSelectionPair | null>;
  setCanSwitchRevisions: SetState<boolean>;
  setDiffLines: SetState<DiffLine[]>;
  setDiffSourceNoticeCode: SetState<DiffSourceNoticeCode | null>;
  setHunkIdx: SetState<number>;
  setWorkbookCompareMode: SetState<WorkbookCompareMode>;
  setIsLoadingSvnDiffViewerStatus: SetState<boolean>;
  setSvnDiffViewerError: SetState<string>;
  setSvnDiffViewerStatus: SetState<SvnDiffViewerStatus | null>;
  setApplyingSvnDiffViewerScope: SetState<SvnDiffViewerScope | null>;
}

export interface UseDiffLoaderResult {
  beginDiffLoad: () => Promise<number>;
  failDiffLoad: (seq: number, error: unknown) => void;
  applyDiffData: (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => Promise<void>;
  handleWorkbookCompareModeChange: (nextMode: WorkbookCompareMode) => Promise<void>;
  handlePickWorkingCopyFile: () => Promise<void>;
  loadSvnDiffViewerStatus: () => Promise<void>;
  handleOpenSvnConfig: () => void;
  handleApplySvnDiffViewerScope: (scope: SvnDiffViewerScope) => Promise<void>;
  reloadCliDiffData: () => Promise<void>;
}

export default function useDiffLoader({
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
}: UseDiffLoaderArgs): UseDiffLoaderResult {
  const { actions: dialogActions } = dialogs;
  const { actions: diffLoadActions } = diffLoad;
  const { actions: revisionActions } = revisionQuery;
  const {
    actions: {
      setSelection: setWorkbookSelection,
      setHiddenStateBySheet: setWorkbookHiddenStateBySheet,
      setContextMenu: setWorkbookContextMenu,
      setFreezeBySheet: setWorkbookFreezeBySheet,
      setColumnWidthBySheet: setWorkbookColumnWidthBySheet,
      setActiveSheetName: setActiveWorkbookSheetName,
    },
  } = workbookUi;

  const beginDiffLoad = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    diffLoadActions.setError('');
    diffLoadActions.setLoading(true);
    diffLoadActions.setPhase('loading');
    await waitForNextPaint();
    return seq;
  }, [diffLoadActions, loadSeqRef]);

  const failDiffLoad = useCallback((seq: number, error: unknown) => {
    if (seq !== loadSeqRef.current) return;
    diffLoadActions.setLoading(false);
    diffLoadActions.setError(error instanceof Error ? error.message : String(error));
    diffLoadActions.setPhase(hasLoadedDiffRef.current ? 'ready' : 'error');
    if (!hasLoadedDiffRef.current) {
      diffLoadActions.setMetrics(null);
    }
  }, [diffLoadActions, hasLoadedDiffRef, loadSeqRef]);

  const resetViewStateForDiff = useCallback(() => {
    setWorkbookSelection(createWorkbookSelectionState(null));
    setWorkbookHiddenStateBySheet({});
    setWorkbookContextMenu(null);
    setWorkbookFreezeBySheet({});
    setWorkbookColumnWidthBySheet({});
    setActiveWorkbookSheetName(null);
    workbookLayoutSnapshotsRef.current = createEmptyWorkbookLayoutSnapshots();
    workbookSharedExpandedBlocksRef.current = new Map();
  }, [
    setActiveWorkbookSheetName,
    setWorkbookColumnWidthBySheet,
    setWorkbookContextMenu,
    setWorkbookFreezeBySheet,
    setWorkbookHiddenStateBySheet,
    setWorkbookSelection,
    workbookLayoutSnapshotsRef,
    workbookSharedExpandedBlocksRef,
  ]);

  const resetRevisionStateForDiff = useCallback((data: DiffData | null = null) => {
    revisionQuerySeqRef.current += 1;
    setRevisionOptions(data?.revisionOptions ?? []);
    revisionActions.setStatus(data ? getRevisionOptionsStatus(data) : 'idle');
    revisionActions.setHasMore(false);
    revisionActions.setNextBeforeId(null);
    revisionActions.setQueryDateTime('');
    revisionActions.setQueryError('');
    revisionActions.setLoadingMore(false);
    revisionActions.setSearchingDateTime(false);
    setBaseRevisionInfo(data?.baseRevisionInfo ?? null);
    setMineRevisionInfo(data?.mineRevisionInfo ?? null);
    setCompareContext(data?.compareContext ?? 'literal_two_file_compare');
    setResetPair(data?.resetPair ?? null);
    setCanSwitchRevisions(Boolean(data?.canSwitchRevisions));
  }, [
    revisionActions,
    revisionQuerySeqRef,
    setBaseRevisionInfo,
    setCanSwitchRevisions,
    setCompareContext,
    setMineRevisionInfo,
    setResetPair,
    setRevisionOptions,
  ]);

  const applyDiffData = useCallback(async (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => {
    const seq = options?.seq ?? ++loadSeqRef.current;
    const applyStart = getNow();
    const compareMode = options?.compareMode ?? workbookCompareModeRef.current;
    const cacheKey = buildDiffCacheKey(data, compareMode);
    debugLog('apply-diff-data:start', {
      seq,
      compareMode,
      cacheKey,
      hasPrecomputedDiff: Boolean(getPrecomputedDiffLinesForMode(data, compareMode)),
      fileName: data.fileName,
    });
    if (!options?.loadingAlreadyStarted) {
      diffLoadActions.setError('');
      diffLoadActions.setLoading(true);
      diffLoadActions.setPhase('loading');
      await waitForNextPaint();
    }

    try {
      const precomputedDiffLines = getPrecomputedDiffLinesForMode(data, compareMode);
      const selectedPrecomputedWorkbookDelta = getPrecomputedWorkbookDeltaForMode(data, compareMode);
      const shouldUsePrecomputedDiff = Boolean(precomputedDiffLines);
      let textResolveMs = 0;
      const cachedResult = diffResultCacheRef.current.get(cacheKey);
      const metadataInput: WorkbookMetadataSource = {
        baseName: data.baseName,
        mineName: data.mineName,
        fileName: data.fileName,
        baseBytes: data.baseBytes,
        mineBytes: data.mineBytes,
      };
      const hasMetadataFromPayload = data.baseWorkbookMetadata != null || data.mineWorkbookMetadata != null;
      const canLoadMetadataRemotely = Boolean(window.svnDiff?.loadWorkbookMetadata && isWorkbookFileName(data.fileName || data.baseName || data.mineName));
      const canResolveMetadataLocally = shouldResolveWorkbookMetadata(metadataInput);
      const shouldLoadMetadata = canResolveMetadataLocally || canLoadMetadataRemotely;
      if (!canResolveMetadataLocally && (hasBytePayload(metadataInput.baseBytes) || hasBytePayload(metadataInput.mineBytes))) {
        debugLog('metadata:skip-large-payload', {
          compareMode,
          fileName: data.fileName,
          baseBytes: hasBytePayload(metadataInput.baseBytes) ? metadataInput.baseBytes.byteLength : 0,
          mineBytes: hasBytePayload(metadataInput.mineBytes) ? metadataInput.mineBytes.byteLength : 0,
        });
      }

      const applyCommonState = (nextData: DiffData) => {
        currentDiffDataRef.current = nextData;
        setBaseName(nextData.baseName || nextData.fileName || '');
        setMineName(nextData.mineName || nextData.fileName || '');
        setLaunchBaseName(nextData.launchBaseName || nextData.baseName || nextData.fileName || '');
        setLaunchMineName(nextData.launchMineName || nextData.mineName || nextData.fileName || '');
        setFileName(nextData.fileName || '');
        resetViewStateForDiff();
        resetRevisionStateForDiff(nextData);
        setWorkbookArtifactDiff(nextData.workbookArtifactDiff ?? null);
        setDiffSourceNoticeCode(nextData.sourceNoticeCode ?? null);
        setHunkIdx(0);
        diffLoadActions.setLoaded(true);
        diffLoadActions.setPhase('ready');
      };

      if (cachedResult) {
        diffResultCacheRef.current.delete(cacheKey);
        diffResultCacheRef.current.set(cacheKey, cachedResult);
        applyCommonState(data);
        setPrecomputedWorkbookDelta(cachedResult.workbookDelta);
        setBaseWorkbookMetadata(cachedResult.baseWorkbookMetadata ?? data.baseWorkbookMetadata ?? null);
        setMineWorkbookMetadata(cachedResult.mineWorkbookMetadata ?? data.mineWorkbookMetadata ?? null);
        setDiffLines(cachedResult.diffLines);
        diffLoadActions.setMetrics({
          source: data.perf?.source ?? 'local-dev',
          ...data.perf,
          textResolveMs,
          metadataMs: 0,
          diffMs: 0,
          totalAppMs: getNow() - applyStart,
          diffLineCount: cachedResult.diffLines.length,
        });
        debugLog('apply-diff-data:done', {
          seq,
          compareMode,
          cached: true,
          diffLineCount: cachedResult.diffLines.length,
          totalAppMs: Number((getNow() - applyStart).toFixed(1)),
          perf: data.perf ?? null,
        });
        return;
      }

      const metadataTask = !hasMetadataFromPayload && shouldLoadMetadata
        ? (async () => {
            const metadataStart = getNow();
            debugLog('metadata:request', {
              compareMode,
              fileName: data.fileName,
            });
            try {
              const result = canLoadMetadataRemotely
                ? await window.svnDiff!.loadWorkbookMetadata(
                    data.baseRevisionInfo?.id,
                    data.mineRevisionInfo?.id,
                  )
                : await resolveWorkbookMetadataAsync(metadataInput);
              return {
                ok: true as const,
                result: {
                  base: result.base,
                  mine: result.mine,
                },
                duration: getNow() - metadataStart,
              };
            } catch (error) {
              return {
                ok: false as const,
                error,
                duration: getNow() - metadataStart,
              };
            }
          })()
        : null;

      let nextDiffLines: DiffLine[];
      let diffDuration: number;
      if (shouldUsePrecomputedDiff) {
        nextDiffLines = precomputedDiffLines!;
        diffDuration = data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0;
      } else {
        const textStart = getNow();
        const { baseText, mineText } = resolveDiffTexts(data);
        textResolveMs = getNow() - textStart;
        const diffStart = getNow();
        nextDiffLines = isWorkbookTextPair(baseText, mineText)
          ? await computeWorkbookDiffAsync(baseText, mineText, compareMode)
          : await computeTextDiffAsync(baseText, mineText);
        diffDuration = getNow() - diffStart;
      }
      if (seq !== loadSeqRef.current) return;
      const totalAppMs = getNow() - applyStart;

      applyCommonState(data);
      setPrecomputedWorkbookDelta(selectedPrecomputedWorkbookDelta);
      setBaseWorkbookMetadata(data.baseWorkbookMetadata ?? null);
      setMineWorkbookMetadata(data.mineWorkbookMetadata ?? null);
      setDiffLines(nextDiffLines);
      diffLoadActions.setMetrics({
        source: data.perf?.source ?? 'local-dev',
        ...data.perf,
        textResolveMs,
        diffMs: shouldUsePrecomputedDiff ? (data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0) : diffDuration,
        totalAppMs,
        diffLineCount: nextDiffLines.length,
      });
      debugLog('apply-diff-data:done', {
        seq,
        compareMode,
        cached: false,
        diffLineCount: nextDiffLines.length,
        textResolveMs: Number(textResolveMs.toFixed(1)),
        diffMs: Number(diffDuration.toFixed(1)),
        totalAppMs: Number(totalAppMs.toFixed(1)),
        source: data.perf?.source ?? 'local-dev',
      });
      diffResultCacheRef.current.set(cacheKey, {
        diffLines: nextDiffLines,
        workbookDelta: selectedPrecomputedWorkbookDelta,
        baseWorkbookMetadata: data.baseWorkbookMetadata ?? null,
        mineWorkbookMetadata: data.mineWorkbookMetadata ?? null,
      });
      if (diffResultCacheRef.current.size > 8) {
        const oldestKey = diffResultCacheRef.current.keys().next().value;
        if (oldestKey) diffResultCacheRef.current.delete(oldestKey);
      }

      if (metadataTask) {
        void metadataTask.then((metadataResult) => {
          if (seq !== loadSeqRef.current) return;

          if (!metadataResult.ok) {
            const message = metadataResult.error instanceof Error
              ? metadataResult.error.message
              : String(metadataResult.error);
            debugLog('metadata:failed', {
              compareMode,
              message,
              durationMs: Number(metadataResult.duration.toFixed(1)),
            });
            diffLoadActions.setMetrics((prev) => (prev ? {
              ...prev,
              metadataMs: metadataResult.duration,
            } : prev));
            return;
          }

          setBaseWorkbookMetadata(metadataResult.result.base);
          setMineWorkbookMetadata(metadataResult.result.mine);
          const cachedEntry = diffResultCacheRef.current.get(cacheKey);
          if (cachedEntry) {
            diffResultCacheRef.current.set(cacheKey, {
              ...cachedEntry,
              baseWorkbookMetadata: metadataResult.result.base,
              mineWorkbookMetadata: metadataResult.result.mine,
            });
          }
          diffLoadActions.setMetrics((prev) => (prev ? {
            ...prev,
            metadataMs: metadataResult.duration,
            totalAppMs: Math.max(prev.totalAppMs ?? 0, getNow() - applyStart),
          } : prev));
          debugLog('metadata:loaded', {
            compareMode,
            durationMs: Number(metadataResult.duration.toFixed(1)),
          });
        });
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      if (!hasLoadedDiffRef.current) {
        setDiffLines([]);
        setPrecomputedWorkbookDelta(null);
        setWorkbookArtifactDiff(null);
        setBaseWorkbookMetadata(null);
        setMineWorkbookMetadata(null);
        resetRevisionStateForDiff(null);
        setDiffSourceNoticeCode(null);
        diffLoadActions.setLoaded(false);
        diffLoadActions.setPhase('error');
        diffLoadActions.setMetrics(null);
      } else {
        diffLoadActions.setPhase('ready');
      }
      diffLoadActions.setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === loadSeqRef.current) {
        diffLoadActions.setLoading(false);
      }
    }
  }, [
    currentDiffDataRef,
    diffLoadActions,
    diffResultCacheRef,
    hasLoadedDiffRef,
    loadSeqRef,
    resetRevisionStateForDiff,
    resetViewStateForDiff,
    setBaseName,
    setBaseWorkbookMetadata,
    setDiffLines,
    setDiffSourceNoticeCode,
    setFileName,
    setHunkIdx,
    setLaunchBaseName,
    setLaunchMineName,
    setMineName,
    setMineWorkbookMetadata,
    setPrecomputedWorkbookDelta,
    setWorkbookArtifactDiff,
    workbookCompareModeRef,
  ]);

  const ensureWorkbookCompareModeLoaded = useCallback(async (
    data: DiffData,
    compareMode: WorkbookCompareMode,
  ): Promise<DiffData> => {
    if (getPrecomputedDiffLinesForMode(data, compareMode)) {
      debugLog('ensure-compare-mode:cache-hit', {
        compareMode,
        fileName: data.fileName,
      });
      return data;
    }
    if (!window.svnDiff?.loadWorkbookCompareMode) {
      throw new Error(`Missing workbook compare mode payload for '${compareMode}'.`);
    }

    debugLog('ensure-compare-mode:request', {
      compareMode,
      fileName: data.fileName,
      baseRevisionId: data.baseRevisionInfo?.id ?? null,
      mineRevisionId: data.mineRevisionInfo?.id ?? null,
    });
    const payload = await window.svnDiff.loadWorkbookCompareMode(
      compareMode,
      data.baseRevisionInfo?.id,
      data.mineRevisionInfo?.id,
    );
    if (!payload.diffLines) {
      throw new Error(`Failed to load workbook compare mode '${compareMode}'.`);
    }
    debugLog('ensure-compare-mode:loaded', {
      compareMode,
      diffLineCount: payload.diffLines.length,
      rustDiffMs: payload.perf?.rustDiffMs ?? 0,
    });
    return mergeWorkbookCompareModePayload(data, payload);
  }, []);

  const handleWorkbookCompareModeChange = useCallback(async (nextMode: WorkbookCompareMode) => {
    if (nextMode === workbookCompareModeRef.current) return;

    const currentData = currentDiffDataRef.current;
    if (!currentData) {
      setWorkbookCompareMode(nextMode);
      return;
    }
    const isCurrentWorkbook = isWorkbookFileName(currentData.fileName || currentData.baseName || currentData.mineName);

    if (!isCurrentWorkbook || getPrecomputedDiffLinesForMode(currentData, nextMode)) {
      setWorkbookCompareMode(nextMode);
      void applyDiffData(currentData, {
        compareMode: nextMode,
        loadingAlreadyStarted: true,
      });
      return;
    }

    const seq = await beginDiffLoad();
    try {
      const nextData = await ensureWorkbookCompareModeLoaded(currentData, nextMode);
      if (seq !== loadSeqRef.current) return;
      setWorkbookCompareMode(nextMode);
      await applyDiffData(nextData, {
        seq,
        compareMode: nextMode,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
    }
  }, [
    applyDiffData,
    beginDiffLoad,
    currentDiffDataRef,
    ensureWorkbookCompareModeLoaded,
    failDiffLoad,
    loadSeqRef,
    setWorkbookCompareMode,
    workbookCompareModeRef,
  ]);

  const loadElectronWorkingCopyDiff = useCallback(async (filePath: string) => {
    if (!window.svnDiff?.loadDevWorkingCopyDiff) return;
    const seq = await beginDiffLoad();
    try {
      const nextData = await window.svnDiff.loadDevWorkingCopyDiff(filePath, workbookCompareModeRef.current);
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
      throw error;
    }
  }, [applyDiffData, beginDiffLoad, failDiffLoad, loadSeqRef, workbookCompareModeRef]);

  const handlePickWorkingCopyFile = useCallback(async () => {
    if (!window.svnDiff?.pickDiffFile) return;
    const nextFile = await window.svnDiff.pickDiffFile();
    if (!nextFile?.path) return;
    try {
      await loadElectronWorkingCopyDiff(nextFile.path);
    } catch {
      // loadElectronWorkingCopyDiff already updates the UI error state.
    }
  }, [loadElectronWorkingCopyDiff]);

  const loadSvnDiffViewerStatus = useCallback(async () => {
    if (!window.svnDiff?.getSvnDiffViewerStatus) return;
    setIsLoadingSvnDiffViewerStatus(true);
    setSvnDiffViewerError('');
    try {
      const nextStatus = await window.svnDiff.getSvnDiffViewerStatus();
      setSvnDiffViewerStatus(nextStatus);
    } catch (error) {
      setSvnDiffViewerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingSvnDiffViewerStatus(false);
    }
  }, [setIsLoadingSvnDiffViewerStatus, setSvnDiffViewerError, setSvnDiffViewerStatus]);

  const handleOpenSvnConfig = useCallback(() => {
    dialogActions.open('svnConfig');
    void loadSvnDiffViewerStatus();
  }, [dialogActions, loadSvnDiffViewerStatus]);

  const handleApplySvnDiffViewerScope = useCallback(async (scope: SvnDiffViewerScope) => {
    if (!window.svnDiff?.configureSvnDiffViewer) return;
    setApplyingSvnDiffViewerScope(scope);
    setSvnDiffViewerError('');
    try {
      const nextStatus = await window.svnDiff.configureSvnDiffViewer(scope);
      setSvnDiffViewerStatus(nextStatus);
    } catch (error) {
      setSvnDiffViewerError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplyingSvnDiffViewerScope(null);
    }
  }, [setApplyingSvnDiffViewerScope, setSvnDiffViewerError, setSvnDiffViewerStatus]);

  const reloadCliDiffData = useCallback(async () => {
    if (!window.svnDiff?.getDiffData) return;
    const seq = await beginDiffLoad();
    try {
      const data = await window.svnDiff.getDiffData(workbookCompareModeRef.current);
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(data, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
    }
  }, [applyDiffData, beginDiffLoad, failDiffLoad, loadSeqRef, workbookCompareModeRef]);

  return {
    beginDiffLoad,
    failDiffLoad,
    applyDiffData,
    handleWorkbookCompareModeChange,
    handlePickWorkingCopyFile,
    loadSvnDiffViewerStatus,
    handleOpenSvnConfig,
    handleApplySvnDiffViewerScope,
    reloadCliDiffData,
  };
}
