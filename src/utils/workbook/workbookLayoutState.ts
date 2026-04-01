import type {
  WorkbookCompareLayoutSnapshot,
  WorkbookHorizontalLayoutSnapshot,
} from '@/types';
import {
  EMPTY_COLLAPSE_EXPANSION_STATE,
  areCollapseExpansionStatesEqual,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';
import { cloneCollapseExpansionState } from '@/utils/workbook/workbookLayoutSnapshot';

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

function buildWorkbookLayoutContextKey(
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
  if (areCollapseExpansionStatesEqual(snapshot.expandedBlocks, expandedBlocks)) {
    return snapshot;
  }
  return {
    ...snapshot,
    expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
  };
}

function syncWorkbookSnapshotExpandedBlocks(
  snapshots: WorkbookLayoutSnapshotsByMode,
  sheetName: string | null,
  activeRegionId: string | null,
  expandedBlocks: CollapseExpansionState,
): WorkbookLayoutSnapshotsByMode {
  const contextKey = buildWorkbookLayoutContextKey(sheetName, activeRegionId);
  const unified = cloneSnapshotWithExpandedBlocks(snapshots.unified, contextKey, expandedBlocks);
  const splitV = cloneSnapshotWithExpandedBlocks(snapshots['split-v'], contextKey, expandedBlocks);
  const splitH = cloneSnapshotWithExpandedBlocks(snapshots['split-h'], contextKey, expandedBlocks);

  if (
    unified === snapshots.unified
    && splitV === snapshots['split-v']
    && splitH === snapshots['split-h']
  ) {
    return snapshots;
  }

  return {
    unified,
    'split-v': splitV,
    'split-h': splitH,
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
  const contextKey = buildWorkbookLayoutContextKey(sheetName, activeRegionId);
  const previousExpandedBlocks = sharedExpandedBlocksByContext.get(contextKey) ?? EMPTY_COLLAPSE_EXPANSION_STATE;
  const nextShared = areCollapseExpansionStatesEqual(previousExpandedBlocks, nextExpandedBlocks)
    ? sharedExpandedBlocksByContext
    : new Map(sharedExpandedBlocksByContext).set(contextKey, nextExpandedBlocks);

  const nextSnapshots = syncWorkbookSnapshotExpandedBlocks(
    snapshots,
    sheetName,
    activeRegionId,
    nextExpandedBlocks,
  );

  return {
    sharedExpandedBlocksByContext: nextShared,
    snapshots: nextSnapshots,
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
