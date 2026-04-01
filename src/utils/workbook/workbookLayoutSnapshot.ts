import type {
  WorkbookCompareLayoutSnapshot,
  WorkbookHorizontalLayoutSnapshot,
  WorkbookLayoutSnapshot,
} from '@/types';
import {
  EMPTY_COLLAPSE_EXPANSION_STATE,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';

export function cloneCollapseExpansionState(
  state: CollapseExpansionState,
): CollapseExpansionState {
  const entries = Object.entries(state);
  if (entries.length === 0) return EMPTY_COLLAPSE_EXPANSION_STATE;

  return Object.fromEntries(
    entries.map(([blockId, ranges]) => [
      blockId,
      ranges.map((range) => ({ ...range })),
    ]),
  );
}

export function shouldRestoreWorkbookLayoutSnapshot(
  snapshot: WorkbookLayoutSnapshot | null | undefined,
  activeRegionId: string | null,
  sheetName: string | null,
): boolean {
  if (!snapshot) return false;
  return snapshot.activeRegionId === activeRegionId
    && snapshot.sheetName === sheetName;
}

export function resolveWorkbookExpandedBlocksForContext(
  snapshot: WorkbookLayoutSnapshot | null | undefined,
  sharedExpandedBlocks: CollapseExpansionState | null | undefined,
  activeRegionId: string | null,
  sheetName: string | null,
): CollapseExpansionState {
  if (sharedExpandedBlocks) return sharedExpandedBlocks;
  if (shouldRestoreWorkbookLayoutSnapshot(snapshot, activeRegionId, sheetName)) {
    return snapshot?.expandedBlocks ?? EMPTY_COLLAPSE_EXPANSION_STATE;
  }
  return EMPTY_COLLAPSE_EXPANSION_STATE;
}

export function buildWorkbookCompareLayoutSnapshot(
  layout: WorkbookCompareLayoutSnapshot['layout'],
  sheetName: string | null,
  activeRegionId: string | null,
  scrollTop: number,
  scrollLeft: number,
  expandedBlocks: CollapseExpansionState,
): WorkbookCompareLayoutSnapshot {
  return {
    layout,
    sheetName,
    activeRegionId,
    scrollTop,
    scrollLeft,
    expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
  };
}

export function buildWorkbookHorizontalLayoutSnapshot(
  sheetName: string | null,
  activeRegionId: string | null,
  leftScrollTop: number,
  leftScrollLeft: number,
  rightScrollTop: number,
  rightScrollLeft: number,
  expandedBlocks: CollapseExpansionState,
): WorkbookHorizontalLayoutSnapshot {
  return {
    layout: 'split-h',
    sheetName,
    activeRegionId,
    leftScrollTop,
    leftScrollLeft,
    rightScrollTop,
    rightScrollLeft,
    expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
  };
}
