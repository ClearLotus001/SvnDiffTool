import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type {
  AppUpdateState,
  CompareContext,
  DiffData,
  DiffSourceNoticeCode,
  RevisionOptionsQuery,
  RevisionSelectionPair,
  SvnRevisionInfo,
  WorkbookCompareMode,
} from '@/types';
import { clearTokenCache } from '@/engine/text/tokenizer';
import { debugLog, hasBytePayload } from '@/hooks/app/helpers';
import type { DiffLoadController, RevisionQueryController } from '@/hooks/app/contracts';

interface UseElectronLifecycleEffectsArgs {
  applyDiffData: (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => Promise<void>;
  beginDiffLoad: () => Promise<number>;
  reloadCliDiffData: () => Promise<void>;
  queryRevisionOptionsPage: (
    query: RevisionOptionsQuery,
    options?: {
      append?: boolean;
      showInitialLoading?: boolean;
      showSearchLoading?: boolean;
    },
  ) => Promise<void>;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  loadSeqRef: MutableRefObject<number>;
  revisionQuerySeqRef: MutableRefObject<number>;
  updateAutoCheckRequestedRef: MutableRefObject<boolean>;
  diffLoad: DiffLoadController;
  revisionQuery: RevisionQueryController;
  canSwitchRevisions: boolean;
  setIsElectron: Dispatch<SetStateAction<boolean>>;
  setRevisionOptions: Dispatch<SetStateAction<SvnRevisionInfo[]>>;
  setDiffSourceNoticeCode: Dispatch<SetStateAction<DiffSourceNoticeCode | null>>;
  setCompareContext: Dispatch<SetStateAction<CompareContext>>;
  setResetPair: Dispatch<SetStateAction<RevisionSelectionPair | null>>;
  setLaunchBaseName: Dispatch<SetStateAction<string>>;
  setLaunchMineName: Dispatch<SetStateAction<string>>;
  setIsDevMode: Dispatch<SetStateAction<boolean>>;
  setUsesNativeWindowControls: Dispatch<SetStateAction<boolean>>;
  setIsWindowMaximized: Dispatch<SetStateAction<boolean>>;
  setAppUpdateState: Dispatch<SetStateAction<AppUpdateState | null>>;
}

export default function useElectronLifecycleEffects({
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
}: UseElectronLifecycleEffectsArgs) {
  const { actions: diffLoadActions } = diffLoad;
  const { state: revisionQueryState, actions: revisionQueryActions } = revisionQuery;

  useEffect(() => {
    clearTokenCache();
    let cancelled = false;

    const loadData = async () => {
      if (!window.svnDiff) {
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
      try {
        const devMode = await window.svnDiff.isDevMode?.();
        if (!cancelled) setIsDevMode(Boolean(devMode));
      } catch {
        if (!cancelled) setIsDevMode(false);
      }
      try {
        const nativeWindowControls = await window.svnDiff.usesNativeWindowControls?.();
        if (!cancelled) setUsesNativeWindowControls(Boolean(nativeWindowControls));
      } catch {
        if (!cancelled) setUsesNativeWindowControls(false);
      }

      let seq = 0;
      try {
        seq = await beginDiffLoad();
        const data = await window.svnDiff.getDiffData(workbookCompareModeRef.current);
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
          if (!cancelled && seq === loadSeqRef.current) {
            await applyDiffData(data, {
              seq,
              loadingAlreadyStarted: true,
            });
          }
        } else if (!cancelled && seq === loadSeqRef.current) {
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
    beginDiffLoad,
    diffLoadActions,
    loadSeqRef,
    revisionQuerySeqRef,
    revisionQueryActions,
    setCompareContext,
    setDiffSourceNoticeCode,
    setIsDevMode,
    setIsElectron,
    setLaunchBaseName,
    setLaunchMineName,
    setResetPair,
    setRevisionOptions,
    setUsesNativeWindowControls,
    workbookCompareModeRef,
  ]);

  useEffect(() => {
    if (!window.svnDiff?.onCliArgsUpdated) return;
    return window.svnDiff.onCliArgsUpdated(() => {
      void reloadCliDiffData();
    });
  }, [reloadCliDiffData]);

  useEffect(() => {
    if (!window.svnDiff?.getWindowFrameState || !window.svnDiff?.onWindowFrameStateChanged) return;

    let cancelled = false;
    const unsubscribe = window.svnDiff.onWindowFrameStateChanged((nextState) => {
      if (cancelled) return;
      setIsWindowMaximized(Boolean(nextState?.isMaximized));
    });

    void window.svnDiff.getWindowFrameState()
      .then((state) => {
        if (cancelled) return;
        setIsWindowMaximized(Boolean(state?.isMaximized));
      })
      .catch(() => {
        if (!cancelled) {
          setIsWindowMaximized(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [setIsWindowMaximized]);

  useEffect(() => {
    if (!window.svnDiff?.getUpdateState || !window.svnDiff?.onAppUpdateState) return;

    let cancelled = false;
    const unsubscribe = window.svnDiff.onAppUpdateState((nextState) => {
      if (cancelled) return;
      setAppUpdateState(nextState);
    });

    void window.svnDiff.getUpdateState()
      .then((state) => {
        if (cancelled) return;
        setAppUpdateState(state);
        if (!state.supportsAutoUpdate || updateAutoCheckRequestedRef.current) return;
        updateAutoCheckRequestedRef.current = true;
        void window.svnDiff?.checkForAppUpdate?.({ manual: false });
      })
      .catch(() => {
        if (!cancelled) {
          setAppUpdateState(null);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [setAppUpdateState, updateAutoCheckRequestedRef]);

  useEffect(() => {
    if (!window.svnDiff?.queryRevisionOptions) return;
    if (!canSwitchRevisions || revisionQueryState.revisionOptionsStatus !== 'idle') return;

    debugLog('revision-options:request');

    void queryRevisionOptionsPage(
      {
        limit: 50,
        includeSpecials: false,
      },
      {
        showInitialLoading: true,
      },
    );
  }, [canSwitchRevisions, queryRevisionOptionsPage, revisionQueryState.revisionOptionsStatus]);
}
