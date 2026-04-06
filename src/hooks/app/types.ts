import type {
  DiffLine,
  WorkbookContextMenuPoint,
  WorkbookFreezeState,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSelectionState,
} from '@/types';

export type WorkbookFreezeStateMap = Record<string, WorkbookFreezeState>;
export type LoadPhase = 'bootstrapping' | 'idle' | 'loading' | 'ready' | 'error';
export type RevisionOptionsStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface CachedDiffResult {
  diffLines: DiffLine[];
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
}

export interface WorkbookContextMenuState {
  anchorPoint: WorkbookContextMenuPoint;
  selection: WorkbookSelectionState;
}
