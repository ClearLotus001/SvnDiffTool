// Shared controller contracts for app-level hooks.
// These interfaces define the stable state/action shapes passed between
// App.tsx and orchestration hooks so hook composition stays consistent.

import type { SetStateAction } from 'react';

import type {
  DiffPerformanceMetrics,
  WorkbookFreezeState,
  WorkbookHiddenStateBySheet,
  WorkbookSelectionState,
} from '@/types';
import type { LoadPhase, RevisionOptionsStatus } from '@/hooks/app/types';
import type { WorkbookColumnWidthBySheet } from '@/utils/workbook/workbookColumnWidths';
import type { WorkbookContextMenuState } from '@/hooks/app/types';

export interface DialogState {
  // Transient shell overlays and panels.
  showSearch: boolean;
  showGoto: boolean;
  showHelp: boolean;
  showAbout: boolean;
  showSvnConfig: boolean;
}

export type DialogId = 'search' | 'goto' | 'help' | 'about' | 'svnConfig';

export interface DialogActions {
  set: (dialog: DialogId, value: SetStateAction<boolean>) => void;
  open: (dialog: DialogId) => void;
  close: (dialog: DialogId) => void;
  toggle: (dialog: DialogId) => void;
  closeAll: () => void;
}

export interface DialogController {
  state: DialogState;
  actions: DialogActions;
}

export interface DiffLoadState {
  // Async load lifecycle for the current diff session.
  isLoadingDiff: boolean;
  hasLoadedDiff: boolean;
  loadPhase: LoadPhase;
  loadError: string;
  loadPerfMetrics: DiffPerformanceMetrics | null;
}

export interface DiffLoadActions {
  setLoading: (value: SetStateAction<boolean>) => void;
  setLoaded: (value: SetStateAction<boolean>) => void;
  setPhase: (value: SetStateAction<LoadPhase>) => void;
  setError: (value: SetStateAction<string>) => void;
  setMetrics: (value: SetStateAction<DiffPerformanceMetrics | null>) => void;
}

export interface DiffLoadController {
  state: DiffLoadState;
  actions: DiffLoadActions;
}

export interface RevisionQueryState {
  // Async revision browsing and switching status.
  revisionOptionsStatus: RevisionOptionsStatus;
  revisionHasMore: boolean;
  revisionNextBeforeId: string | null;
  revisionQueryDateTime: string;
  revisionQueryError: string;
  isLoadingMoreRevisions: boolean;
  isSearchingRevisionDateTime: boolean;
  isSwitchingRevisions: boolean;
}

export interface RevisionQueryActions {
  setStatus: (value: SetStateAction<RevisionOptionsStatus>) => void;
  setHasMore: (value: SetStateAction<boolean>) => void;
  setNextBeforeId: (value: SetStateAction<string | null>) => void;
  setQueryDateTime: (value: SetStateAction<string>) => void;
  setQueryError: (value: SetStateAction<string>) => void;
  setLoadingMore: (value: SetStateAction<boolean>) => void;
  setSearchingDateTime: (value: SetStateAction<boolean>) => void;
  setSwitching: (value: SetStateAction<boolean>) => void;
}

export interface RevisionQueryController {
  state: RevisionQueryState;
  actions: RevisionQueryActions;
}

export interface WorkbookUiState {
  // Workbook-only UI state shared by selection, layout, and context-menu hooks.
  selection: WorkbookSelectionState;
  hiddenStateBySheet: WorkbookHiddenStateBySheet;
  contextMenu: WorkbookContextMenuState | null;
  freezeBySheet: Record<string, WorkbookFreezeState>;
  columnWidthBySheet: WorkbookColumnWidthBySheet;
  activeSheetName: string | null;
  showHiddenColumns: boolean;
}

export interface WorkbookUiActions {
  setSelection: (value: SetStateAction<WorkbookSelectionState>) => void;
  setHiddenStateBySheet: (value: SetStateAction<WorkbookHiddenStateBySheet>) => void;
  setContextMenu: (value: SetStateAction<WorkbookContextMenuState | null>) => void;
  setFreezeBySheet: (value: SetStateAction<Record<string, WorkbookFreezeState>>) => void;
  setColumnWidthBySheet: (value: SetStateAction<WorkbookColumnWidthBySheet>) => void;
  setActiveSheetName: (value: SetStateAction<string | null>) => void;
  setShowHiddenColumns: (value: SetStateAction<boolean>) => void;
}

export interface WorkbookUiController {
  state: WorkbookUiState;
  actions: WorkbookUiActions;
}
