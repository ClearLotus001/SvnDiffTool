import type {
  WorkbookCompareLayoutSnapshot,
  WorkbookHorizontalLayoutSnapshot,
} from '../types';
import type { CollapseExpansionState } from './collapseState';
import { cloneCollapseExpansionState } from './workbookLayoutSnapshot';

export interface WorkbookLayoutSnapshotsByMode {
  unified: WorkbookCompareLayoutSnapshot | null;
  'split-h': WorkbookHorizontalLayoutSnapshot | null;
  'split-v': WorkbookCompareLayoutSnapshot | null;
}

export function createEmptyWorkbookLayoutSnapshots(): WorkbookLayoutSnapshotsByMode {
  return {
    unified: null,
    'split-h': null,
    'split-v': null,
  };
}

export function buildWorkbookLayoutContextKey(
  sheetName: string | null,
  activeRegionId: string | null,
): string {
  return `${sheetName ?? ''}::${activeRegionId ?? ''}`;
}

function cloneSnapshotWithExpandedBlocks<
  T extends WorkbookCompareLayoutSnapshot | WorkbookHorizontalLayoutSnapshot,
>(
  snapshot: T | null,
  contextKey: string,
  expandedBlocks: CollapseExpansionState,
): T | null {
  if (!snapshot) return snapshot;
  if (buildWorkbookLayoutContextKey(snapshot.sheetName, snapshot.activeRegionId) !== contextKey) {
    return snapshot;
  }
  return {
    ...snapshot,
    expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
  };
}

export function syncWorkbookSnapshotExpandedBlocks(
  snapshots: WorkbookLayoutSnapshotsByMode,
  sheetName: string | null,
  activeRegionId: string | null,
  expandedBlocks: CollapseExpansionState,
): WorkbookLayoutSnapshotsByMode {
  const contextKey = buildWorkbookLayoutContextKey(sheetName, activeRegionId);
  return {
    unified: cloneSnapshotWithExpandedBlocks(snapshots.unified, contextKey, expandedBlocks),
    'split-v': cloneSnapshotWithExpandedBlocks(snapshots['split-v'], contextKey, expandedBlocks),
    'split-h': cloneSnapshotWithExpandedBlocks(snapshots['split-h'], contextKey, expandedBlocks),
  };
}

export function getWorkbookSharedExpandedBlocks(
  sharedExpandedBlocksByContext: Map<string, CollapseExpansionState>,
  sheetName: string | null,
  activeRegionId: string | null,
): CollapseExpansionState | null {
  const key = buildWorkbookLayoutContextKey(sheetName, activeRegionId);
  return sharedExpandedBlocksByContext.get(key) ?? null;
}

export function applyWorkbookExpandedBlocksChange(
  sharedExpandedBlocksByContext: Map<string, CollapseExpansionState>,
  snapshots: WorkbookLayoutSnapshotsByMode,
  sheetName: string | null,
  activeRegionId: string | null,
  expandedBlocks: CollapseExpansionState,
): {
  sharedExpandedBlocksByContext: Map<string, CollapseExpansionState>;
  snapshots: WorkbookLayoutSnapshotsByMode;
} {
  const nextExpandedBlocks = cloneCollapseExpansionState(expandedBlocks);
  const nextShared = new Map(sharedExpandedBlocksByContext);
  nextShared.set(
    buildWorkbookLayoutContextKey(sheetName, activeRegionId),
    nextExpandedBlocks,
  );
  return {
    sharedExpandedBlocksByContext: nextShared,
    snapshots: syncWorkbookSnapshotExpandedBlocks(
      snapshots,
      sheetName,
      activeRegionId,
      nextExpandedBlocks,
    ),
  };
}

export function applyWorkbookLayoutSnapshot(
  sharedExpandedBlocksByContext: Map<string, CollapseExpansionState>,
  snapshots: WorkbookLayoutSnapshotsByMode,
  snapshot: WorkbookCompareLayoutSnapshot | WorkbookHorizontalLayoutSnapshot,
): {
  sharedExpandedBlocksByContext: Map<string, CollapseExpansionState>;
  snapshots: WorkbookLayoutSnapshotsByMode;
} {
  const synced = applyWorkbookExpandedBlocksChange(
    sharedExpandedBlocksByContext,
    snapshots,
    snapshot.sheetName,
    snapshot.activeRegionId,
    snapshot.expandedBlocks,
  );
  return {
    sharedExpandedBlocksByContext: synced.sharedExpandedBlocksByContext,
    snapshots: {
      ...synced.snapshots,
      [snapshot.layout]: snapshot,
    },
  };
}
