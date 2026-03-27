import { useCallback, useMemo, useReducer, type SetStateAction } from 'react';

import type { DialogController, DialogId, DialogState } from '@/hooks/app/contracts';

type DialogAction =
  | {
      type: 'set';
      key: keyof DialogState;
      value: SetStateAction<boolean>;
    }
  | {
      type: 'closeAll';
    };

function resolveSetStateAction<T>(prev: T, value: SetStateAction<T>): T {
  return typeof value === 'function' ? (value as (prevState: T) => T)(prev) : value;
}

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  if (action.type === 'closeAll') {
    return {
      showSearch: false,
      showGoto: false,
      showHelp: false,
      showAbout: false,
      showSvnConfig: false,
    };
  }

  return {
    ...state,
    [action.key]: resolveSetStateAction(state[action.key], action.value),
  };
}

const KEY_BY_DIALOG_ID: Record<DialogId, keyof DialogState> = {
  search: 'showSearch',
  goto: 'showGoto',
  help: 'showHelp',
  about: 'showAbout',
  svnConfig: 'showSvnConfig',
};

export default function useDialogState() {
  const [state, dispatch] = useReducer(dialogReducer, {
    showSearch: false,
    showGoto: false,
    showHelp: false,
    showAbout: false,
    showSvnConfig: false,
  });

  const set = useCallback((dialog: DialogId, value: SetStateAction<boolean>) => {
    dispatch({ type: 'set', key: KEY_BY_DIALOG_ID[dialog], value });
  }, []);

  const open = useCallback((dialog: DialogId) => {
    set(dialog, true);
  }, [set]);

  const close = useCallback((dialog: DialogId) => {
    set(dialog, false);
  }, [set]);

  const toggle = useCallback((dialog: DialogId) => {
    set(dialog, (prev) => !prev);
  }, [set]);

  const closeAll = useCallback(() => {
    dispatch({ type: 'closeAll' });
  }, []);

  const actions = useMemo<DialogController['actions']>(() => ({
      set,
      open,
      close,
      toggle,
      closeAll,
  }), [
    close,
    closeAll,
    open,
    set,
    toggle,
  ]);

  return useMemo<DialogController>(() => ({
    state,
    actions,
  }), [actions, state]);
}
