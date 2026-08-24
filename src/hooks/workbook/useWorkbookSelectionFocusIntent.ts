import { useCallback, useReducer, useRef } from 'react';

import type {
  WorkbookSelectionFocusIntent,
  WorkbookSelectionRequest,
} from '@/types';

function isExplicitFocusReason(
  reason: WorkbookSelectionRequest['reason'],
): reason is WorkbookSelectionFocusIntent['reason'] {
  return reason === 'click' || reason === 'contextmenu' || reason === 'keyboard';
}

export function clearHandledWorkbookFocusIntent(
  intent: WorkbookSelectionFocusIntent | null,
  intentId: number,
): WorkbookSelectionFocusIntent | null {
  return intent?.id === intentId ? null : intent;
}

export function useWorkbookSelectionFocusIntent(
  onSelectionRequest: (request: WorkbookSelectionRequest) => void,
  navigationContext: string | number | null,
) {
  const nextIntentIdRef = useRef(0);
  const focusIntentRef = useRef<WorkbookSelectionFocusIntent | null>(null);
  const [, scheduleIntentRender] = useReducer((version: number) => version + 1, 0);

  const requestSelection = useCallback((request: WorkbookSelectionRequest) => {
    if (request.target && request.target.kind !== 'row' && isExplicitFocusReason(request.reason)) {
      nextIntentIdRef.current += 1;
      focusIntentRef.current = {
        id: nextIntentIdRef.current,
        target: request.target,
        reason: request.reason,
        navigationContext,
      };
    } else {
      focusIntentRef.current = null;
    }
    scheduleIntentRender();
    onSelectionRequest(request);
  }, [navigationContext, onSelectionRequest]);

  const markFocusIntentHandled = useCallback((intentId: number) => {
    const nextIntent = clearHandledWorkbookFocusIntent(focusIntentRef.current, intentId);
    if (nextIntent === focusIntentRef.current) return;
    focusIntentRef.current = nextIntent;
    scheduleIntentRender();
  }, []);

  return {
    focusIntent: focusIntentRef.current,
    requestSelection,
    markFocusIntentHandled,
  };
}
