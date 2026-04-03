import { useEffect, type MutableRefObject } from 'react';

import type {
  DiffData,
  LaunchStatePayload,
  WorkbookCompareMode,
} from '@/types';
import { clearTokenCache } from '@/engine/text/tokenizer';
import { hasBytePayload } from '@/hooks/app/helpers';
import type { DiffLoadController, RevisionQueryController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseElectronLifecycleEffectsArgs {
  applyDiffData: (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => Promise<void>;
  reloadCliDiffData: () => Promise<void>;
  startupBootstrapStartedRef: MutableRefObject<boolean>;
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
  startupBootstrapStartedRef,
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
    clearTokenCache();
    let cancelled = false;

    if (startupBootstrapStartedRef.current) {
      return undefined;
    }
    startupBootstrapStartedRef.current = true;

    const applyEmptyLaunchState = (seq: number) => {
      if (seq !== loadSeqRef.current) return;
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

    const applyLaunchContext = (launchState: LaunchStatePayload) => {
      setIsDevMode(Boolean(launchState.isDevMode));
      setUsesNativeWindowControls(Boolean(launchState.usesNativeWindowControls));
      setIsWindowMaximized(Boolean(launchState.windowFrameState?.isMaximized));
      setAppUpdateState(launchState.updateState);
      if (!launchState.updateState.supportsAutoUpdate || updateAutoCheckRequestedRef.current) return;
      updateAutoCheckRequestedRef.current = true;
      void window.svnDiff?.checkForAppUpdate?.({ manual: false });
    };

    const loadData = async () => {
      if (!window.svnDiff?.getLaunchState) {
        if (!cancelled) {
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
        const launchState = await window.svnDiff.getLaunchState(workbookCompareModeRef.current);
        if (cancelled || seq !== loadSeqRef.current) return undefined;

        applyLaunchContext(launchState);

        const data = launchState.diffData;
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
    startupBootstrapStartedRef,
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
