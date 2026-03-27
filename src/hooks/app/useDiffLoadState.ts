import { useCallback, useMemo, useReducer, type SetStateAction } from 'react';

import type { DiffLoadController, DiffLoadState } from '@/hooks/app/contracts';

type DiffLoadAction =
  | { type: 'setIsLoadingDiff'; value: SetStateAction<boolean> }
  | { type: 'setHasLoadedDiff'; value: SetStateAction<boolean> }
  | { type: 'setLoadPhase'; value: SetStateAction<DiffLoadState['loadPhase']> }
  | { type: 'setLoadError'; value: SetStateAction<string> }
  | { type: 'setLoadPerfMetrics'; value: SetStateAction<DiffLoadState['loadPerfMetrics']> };

function resolveSetStateAction<T>(prev: T, value: SetStateAction<T>): T {
  return typeof value === 'function' ? (value as (prevState: T) => T)(prev) : value;
}

function diffLoadReducer(state: DiffLoadState, action: DiffLoadAction): DiffLoadState {
  switch (action.type) {
    case 'setIsLoadingDiff':
      return { ...state, isLoadingDiff: resolveSetStateAction(state.isLoadingDiff, action.value) };
    case 'setHasLoadedDiff':
      return { ...state, hasLoadedDiff: resolveSetStateAction(state.hasLoadedDiff, action.value) };
    case 'setLoadPhase':
      return { ...state, loadPhase: resolveSetStateAction(state.loadPhase, action.value) };
    case 'setLoadError':
      return { ...state, loadError: resolveSetStateAction(state.loadError, action.value) };
    case 'setLoadPerfMetrics':
      return { ...state, loadPerfMetrics: resolveSetStateAction(state.loadPerfMetrics, action.value) };
    default:
      return state;
  }
}

export default function useDiffLoadState() {
  const [state, dispatch] = useReducer(diffLoadReducer, {
    isLoadingDiff: false,
    hasLoadedDiff: false,
    loadPhase: 'idle' as DiffLoadState['loadPhase'],
    loadError: '',
    loadPerfMetrics: null,
  });

  const setLoading = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setIsLoadingDiff', value });
  }, []);

  const setLoaded = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: 'setHasLoadedDiff', value });
  }, []);

  const setPhase = useCallback((value: SetStateAction<DiffLoadState['loadPhase']>) => {
    dispatch({ type: 'setLoadPhase', value });
  }, []);

  const setError = useCallback((value: SetStateAction<string>) => {
    dispatch({ type: 'setLoadError', value });
  }, []);

  const setMetrics = useCallback((value: SetStateAction<DiffLoadState['loadPerfMetrics']>) => {
    dispatch({ type: 'setLoadPerfMetrics', value });
  }, []);

  const actions = useMemo<DiffLoadController['actions']>(() => ({
      setLoading,
      setLoaded,
      setPhase,
      setError,
      setMetrics,
  }), [
    setError,
    setLoaded,
    setLoading,
    setMetrics,
    setPhase,
  ]);

  return useMemo<DiffLoadController>(() => ({
    state,
    actions,
  }), [actions, state]);
}
