import { useCallback, type MutableRefObject } from 'react';

import type {
  DiffData,
  RevisionOptionsPayload,
  RevisionOptionsQuery,
  SvnRevisionInfo,
  WorkbookCompareMode,
} from '@/types';
import { debugLog, mergeRevisionOptions } from '@/hooks/app/helpers';
import type { RevisionQueryController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseRevisionCompareArgs {
  revisionOptionsRef: MutableRefObject<SvnRevisionInfo[]>;
  revisionQuerySeqRef: MutableRefObject<number>;
  loadSeqRef: MutableRefObject<number>;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  revisionQuery: RevisionQueryController;
  applyDiffData: (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => Promise<void>;
  beginDiffLoad: () => Promise<number>;
  failDiffLoad: (seq: number, error: unknown) => void;
}

export default function useRevisionCompare({
  revisionOptionsRef,
  revisionQuerySeqRef,
  loadSeqRef,
  workbookCompareModeRef,
  revisionQuery,
  applyDiffData,
  beginDiffLoad,
  failDiffLoad,
}: UseRevisionCompareArgs) {
  // ── Read state/setters directly from Zustand store ────────────────────
  const resetPair = useAppStore((s) => s.resetPair);
  const setRevisionOptions = useAppStore((s) => s.setRevisionOptions);
  const setBaseRevisionInfo = useAppStore((s) => s.setBaseRevisionInfo);
  const setMineRevisionInfo = useAppStore((s) => s.setMineRevisionInfo);

  const { state: revisionState, actions: revisionActions } = revisionQuery;

  const applyRevisionOptionsPayload = useCallback((
    payload: RevisionOptionsPayload,
    mode: 'replace' | 'append' = 'replace',
  ) => {
    const nextOptions = mode === 'append'
      ? mergeRevisionOptions(revisionOptionsRef.current, payload.items)
      : payload.items;

    revisionOptionsRef.current = nextOptions;
    setRevisionOptions(nextOptions);
    revisionActions.setStatus('loaded');
    revisionActions.setHasMore(payload.hasMore);
    revisionActions.setNextBeforeId(payload.nextBeforeRevisionId);
    revisionActions.setQueryDateTime(payload.queryDateTime ?? '');
    revisionActions.setQueryError('');
    setBaseRevisionInfo((prev) => (
      prev ? (nextOptions.find((option) => option.id === prev.id) ?? prev) : prev
    ));
    setMineRevisionInfo((prev) => (
      prev ? (nextOptions.find((option) => option.id === prev.id) ?? prev) : prev
    ));
  }, [
    revisionOptionsRef,
    revisionActions,
    setBaseRevisionInfo,
    setMineRevisionInfo,
    setRevisionOptions,
  ]);

  const queryRevisionOptionsPage = useCallback(async (
    query: RevisionOptionsQuery,
    options?: {
      append?: boolean;
      showInitialLoading?: boolean;
      showSearchLoading?: boolean;
    },
  ) => {
    if (!window.svnDiff?.queryRevisionOptions) return;
    const seq = ++revisionQuerySeqRef.current;
    const append = Boolean(options?.append);

    if (options?.showInitialLoading) {
      revisionActions.setStatus('loading');
    }
    if (append) {
      revisionActions.setLoadingMore(true);
    }
    if (options?.showSearchLoading) {
      revisionActions.setSearchingDateTime(true);
    }
    if (!append) {
      revisionActions.setQueryError('');
    }

    try {
      const payload = await window.svnDiff.queryRevisionOptions(query);
      if (seq !== revisionQuerySeqRef.current) return;
      applyRevisionOptionsPayload(payload, append ? 'append' : 'replace');
      debugLog('revision-options:loaded', {
        count: payload.items.length,
        hasMore: payload.hasMore,
        nextBeforeRevisionId: payload.nextBeforeRevisionId,
        queryDateTime: payload.queryDateTime,
      });
    } catch (error) {
      if (seq !== revisionQuerySeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      revisionActions.setQueryError(message);
      if (options?.showInitialLoading) {
        revisionActions.setStatus('error');
      }
      debugLog('revision-options:error', { message });
    } finally {
      if (seq === revisionQuerySeqRef.current) {
        if (append) {
          revisionActions.setLoadingMore(false);
        }
        if (options?.showSearchLoading) {
          revisionActions.setSearchingDateTime(false);
        }
      }
    }
  }, [
    applyRevisionOptionsPayload,
    revisionQuerySeqRef,
    revisionActions,
  ]);

  const handleLoadMoreRevisionOptions = useCallback(() => {
    if (!window.svnDiff?.queryRevisionOptions) return;
    if (revisionState.isLoadingMoreRevisions || !revisionState.revisionHasMore || !revisionState.revisionNextBeforeId) return;
    void queryRevisionOptionsPage(
      {
        limit: 50,
        beforeRevisionId: revisionState.revisionNextBeforeId,
        includeSpecials: false,
      },
      {
        append: true,
      },
    );
  }, [
    queryRevisionOptionsPage,
    revisionState.isLoadingMoreRevisions,
    revisionState.revisionHasMore,
    revisionState.revisionNextBeforeId,
  ]);

  const handleEnsureRevisionOptionsLoaded = useCallback(() => {
    if (!window.svnDiff?.queryRevisionOptions) return;
    if (revisionOptionsRef.current.length > 0) return;
    if (revisionState.revisionOptionsStatus === 'loading') return;

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
  }, [
    queryRevisionOptionsPage,
    revisionOptionsRef,
    revisionState.revisionOptionsStatus,
  ]);

  const handleRevisionDateTimeQuery = useCallback((nextDateTime: string) => {
    if (!window.svnDiff?.queryRevisionOptions) return;
    const trimmed = nextDateTime.trim();
    void queryRevisionOptionsPage(
      trimmed
        ? {
            limit: 50,
            anchorDateTime: trimmed,
            includeSpecials: false,
          }
        : {
            limit: 50,
            includeSpecials: false,
          },
      {
        showSearchLoading: true,
      },
    );
  }, [queryRevisionOptionsPage]);

  const handleRevisionCompareChange = useCallback(async (
    nextBaseRevisionId: string,
    nextMineRevisionId: string,
  ) => {
    if (!window.svnDiff?.loadRevisionDiff) return;
    revisionActions.setSwitching(true);
    const seq = await beginDiffLoad();
    try {
      const nextData = await window.svnDiff.loadRevisionDiff(
        nextBaseRevisionId,
        nextMineRevisionId,
        workbookCompareModeRef.current,
      );
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
    } finally {
      revisionActions.setSwitching(false);
    }
  }, [
    applyDiffData,
    beginDiffLoad,
    failDiffLoad,
    loadSeqRef,
    revisionActions,
    workbookCompareModeRef,
  ]);

  const handleResetRevisionCompare = useCallback(async () => {
    if (!window.svnDiff?.loadRevisionDiff || !resetPair) return;
    if (!resetPair.baseRevisionId && !resetPair.mineRevisionId) return;

    revisionActions.setSwitching(true);
    const seq = await beginDiffLoad();
    try {
      const nextData = await window.svnDiff.loadRevisionDiff(
        resetPair.baseRevisionId ?? '',
        resetPair.mineRevisionId ?? '',
        workbookCompareModeRef.current,
      );
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
    } finally {
      revisionActions.setSwitching(false);
    }
  }, [
    applyDiffData,
    beginDiffLoad,
    failDiffLoad,
    loadSeqRef,
    resetPair,
    revisionActions,
    workbookCompareModeRef,
  ]);

  return {
    handleEnsureRevisionOptionsLoaded,
    queryRevisionOptionsPage,
    handleLoadMoreRevisionOptions,
    handleRevisionDateTimeQuery,
    handleRevisionCompareChange,
    handleResetRevisionCompare,
  };
}
