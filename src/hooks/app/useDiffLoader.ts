import { useCallback, useRef, type MutableRefObject } from 'react';

import type {
  DiffData,
  DiffLine,
  SvnDiffViewerScope,
  WorkbookCompareMode,
  WorkbookMetadataSource,
} from '@/types';
import { EMPTY_COLLAPSE_EXPANSION_STATE, type CollapseExpansionState } from '@/utils/collapse/collapseState';
import { buildDiffCacheKey } from '@/utils/diff/diffCacheKey';
import { createEmptyTextLayoutSnapshots, type TextLayoutSnapshotsByMode } from '@/utils/diff/textLayoutState';
import { isWorkbookFileName, resolveDiffTexts } from '@/utils/diff/diffSource';
import { computeTextDiffAsync } from '@/utils/diff/computeTextDiffAsync';
import { createEmptyWorkbookLayoutSnapshots, type WorkbookLayoutSnapshotsByMode } from '@/utils/workbook/workbookLayoutState';
import { resolveWorkbookMetadataAsync } from '@/utils/workbook/resolveWorkbookMetadataAsync';
import { computeWorkbookDiffAsync } from '@/utils/workbook/computeWorkbookDiffAsync';
import { isWorkbookTextPair } from '@/engine/workbook/workbookDiff';
import { recordPerfBridgeEvent } from '@/utils/app/perfBridge';
import {
  debugLog,
  getNow,
  getPreparedDiffLinesForMode,
  getRevisionOptionsStatus,
  hasBytePayload,
  mergeWorkbookCompareModePayload,
  mergeWorkbookMetadataPayload,
  shouldResolveWorkbookMetadata,
  waitForNextPaint,
} from '@/hooks/app/helpers';
import type {
  CachedDiffResult,
} from '@/hooks/app/types';
import { buildCachedDiffResult, rememberCachedDiffResult } from '@/hooks/app/diffResultCache';
import type { DialogController, DiffLoadController, RevisionQueryController, WorkbookUiController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseDiffLoaderArgs {
  loadSeqRef: MutableRefObject<number>;
  hasLoadedDiffRef: MutableRefObject<boolean>;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  currentDiffDataRef: MutableRefObject<DiffData | null>;
  diffResultCacheRef: MutableRefObject<Map<string, CachedDiffResult>>;
  textLayoutSnapshotsRef: MutableRefObject<TextLayoutSnapshotsByMode>;
  textSharedExpandedBlocksRef: MutableRefObject<CollapseExpansionState>;
  workbookLayoutSnapshotsRef: MutableRefObject<WorkbookLayoutSnapshotsByMode>;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  revisionQuerySeqRef: MutableRefObject<number>;
  dialogs: DialogController;
  diffLoad: DiffLoadController;
  revisionQuery: RevisionQueryController;
  workbookUi: WorkbookUiController;
}

export interface UseDiffLoaderResult {
  beginDiffLoad: () => Promise<number>;
  failDiffLoad: (seq: number, error: unknown) => void;
  applyDiffData: (
    data: DiffData,
    options?: {
      seq?: number;
      loadingAlreadyStarted?: boolean;
      compareMode?: WorkbookCompareMode;
      preserveWorkbookViewState?: boolean;
    },
  ) => Promise<void>;
  handleWorkbookCompareModeChange: (nextMode: WorkbookCompareMode) => Promise<void>;
  handlePickWorkingCopyFile: () => Promise<void>;
  loadSvnDiffViewerStatus: () => Promise<void>;
  handleOpenSvnConfig: () => void;
  handleApplySvnDiffViewerScope: (scope: SvnDiffViewerScope) => Promise<void>;
  handleRestoreSvnDiffViewerDefault: () => Promise<void>;
  reloadCliDiffData: () => Promise<void>;
}

export default function useDiffLoader({
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
}: UseDiffLoaderArgs): UseDiffLoaderResult {
  // ── Read setters directly from Zustand store ──────────────────────────
  const setWorkbookArtifactDiff = useAppStore((s) => s.setWorkbookArtifactDiff);
  const setBaseWorkbookMetadata = useAppStore((s) => s.setBaseWorkbookMetadata);
  const setMineWorkbookMetadata = useAppStore((s) => s.setMineWorkbookMetadata);
  const setDiffLines = useAppStore((s) => s.setDiffLines);
  const setDiffSourceNoticeCode = useAppStore((s) => s.setDiffSourceNoticeCode);
  const setWorkbookCompareMode = useAppStore((s) => s.setWorkbookCompareMode);
  const setIsLoadingSvnDiffViewerStatus = useAppStore((s) => s.setIsLoadingSvnDiffViewerStatus);
  const setSvnDiffViewerError = useAppStore((s) => s.setSvnDiffViewerError);
  const setSvnDiffViewerStatus = useAppStore((s) => s.setSvnDiffViewerStatus);
  const setApplyingSvnDiffViewerScope = useAppStore((s) => s.setApplyingSvnDiffViewerScope);
  const setIsRestoringSvnDiffViewerDefault = useAppStore((s) => s.setIsRestoringSvnDiffViewerDefault);
  const hydrateLoadedDiffSession = useAppStore((s) => s.hydrateLoadedDiffSession);
  const hydrateWorkbookMetadataState = useAppStore((s) => s.hydrateWorkbookMetadataState);

  const { actions: dialogActions } = dialogs;
  const { actions: diffLoadActions } = diffLoad;
  const { actions: revisionActions } = revisionQuery;
  const workbookUiStateRef = useRef(workbookUi.state);
  workbookUiStateRef.current = workbookUi.state;

  const beginDiffLoad = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    recordPerfBridgeEvent('diff-payload:request', {
      reason: 'begin-diff-load',
      seq,
      compareMode: workbookCompareModeRef.current,
    });
    diffLoadActions.setError('');
    diffLoadActions.setLoading(true);
    diffLoadActions.setPhase('loading');
    await waitForNextPaint();
    return seq;
  }, [diffLoadActions, loadSeqRef, workbookCompareModeRef]);

  const failDiffLoad = useCallback((seq: number, error: unknown) => {
    if (seq !== loadSeqRef.current) return;
    diffLoadActions.setLoading(false);
    diffLoadActions.setError(error instanceof Error ? error.message : String(error));
    diffLoadActions.setPhase(hasLoadedDiffRef.current ? 'ready' : 'error');
    if (!hasLoadedDiffRef.current) {
      diffLoadActions.setMetrics(null);
    }
  }, [diffLoadActions, hasLoadedDiffRef, loadSeqRef]);

  const resetViewStateRefsForDiff = useCallback(() => {
    textLayoutSnapshotsRef.current = createEmptyTextLayoutSnapshots();
    textSharedExpandedBlocksRef.current = EMPTY_COLLAPSE_EXPANSION_STATE;
    workbookLayoutSnapshotsRef.current = createEmptyWorkbookLayoutSnapshots();
    workbookSharedExpandedBlocksRef.current = new Map();
  }, [
    textLayoutSnapshotsRef,
    textSharedExpandedBlocksRef,
    workbookLayoutSnapshotsRef,
    workbookSharedExpandedBlocksRef,
  ]);

  const resetRevisionUiStateForDiff = useCallback((data: DiffData | null = null) => {
    revisionQuerySeqRef.current += 1;
    revisionActions.setStatus(data ? getRevisionOptionsStatus(data) : 'idle');
    revisionActions.setHasMore(false);
    revisionActions.setNextBeforeId(null);
    revisionActions.setQueryDateTime('');
    revisionActions.setQueryError('');
    revisionActions.setLoadingMore(false);
    revisionActions.setSearchingDateTime(false);
  }, [
    revisionActions,
    revisionQuerySeqRef,
  ]);

  const applyDiffData = useCallback(async (
    data: DiffData,
    options?: {
      seq?: number;
      loadingAlreadyStarted?: boolean;
      compareMode?: WorkbookCompareMode;
      preserveWorkbookViewState?: boolean;
    },
  ) => {
    const seq = options?.seq ?? ++loadSeqRef.current;
    const applyStart = getNow();
    const compareMode = options?.compareMode ?? workbookCompareModeRef.current;
    const preservedWorkbookViewState = options?.preserveWorkbookViewState
      ? {
          activeWorkbookSheetName: workbookUiStateRef.current.activeSheetName,
          workbookHiddenStateBySheet: workbookUiStateRef.current.hiddenStateBySheet,
          workbookFreezeBySheet: workbookUiStateRef.current.freezeBySheet,
          workbookColumnWidthBySheet: workbookUiStateRef.current.columnWidthBySheet,
        }
      : null;
    const cacheKey = buildDiffCacheKey(data, compareMode);
    const preparedDiffLines = getPreparedDiffLinesForMode(data, compareMode);
    recordPerfBridgeEvent('apply-diff-data:start', {
      seq,
      compareMode,
      fileName: data.fileName,
      hasPreparedDiff: Boolean(preparedDiffLines),
      source: data.perf?.source ?? 'local-dev',
    });
    debugLog('apply-diff-data:start', {
      seq,
      compareMode,
      cacheKey,
      hasPreparedDiff: Boolean(preparedDiffLines),
      fileName: data.fileName,
    });
    if (!options?.loadingAlreadyStarted) {
      diffLoadActions.setError('');
      diffLoadActions.setLoading(true);
      diffLoadActions.setPhase('loading');
      await waitForNextPaint();
    }

    try {
      const shouldUsePreparedDiff = Boolean(preparedDiffLines);
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

      const hydrateDiffSession = (
        nextData: DiffData,
        nextDiffLines: DiffLine[],
        nextBaseWorkbookMetadata: DiffData['baseWorkbookMetadata'],
        nextMineWorkbookMetadata: DiffData['mineWorkbookMetadata'],
      ) => {
        currentDiffDataRef.current = nextData;
        resetViewStateRefsForDiff();
        resetRevisionUiStateForDiff(nextData);
        hydrateLoadedDiffSession({
          baseName: nextData.baseName || nextData.fileName || '',
          mineName: nextData.mineName || nextData.fileName || '',
          launchBaseName: nextData.launchBaseName || nextData.baseName || nextData.fileName || '',
          launchMineName: nextData.launchMineName || nextData.mineName || nextData.fileName || '',
          fileName: nextData.fileName || '',
          workbookCompareMode: compareMode,
          preservedWorkbookViewState,
          diffLines: nextDiffLines,
          diffSourceNoticeCode: nextData.sourceNoticeCode ?? null,
          workbookArtifactDiff: nextData.workbookArtifactDiff ?? null,
          baseWorkbookMetadata: nextBaseWorkbookMetadata ?? null,
          mineWorkbookMetadata: nextMineWorkbookMetadata ?? null,
          revisionOptions: nextData.revisionOptions ?? [],
          baseRevisionInfo: nextData.baseRevisionInfo ?? null,
          mineRevisionInfo: nextData.mineRevisionInfo ?? null,
          compareContext: nextData.compareContext ?? 'literal_two_file_compare',
          resetPair: nextData.resetPair ?? null,
          canSwitchRevisions: Boolean(nextData.canSwitchRevisions),
        });
        diffLoadActions.setLoaded(true);
        diffLoadActions.setPhase('ready');
      };

      const cachedMetadataAvailable = cachedResult?.baseWorkbookMetadata != null
        || cachedResult?.mineWorkbookMetadata != null;
      const metadataTask = !hasMetadataFromPayload && shouldLoadMetadata && !cachedMetadataAvailable
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
                result,
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
      const scheduleMetadataTask = () => {
        if (!metadataTask) return;
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

          hydrateWorkbookMetadataState({
            baseWorkbookMetadata: metadataResult.result.base,
            mineWorkbookMetadata: metadataResult.result.mine,
          });
          if (currentDiffDataRef.current) {
            currentDiffDataRef.current = mergeWorkbookMetadataPayload(
              currentDiffDataRef.current,
              metadataResult.result,
            );
          }
          const cachedEntry = diffResultCacheRef.current.get(cacheKey);
          if (cachedEntry) {
            rememberCachedDiffResult(diffResultCacheRef.current, cacheKey, buildCachedDiffResult({
              ...cachedEntry,
              baseWorkbookMetadata: metadataResult.result.base,
              mineWorkbookMetadata: metadataResult.result.mine,
            }));
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
      };

      const cachedDiffLines = shouldUsePreparedDiff
        ? preparedDiffLines
        : (cachedResult?.diffLines ?? null);
      const canUseCachedResult = Boolean(cachedResult && cachedDiffLines);

      if (canUseCachedResult) {
        diffResultCacheRef.current.delete(cacheKey);
        diffResultCacheRef.current.set(cacheKey, cachedResult!);
        hydrateDiffSession(
          data,
          cachedDiffLines ?? [],
          cachedResult?.baseWorkbookMetadata ?? data.baseWorkbookMetadata ?? null,
          cachedResult?.mineWorkbookMetadata ?? data.mineWorkbookMetadata ?? null,
        );
        diffLoadActions.setMetrics({
          source: data.perf?.source ?? 'local-dev',
          ...data.perf,
          textResolveMs,
          metadataMs: 0,
          diffMs: 0,
          totalAppMs: getNow() - applyStart,
          diffLineCount: cachedDiffLines?.length ?? 0,
        });
        recordPerfBridgeEvent('apply-diff-data:commit', {
          seq,
          compareMode,
          cached: true,
          fileName: data.fileName,
          diffLineCount: cachedDiffLines?.length ?? 0,
          totalAppMs: getNow() - applyStart,
        });
        debugLog('apply-diff-data:done', {
          seq,
          compareMode,
          cached: true,
          diffLineCount: cachedDiffLines?.length ?? 0,
          totalAppMs: Number((getNow() - applyStart).toFixed(1)),
          perf: data.perf ?? null,
        });
        scheduleMetadataTask();
        return;
      }

      let nextDiffLines: DiffLine[];
      let diffDuration: number;
      if (shouldUsePreparedDiff) {
        nextDiffLines = preparedDiffLines!;
        diffDuration = data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0;
      } else {
        const shouldUseWorkbookDiff = isWorkbookFileName(data.fileName || data.baseName || data.mineName)
          || (
            typeof data.baseContent === 'string'
            && typeof data.mineContent === 'string'
            && isWorkbookTextPair(data.baseContent, data.mineContent)
          );

        if (shouldUseWorkbookDiff) {
          const workbookDiffResult = await computeWorkbookDiffAsync({
            baseName: data.baseName,
            mineName: data.mineName,
            fileName: data.fileName,
            baseContent: data.baseContent,
            mineContent: data.mineContent,
            baseBytes: data.baseBytes,
            mineBytes: data.mineBytes,
            compareMode,
          });
          nextDiffLines = workbookDiffResult.diffLines;
          textResolveMs = workbookDiffResult.textResolveMs;
          diffDuration = workbookDiffResult.diffMs;
        } else {
          const textStart = getNow();
          const { baseText, mineText } = resolveDiffTexts(data);
          textResolveMs = getNow() - textStart;
          const diffStart = getNow();
          nextDiffLines = await computeTextDiffAsync(baseText, mineText);
          diffDuration = getNow() - diffStart;
        }
      }
      if (seq !== loadSeqRef.current) return;
      const totalAppMs = getNow() - applyStart;

      hydrateDiffSession(
        data,
        nextDiffLines,
        data.baseWorkbookMetadata ?? null,
        data.mineWorkbookMetadata ?? null,
      );
      diffLoadActions.setMetrics({
        source: data.perf?.source ?? 'local-dev',
        ...data.perf,
        textResolveMs,
        diffMs: shouldUsePreparedDiff ? (data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0) : diffDuration,
        totalAppMs,
        diffLineCount: nextDiffLines.length,
      });
      recordPerfBridgeEvent('apply-diff-data:commit', {
        seq,
        compareMode,
        cached: false,
        fileName: data.fileName,
        diffLineCount: nextDiffLines.length,
        totalAppMs,
        textResolveMs,
        diffMs: shouldUsePreparedDiff ? (data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0) : diffDuration,
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
      rememberCachedDiffResult(diffResultCacheRef.current, cacheKey, buildCachedDiffResult({
        diffLines: shouldUsePreparedDiff ? null : nextDiffLines,
        baseWorkbookMetadata: data.baseWorkbookMetadata ?? null,
        mineWorkbookMetadata: data.mineWorkbookMetadata ?? null,
      }));
      scheduleMetadataTask();
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      if (!hasLoadedDiffRef.current) {
        setDiffLines([]);
        setWorkbookArtifactDiff(null);
        setBaseWorkbookMetadata(null);
        setMineWorkbookMetadata(null);
        resetRevisionUiStateForDiff(null);
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
    hydrateLoadedDiffSession,
    hydrateWorkbookMetadataState,
    hasLoadedDiffRef,
    loadSeqRef,
    resetRevisionUiStateForDiff,
    resetViewStateRefsForDiff,
    setBaseWorkbookMetadata,
    setDiffLines,
    setDiffSourceNoticeCode,
    setMineWorkbookMetadata,
    setWorkbookArtifactDiff,
    workbookCompareModeRef,
  ]);

  const ensureWorkbookCompareModeLoaded = useCallback(async (
    data: DiffData,
    compareMode: WorkbookCompareMode,
  ): Promise<DiffData> => {
    if (getPreparedDiffLinesForMode(data, compareMode)) {
      recordPerfBridgeEvent('diff-payload:ready', {
        reason: 'workbook-compare-mode',
        compareMode,
        source: 'snapshot',
        fileName: data.fileName,
      });
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
    recordPerfBridgeEvent('diff-payload:request', {
      reason: 'workbook-compare-mode',
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
    const payloadDiffLines = payload.analysisSnapshot?.workbookAnalysis?.diffLinesByMode[compareMode]
      ?? null;
    if (!payloadDiffLines) {
      throw new Error(`Failed to load workbook compare mode '${compareMode}'.`);
    }
    debugLog('ensure-compare-mode:loaded', {
      compareMode,
      diffLineCount: payloadDiffLines.length,
      rustDiffMs: payload.perf?.rustDiffMs ?? 0,
    });
    recordPerfBridgeEvent('diff-payload:ready', {
      reason: 'workbook-compare-mode',
      compareMode,
      source: 'ipc',
      fileName: data.fileName,
      diffLineCount: payloadDiffLines.length,
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
    recordPerfBridgeEvent('workbook-compare-mode:start', {
      fileName: currentData.fileName,
      fromCompareMode: workbookCompareModeRef.current,
      toCompareMode: nextMode,
      isWorkbookMode: isCurrentWorkbook,
      hasPreparedDiff: Boolean(getPreparedDiffLinesForMode(currentData, nextMode)),
    });

    if (!isCurrentWorkbook || getPreparedDiffLinesForMode(currentData, nextMode)) {
      void applyDiffData(currentData, {
        compareMode: nextMode,
        loadingAlreadyStarted: true,
        preserveWorkbookViewState: isCurrentWorkbook,
      });
      return;
    }

    const seq = await beginDiffLoad();
    try {
      const nextData = await ensureWorkbookCompareModeLoaded(currentData, nextMode);
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        compareMode: nextMode,
        loadingAlreadyStarted: true,
        preserveWorkbookViewState: true,
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

  const handleRestoreSvnDiffViewerDefault = useCallback(async () => {
    if (!window.svnDiff?.restoreSvnDefaultDiffViewerConfiguration) return;
    setIsRestoringSvnDiffViewerDefault(true);
    setSvnDiffViewerError('');
    try {
      const nextStatus = await window.svnDiff.restoreSvnDefaultDiffViewerConfiguration();
      setSvnDiffViewerStatus(nextStatus);
    } catch (error) {
      setSvnDiffViewerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoringSvnDiffViewerDefault(false);
    }
  }, [setIsRestoringSvnDiffViewerDefault, setSvnDiffViewerError, setSvnDiffViewerStatus]);

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
    handleRestoreSvnDiffViewerDefault,
    reloadCliDiffData,
  };
}
