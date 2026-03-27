import type {
  DiffLine,
  WorkbookContextMenuPoint,
  WorkbookFreezeState,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSelectionState,
} from '@/types';

export type WorkbookFreezeStateMap = Record<string, WorkbookFreezeState>;
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';
export type RevisionOptionsStatus = 'idle' | 'loading' | 'loaded' | 'error';

export const DIFF_RESULT_CACHE_LIMIT = 8;

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
