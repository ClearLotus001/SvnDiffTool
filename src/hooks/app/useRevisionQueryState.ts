import { useCallback, useMemo, useReducer, type SetStateAction } from 'react';

import type { RevisionQueryController, RevisionQueryState } from '@/hooks/app/contracts';

type RevisionQueryAction =
  | { type: 'setRevisionOptionsStatus'; value: SetStateAction<RevisionQueryState['revisionOptionsStatus']> }
  | { type: 'setRevisionHasMore'; value: SetStateAction<boolean> }
  | { type: 'setRevisionNextBeforeId'; value: SetStateAction<string | null> }
  | { type: 'setRevisionQueryDateTime'; value: SetStateAction<string> }
  | { type: 'setRevisionQueryError'; value: SetStateAction<string> }
  | { type: 'setIsLoadingMoreRevisions'; value: SetStateAction<boolean> }
  | { type: 'setIsSearchingRevisionDateTime'; value: SetStateAction<boolean> }
  | { type: 'setIsSwitchingRevisions'; value: SetStateAction<boolean> };

function resolveSetStateAction<T>(prev: T, value: SetStateAction<T>): T {
  return typeof value === 'function' ? (value as (prevState: T) => T)(prev) : value;
}

function revisionQueryReducer(state: RevisionQueryState, action: RevisionQueryAction): RevisionQueryState {
  switch (action.type) {
    case 'setRevisionOptionsStatus':
      return { ...state, revisionOptionsStatus: resolveSetStateAction(state.revisionOptionsStatus, action.value) };
    case 'setRevisionHasMore':
      return { ...state, revisionHasMore: resolveSetStateAction(state.revisionHasMore, action.value) };
    case 'setRevisionNextBeforeId':
      return { ...state, revisionNextBeforeId: resolveSetStateAction(state.revisionNextBeforeId, action.value) };
    case 'setRevisionQueryDateTime':
      return { ...state, revisionQueryDateTime: resolveSetStateAction(state.revisionQueryDateTime, action.value) };
    case 'setRevisionQueryError':
      return { ...state, revisionQueryError: resolveSetStateAction(state.revisionQueryError, action.value) };
    case 'setIsLoadingMoreRevisions':
      return { ...state, isLoadingMoreRevisions: resolveSetStateAction(state.isLoadingMoreRevisions, action.value) };
    case 'setIsSearchingRevisionDateTime':
      return { ...state, isSearchingRevisionDateTime: resolveSetStateAction(state.isSearchingRevisionDateTime, action.value) };
    case 'setIsSwitchingRevisions':
      return { ...state, isSwitchingRevisions: resolveSetStateAction(state.isSwitchingRevisions, action.value) };
    default:
      return state;
  }
}

export default function useRevisionQueryState() {
  const [state, dispatch] = useReducer(revisionQueryReducer, {
    revisionOptionsStatus: 'idle' as RevisionQueryState['revisionOptionsStatus'],
    revisionHasMore: false,
    revisionNextBeforeId: null,
    revisionQueryDateTime: '',
    revisionQueryError: '',
    isLoadingMoreRevisions: false,
    isSearchingRevisionDateTime: false,
    isSwitchingRevisions: false,
  });

  const setStatus = useCallback((value: SetStateAction<RevisionQueryState['revisionOptionsStatus']>) => {
    dispatch({ type: 'setRevisionOptionsStatus', value });
  }, []);

  const setHasMore = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setRevisionHasMore', value });
  }, []);

  const setNextBeforeId = useCallback((value: SetStateAction<string | null>) => {
    dispatch({ type: 'setRevisionNextBeforeId', value });
  }, []);

  const setQueryDateTime = useCallback((value: SetStateAction<string>) => {
    dispatch({ type: 'setRevisionQueryDateTime', value });
  }, []);

  const setQueryError = useCallback((value: SetStateAction<string>) => {
    dispatch({ type: 'setRevisionQueryError', value });
  }, []);

  const setLoadingMore = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setIsLoadingMoreRevisions', value });
  }, []);

  const setSearchingDateTime = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setIsSearchingRevisionDateTime', value });
  }, []);

  const setSwitching = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setIsSwitchingRevisions', value });
  }, []);

  const actions = useMemo<RevisionQueryController['actions']>(() => ({
      setStatus,
      setHasMore,
      setNextBeforeId,
      setQueryDateTime,
      setQueryError,
      setLoadingMore,
      setSearchingDateTime,
      setSwitching,
  }), [
    setHasMore,
    setLoadingMore,
    setNextBeforeId,
    setQueryDateTime,
    setQueryError,
    setSearchingDateTime,
    setStatus,
    setSwitching,
  ]);

  return useMemo<RevisionQueryController>(() => ({
    state,
    actions,
  }), [actions, state]);
}
