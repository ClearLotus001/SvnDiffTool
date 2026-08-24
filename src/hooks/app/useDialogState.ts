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

export function createClosedDialogState(): DialogState {
  return {
    showSearch: false,
    showGoto: false,
    showHelp: false,
    showAbout: false,
    showSvnConfig: false,
    showLocalFileCompare: false,
  };
}

export function resolveDialogStateUpdate(
  state: DialogState,
  key: keyof DialogState,
  value: SetStateAction<boolean>,
): DialogState {
  const nextValue = resolveSetStateAction(state[key], value);
  if (!nextValue) {
    return state[key] ? { ...state, [key]: false } : state;
  }
  return {
    ...createClosedDialogState(),
    [key]: true,
  };
}

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  if (action.type === 'closeAll') {
    return createClosedDialogState();
  }
  return resolveDialogStateUpdate(state, action.key, action.value);
}

const KEY_BY_DIALOG_ID: Record<DialogId, keyof DialogState> = {
  search: 'showSearch',
  goto: 'showGoto',
  help: 'showHelp',
  about: 'showAbout',
  svnConfig: 'showSvnConfig',
  localFileCompare: 'showLocalFileCompare',
};

export default function useDialogState() {
  const [state, dispatch] = useReducer(dialogReducer, undefined, createClosedDialogState);

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
