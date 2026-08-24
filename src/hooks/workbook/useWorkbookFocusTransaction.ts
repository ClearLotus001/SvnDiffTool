import { useEffect } from 'react';

import type {
  WorkbookSelectedCell,
  WorkbookSelectionFocusIntent,
} from '@/types';

export type WorkbookFocusIntentDisposition = 'discard' | 'idle' | 'run' | 'wait';

export function resolveWorkbookFocusIntentDisposition(params: {
  active: boolean;
  activeSheetName: string | null;
  navigationContext: string | number | null;
  intent: WorkbookSelectionFocusIntent | null;
}): WorkbookFocusIntentDisposition {
  const {
    active,
    activeSheetName,
    navigationContext,
    intent,
  } = params;

  if (!intent) return 'idle';
  if (!active || !activeSheetName || intent.target.sheetName !== activeSheetName) return 'wait';
  if (intent.navigationContext !== navigationContext) return 'discard';
  return 'run';
}

interface UseWorkbookFocusTransactionParams {
  active: boolean;
  activeSheetName: string | null;
  navigationContext: string | number | null;
  intent: WorkbookSelectionFocusIntent | null;
  executeFocus: (target: WorkbookSelectedCell) => boolean;
  onIntentHandled: (intentId: number) => void;
}

export function useWorkbookFocusTransaction({
  active,
  activeSheetName,
  navigationContext,
  intent,
  executeFocus,
  onIntentHandled,
}: UseWorkbookFocusTransactionParams): void {
  useEffect(() => {
    const disposition = resolveWorkbookFocusIntentDisposition({
      active,
      activeSheetName,
      navigationContext,
      intent,
    });
    if (!intent || disposition === 'idle' || disposition === 'wait') return;
    if (disposition === 'discard') {
      onIntentHandled(intent.id);
      return;
    }

    const rafId = requestAnimationFrame(() => {
      if (executeFocus(intent.target)) {
        onIntentHandled(intent.id);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeSheetName,
    executeFocus,
    intent,
    navigationContext,
    onIntentHandled,
  ]);
}
