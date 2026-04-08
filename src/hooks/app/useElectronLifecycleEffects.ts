import { useEffect, type MutableRefObject } from 'react';

import type {
  DiffData,
  LaunchContextPayload,
  WorkbookCompareMode,
} from '@/types';
import { clearTokenCache } from '@/engine/text/tokenizer';
import { debugLog, hasBytePayload, waitForNextPaint } from '@/hooks/app/helpers';
import type { DiffLoadController, RevisionQueryController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseElectronLifecycleEffectsArgs {
  applyDiffData: (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => Promise<void>;
  reloadCliDiffData: () => Promise<void>;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  loadSeqRef: MutableRefObject<number>;
  revisionQuerySeqRef: MutableRefObject<number>;
  updateAutoCheckRequestedRef: MutableRefObject<boolean>;
  diffLoad: DiffLoadController;
  revisionQuery: RevisionQueryController;
}

export default function useElectronLifecycleEffects({
  applyDiffData,
  reloadCliDiffData,
  workbookCompareModeRef,
  loadSeqRef,
  revisionQuerySeqRef,
  updateAutoCheckRequestedRef,
  diffLoad,
  revisionQuery,
}: UseElectronLifecycleEffectsArgs) {
  // ── Read setters directly from Zustand store ──────────────────────────
  const setIsElectron = useAppStore((s) => s.setIsElectron);
  const setRevisionOptions = useAppStore((s) => s.setRevisionOptions);
  const setDiffSourceNoticeCode = useAppStore((s) => s.setDiffSourceNoticeCode);
  const setCompareContext = useAppStore((s) => s.setCompareContext);
  const setResetPair = useAppStore((s) => s.setResetPair);
  const setLaunchBaseName = useAppStore((s) => s.setLaunchBaseName);
  const setLaunchMineName = useAppStore((s) => s.setLaunchMineName);
  const setIsDevMode = useAppStore((s) => s.setIsDevMode);
  const setUsesNativeWindowControls = useAppStore((s) => s.setUsesNativeWindowControls);
  const setIsWindowMaximized = useAppStore((s) => s.setIsWindowMaximized);
  const setAppUpdateState = useAppStore((s) => s.setAppUpdateState);

  const { actions: diffLoadActions } = diffLoad;
  const { actions: revisionQueryActions } = revisionQuery;

  useEffect(() => {
    let cancelled = false;

    const inferRendererDevMode = async () => {
      const isHttpDev = typeof window !== 'undefined'
        && (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      if (isHttpDev) {
        setIsDevMode(true);
        return;
      }

      if (!window.svnDiff?.isDevMode) return;
      try {
        const nextIsDevMode = await window.svnDiff.isDevMode();
        if (!cancelled) {
          setIsDevMode(Boolean(nextIsDevMode));
        }
      } catch {
        // Ignore bridge dev-mode probe failures and keep the current state.
      }
    };

    void inferRendererDevMode();
    return () => {
      cancelled = true;
    };
  }, [setIsDevMode]);

  useEffect(() => {
    clearTokenCache();
    let cancelled = false;
    debugLog('electron-lifecycle:bootstrap-effect:start');

    const applyEmptyLaunchState = (seq: number) => {
      if (seq !== loadSeqRef.current) return;
      debugLog('electron-lifecycle:apply-empty-launch-state', { seq });
      diffLoadActions.setLoading(false);
      diffLoadActions.setLoaded(false);
      diffLoadActions.setPhase('idle');
      diffLoadActions.setError('');
      diffLoadActions.setMetrics(null);
      revisionQuerySeqRef.current += 1;
      setRevisionOptions([]);
      revisionQueryActions.setStatus('idle');
      revisionQueryActions.setHasMore(false);
      revisionQueryActions.setNextBeforeId(null);
      revisionQueryActions.setQueryDateTime('');
      revisionQueryActions.setQueryError('');
      revisionQueryActions.setLoadingMore(false);
      revisionQueryActions.setSearchingDateTime(false);
      setDiffSourceNoticeCode(null);
      setCompareContext('literal_two_file_compare');
      setResetPair(null);
      setLaunchBaseName('');
      setLaunchMineName('');
    };

    const applyLaunchContext = (launchContext: LaunchContextPayload) => {
      setIsDevMode(Boolean(launchContext.isDevMode));
      setUsesNativeWindowControls(Boolean(launchContext.usesNativeWindowControls));
      setIsWindowMaximized(Boolean(launchContext.windowFrameState?.isMaximized));
      setAppUpdateState(launchContext.updateState);
      if (!launchContext.updateState.supportsAutoUpdate || updateAutoCheckRequestedRef.current) return;
      updateAutoCheckRequestedRef.current = true;
      void window.svnDiff?.checkForAppUpdate?.({ manual: false });
    };

    const loadData = async () => {
      debugLog('electron-lifecycle:load-data:start');
      if (!window.svnDiff?.getLaunchContext && !window.svnDiff?.getLaunchState) {
        if (!cancelled) {
          debugLog('electron-lifecycle:bridge-missing');
          setIsElectron(false);
          diffLoadActions.setLoaded(false);
          diffLoadActions.setPhase('error');
          diffLoadActions.setError('Electron bridge is unavailable.');
          diffLoadActions.setMetrics(null);
        }
        return undefined;
      }

      setIsElectron(true);

      let seq = 0;
      try {
        seq = ++loadSeqRef.current;
        let data: DiffData | null = null;

        if (window.svnDiff?.getLaunchContext) {
          debugLog('electron-lifecycle:get-launch-context:request', { seq });
          const launchContext = await window.svnDiff.getLaunchContext();
          debugLog('electron-lifecycle:get-launch-context:resolved', {
            seq,
            cancelled,
            currentSeq: loadSeqRef.current,
          });
          if (cancelled || seq !== loadSeqRef.current) return undefined;

          applyLaunchContext(launchContext);

          diffLoadActions.setError('');
          diffLoadActions.setLoading(true);
          diffLoadActions.setLoaded(false);
          diffLoadActions.setPhase('loading');
          await waitForNextPaint();
          if (cancelled || seq !== loadSeqRef.current) return undefined;

          if (!window.svnDiff?.getDiffData) {
            throw new Error('Electron diff loader is unavailable.');
          }
          debugLog('electron-lifecycle:get-diff-data:request', {
            seq,
            compareMode: workbookCompareModeRef.current,
          });
          data = await window.svnDiff.getDiffData(workbookCompareModeRef.current);
          debugLog('electron-lifecycle:get-diff-data:resolved', {
            seq,
            cancelled,
            currentSeq: loadSeqRef.current,
            hasDiffData: Boolean(data),
            fileName: data?.fileName ?? '',
          });
        } else if (window.svnDiff?.getLaunchState) {
          debugLog('electron-lifecycle:get-launch-state:request', { seq });
          const launchState = await window.svnDiff.getLaunchState(workbookCompareModeRef.current);
          debugLog('electron-lifecycle:get-launch-state:resolved', {
            seq,
            cancelled,
            currentSeq: loadSeqRef.current,
            hasDiffData: Boolean(launchState?.diffData),
            fileName: launchState?.diffData?.fileName ?? '',
          });
          if (cancelled || seq !== loadSeqRef.current) return undefined;

          applyLaunchContext(launchState);

          diffLoadActions.setError('');
          diffLoadActions.setLoading(true);
          diffLoadActions.setLoaded(false);
          diffLoadActions.setPhase('loading');
          await waitForNextPaint();
          if (cancelled || seq !== loadSeqRef.current) return undefined;

          data = launchState.diffData;
        }

        if (cancelled || seq !== loadSeqRef.current || !data) return undefined;

        const hasDiffPayload = Boolean(
          data
          && (
            typeof data.baseContent === 'string'
            || typeof data.mineContent === 'string'
            || hasBytePayload(data.baseBytes)
            || hasBytePayload(data.mineBytes)
            || Boolean(data.precomputedDiffLines?.length)
            || Boolean(data.precomputedDiffLinesByMode?.strict?.length)
            || Boolean(data.precomputedDiffLinesByMode?.content?.length)
          )
        );
        debugLog('electron-lifecycle:launch-state:evaluated', {
          seq,
          hasDiffPayload,
          baseContentType: typeof data?.baseContent,
          mineContentType: typeof data?.mineContent,
          baseBytes: hasBytePayload(data?.baseBytes) ? data.baseBytes.byteLength : 0,
          mineBytes: hasBytePayload(data?.mineBytes) ? data.mineBytes.byteLength : 0,
          strictDiffLines: data?.precomputedDiffLinesByMode?.strict?.length ?? 0,
          contentDiffLines: data?.precomputedDiffLinesByMode?.content?.length ?? 0,
        });
        if (hasDiffPayload) {
          await applyDiffData(data, {
            seq,
            loadingAlreadyStarted: true,
          });
        } else {
          applyEmptyLaunchState(seq);
        }
      } catch (error) {
        if (!cancelled && seq === loadSeqRef.current) {
          debugLog('electron-lifecycle:load-data:error', {
            seq,
            message: error instanceof Error ? error.message : String(error),
          });
          diffLoadActions.setLoading(false);
          diffLoadActions.setLoaded(false);
          diffLoadActions.setPhase('error');
          diffLoadActions.setError(error instanceof Error ? error.message : String(error));
          revisionQuerySeqRef.current += 1;
          revisionQueryActions.setStatus('error');
          revisionQueryActions.setQueryError(error instanceof Error ? error.message : String(error));
          setDiffSourceNoticeCode(null);
          setCompareContext('literal_two_file_compare');
          setResetPair(null);
          setLaunchBaseName('');
          setLaunchMineName('');
        }
      }

      return undefined;
    };

    let cleanup: (() => void) | undefined;
    void loadData()
      .then((fn) => {
        cleanup = fn;
      })
      .catch(() => {
        cleanup = undefined;
      });
    return () => {
      cancelled = true;
      debugLog('electron-lifecycle:bootstrap-effect:cleanup');
      cleanup?.();
    };
  }, [
    applyDiffData,
    diffLoadActions,
    loadSeqRef,
    revisionQuerySeqRef,
    revisionQueryActions,
    setAppUpdateState,
    setCompareContext,
    setDiffSourceNoticeCode,
    setIsDevMode,
    setIsElectron,
    setIsWindowMaximized,
    setLaunchBaseName,
    setLaunchMineName,
    setResetPair,
    setRevisionOptions,
    setUsesNativeWindowControls,
    updateAutoCheckRequestedRef,
    workbookCompareModeRef,
  ]);

  useEffect(() => {
    if (!window.svnDiff?.onCliArgsUpdated) return;
    return window.svnDiff.onCliArgsUpdated(() => {
      void reloadCliDiffData();
    });
  }, [reloadCliDiffData]);

  useEffect(() => {
    if (!window.svnDiff?.onWindowFrameStateChanged) return;

    let cancelled = false;
    const unsubscribe = window.svnDiff.onWindowFrameStateChanged((nextState) => {
      if (cancelled) return;
      setIsWindowMaximized(Boolean(nextState?.isMaximized));
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [setIsWindowMaximized]);

  useEffect(() => {
    if (!window.svnDiff?.onAppUpdateState) return;

    let cancelled = false;
    const unsubscribe = window.svnDiff.onAppUpdateState((nextState) => {
      if (cancelled) return;
      setAppUpdateState(nextState);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [setAppUpdateState]);

}
