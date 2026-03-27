// Central export surface for app-level hooks, helper utilities, and controller
// contracts. Prefer importing from this barrel so app orchestration code uses
// one stable entrypoint.

export { default as useAppChromeEffects } from '@/hooks/app/useAppChromeEffects';
export { default as useAppKeyboardShortcuts } from '@/hooks/app/useAppKeyboardShortcuts';
export { default as useAppUpdateActions } from '@/hooks/app/useAppUpdateActions';
export { default as useAppViewModel } from '@/hooks/app/useAppViewModel';
export { default as useDialogState } from '@/hooks/app/useDialogState';
export { default as useDiffLoader } from '@/hooks/app/useDiffLoader';
export { default as useDiffLoadState } from '@/hooks/app/useDiffLoadState';
export { default as useElectronLifecycleEffects } from '@/hooks/app/useElectronLifecycleEffects';
export { default as useRevisionCompare } from '@/hooks/app/useRevisionCompare';
export { default as useRevisionQueryState } from '@/hooks/app/useRevisionQueryState';
export { default as useWorkbookActions } from '@/hooks/app/useWorkbookActions';
export { default as useWorkbookViewEffects } from '@/hooks/app/useWorkbookViewEffects';

export {
  cycleHunkIndex,
} from '@/hooks/app/helpers';

export type {
  DialogActions,
  DialogController,
  DialogId,
  DialogState,
  DiffLoadActions,
  DiffLoadController,
  DiffLoadState,
  RevisionQueryActions,
  RevisionQueryController,
  RevisionQueryState,
  WorkbookUiActions,
  WorkbookUiController,
  WorkbookUiState,
} from '@/hooks/app/contracts';

export type {
  CachedDiffResult,
  LoadPhase,
  RevisionOptionsStatus,
  WorkbookContextMenuState,
  WorkbookFreezeStateMap,
} from '@/hooks/app/types';
