import { useEffect, useRef, type MutableRefObject } from 'react';

import type {
  SearchMatch,
  WorkbookDiffRegion,
  WorkbookSelectedCell,
} from '@/types';
import type { CompareMode, WorkbookStackedScrollTarget } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import type { SplitRow } from '@/types/view';
import { workbookDiffRegionContainsSelection } from '@/utils/workbook/workbookDiffRegion';
import { buildSelectionAutoScrollKey } from '@/utils/workbook/workbookPanelHelpers';
import { getWorkbookSideRowNumber } from '@/utils/workbook/workbookNavigation';

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

interface SearchScrollResult {
  didScroll: boolean;
  isExact: boolean;
}

interface UseWorkbookCompareNavigationEffectsParams {
  active: boolean;
  activeSearchMatch: SearchMatch | null;
  activeSearchTargetCell: WorkbookSelectedCell | null;
  activeWorkbookSection: WorkbookSection | undefined;
  activeHiddenRows: number[];
  activeHiddenColumns: number[];
  showHiddenColumns: boolean;
  itemsCount: number;
  searchJumpNonce: number;
  onSelectionRequest: (request: { target: WorkbookSelectedCell; reason: 'search' }) => void;
  onRevealHiddenRows: (sheetName: string, rowNumbers: number[]) => void;
  onRevealHiddenColumns: (sheetName: string, columns: number[]) => void;
  scrollToSearchTarget: (target: WorkbookSelectedCell | null, fallbackLineIdx: number) => SearchScrollResult;
  focusWorkbookCell: (cell: WorkbookSelectedCell, mode: 'focus' | 'ensure-visible') => boolean;
  activeDiffRegion: WorkbookDiffRegion | null;
  navigationTargetCell: WorkbookSelectedCell | null;
  selectedCell: WorkbookSelectedCell | null;
  activeHunkIdx: number;
  guidedPulseNonce: number;
  mode: CompareMode;
  frozenRows: SplitRow[];
  rowItemIndexBySide: {
    base: Map<number, number>;
    mine: Map<number, number>;
  };
  stackedRowScrollTargetsBySide: {
    base: Map<number, WorkbookStackedScrollTarget>;
    mine: Map<number, WorkbookStackedScrollTarget>;
  };
  scrollToFrozenRowIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  scrollToStackedTarget: (
    target: WorkbookStackedScrollTarget,
    align?: 'start' | 'center',
    behavior?: 'auto' | 'smooth' | 'smart',
  ) => boolean;
  scrollToResolvedLine: (
    lineIdx: number,
    align?: 'start' | 'center',
    behavior?: 'auto' | 'smooth' | 'smart',
  ) => boolean;
  scrollToIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  focusWorkbookDiffRegion: (region: WorkbookDiffRegion) => void;
  markProgrammaticScroll: (duration?: number) => void;
  isAutoScrollSuppressed: () => boolean;
  isUserScrollPaused: () => boolean;
  isSelectionAutoScrollLocked: (selectionKey: string, target: 'row' | 'cell') => boolean;
  lastAutoRowKeyRef: MutableRefObject<string>;
  lastAutoCellKeyRef: MutableRefObject<string>;
  lastForcedRevealHunkIdxRef: MutableRefObject<number>;
  suppressGuidedNavigationUntilRef: MutableRefObject<number>;
}

export function useWorkbookCompareNavigationEffects({
  active,
  activeSearchMatch,
  activeSearchTargetCell,
  activeWorkbookSection,
  activeHiddenRows,
  activeHiddenColumns,
  showHiddenColumns,
  itemsCount,
  searchJumpNonce,
  onSelectionRequest,
  onRevealHiddenRows,
  onRevealHiddenColumns,
  scrollToSearchTarget,
  focusWorkbookCell,
  activeDiffRegion,
  navigationTargetCell,
  selectedCell,
  activeHunkIdx,
  guidedPulseNonce,
  mode,
  frozenRows,
  rowItemIndexBySide,
  stackedRowScrollTargetsBySide,
  scrollToFrozenRowIndex,
  scrollToStackedTarget,
  scrollToResolvedLine,
  scrollToIndex,
  focusWorkbookDiffRegion,
  markProgrammaticScroll,
  isAutoScrollSuppressed,
  isUserScrollPaused,
  isSelectionAutoScrollLocked,
  lastAutoRowKeyRef,
  lastAutoCellKeyRef,
  lastForcedRevealHunkIdxRef,
  suppressGuidedNavigationUntilRef,
}: UseWorkbookCompareNavigationEffectsParams): void {
  const lastGuidedNavigationKeyRef = useRef('');
  const lastAppliedSearchKeyRef = useRef('');

  useEffect(() => {
    if (!activeSearchMatch) {
      lastAppliedSearchKeyRef.current = '';
      return;
    }
    if (!active) return;
    if (!activeWorkbookSection) return;
    if (
      activeSearchMatch.lineIdx < activeWorkbookSection.startLineIdx
      || activeSearchMatch.lineIdx > activeWorkbookSection.endLineIdx
    ) {
      return;
    }
    if (
      activeSearchMatch.workbookTarget?.sheetName
      && activeSearchMatch.workbookTarget.sheetName !== activeWorkbookSection.name
    ) {
      return;
    }

    const targetRowNumber = activeSearchMatch.workbookTarget?.rowNumber ?? null;
    if (targetRowNumber != null && activeHiddenRows.includes(targetRowNumber)) {
      onRevealHiddenRows(activeWorkbookSection.name, [targetRowNumber]);
      return;
    }

    const targetColIndex = activeSearchMatch.workbookTarget?.colIndex ?? null;
    if (
      targetColIndex != null
      && !showHiddenColumns
      && activeHiddenColumns.includes(targetColIndex)
    ) {
      onRevealHiddenColumns(activeWorkbookSection.name, [targetColIndex]);
      return;
    }

    const searchKey = [
      activeWorkbookSection.name,
      activeSearchMatch.lineIdx,
      activeSearchMatch.start,
      activeSearchMatch.end,
      activeSearchMatch.workbookTarget?.sheetName ?? '',
      activeSearchMatch.workbookTarget?.side ?? '',
      activeSearchMatch.workbookTarget?.rowNumber ?? '',
      activeSearchMatch.workbookTarget?.colIndex ?? '',
      searchJumpNonce,
    ].join(':');
    if (lastAppliedSearchKeyRef.current === searchKey) return;

    if (activeSearchTargetCell) {
      suppressGuidedNavigationUntilRef.current = getNow() + 900;
      onSelectionRequest({
        target: activeSearchTargetCell,
        reason: 'search',
      });
    }

    const scrollResult = scrollToSearchTarget(activeSearchTargetCell, activeSearchMatch.lineIdx);
    if (!scrollResult.didScroll) return;

    const didFocus = activeSearchTargetCell
      ? focusWorkbookCell(activeSearchTargetCell, 'focus')
      : true;
    if (!scrollResult.isExact || !didFocus) return;

    lastAppliedSearchKeyRef.current = searchKey;
  }, [
    active,
    activeHiddenColumns,
    activeHiddenRows,
    activeSearchMatch,
    activeSearchTargetCell,
    activeWorkbookSection,
    focusWorkbookCell,
    itemsCount,
    onRevealHiddenColumns,
    onRevealHiddenRows,
    onSelectionRequest,
    scrollToSearchTarget,
    searchJumpNonce,
    showHiddenColumns,
    suppressGuidedNavigationUntilRef,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!activeDiffRegion || !activeWorkbookSection) return;
    if (activeDiffRegion.sheetName !== activeWorkbookSection.name) return;
    if (getNow() < suppressGuidedNavigationUntilRef.current) return;
    const navigationKey = `${guidedPulseNonce}:${activeHunkIdx}:${activeDiffRegion.id}`;
    if (lastGuidedNavigationKeyRef.current === navigationKey) return;

    lastGuidedNavigationKeyRef.current = navigationKey;
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    const preferredNavigationTarget = (
      navigationTargetCell
      && navigationTargetCell.sheetName === activeWorkbookSection.name
      && navigationTargetCell.kind !== 'column'
      && navigationTargetCell.rowNumber > 0
    ) ? navigationTargetCell : null;
    const anchorPatch = activeDiffRegion.patches[0] ?? null;
    const anchorSide: 'base' | 'mine' = preferredNavigationTarget?.side
      ?? (anchorPatch?.hasBaseSide ? 'base' : 'mine');
    const anchorRowNumber = preferredNavigationTarget?.rowNumber
      ?? (anchorSide === 'base'
        ? (anchorPatch?.baseRowStart ?? anchorPatch?.baseRowEnd ?? null)
        : (anchorPatch?.mineRowStart ?? anchorPatch?.mineRowEnd ?? null));
    const stackedTarget = mode === 'stacked' && anchorRowNumber != null
      ? (stackedRowScrollTargetsBySide[anchorSide].get(anchorRowNumber) ?? null)
      : null;
    const targetRowIndex = anchorRowNumber != null
      ? (rowItemIndexBySide[anchorSide].get(anchorRowNumber) ?? -1)
      : -1;
    if (stackedTarget) {
      scrollToStackedTarget(stackedTarget, 'start', 'auto');
    } else if (targetRowIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(targetRowIndex, 'start', 'auto');
    } else {
      scrollToResolvedLine(activeDiffRegion.lineStartIdx, 'start', 'auto');
    }

    focusWorkbookDiffRegion(activeDiffRegion);
    let followUpRafId = 0;
    const rafId = requestAnimationFrame(() => {
      focusWorkbookDiffRegion(activeDiffRegion);
      followUpRafId = requestAnimationFrame(() => {
        focusWorkbookDiffRegion(activeDiffRegion);
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (followUpRafId) cancelAnimationFrame(followUpRafId);
    };
  }, [
    active,
    activeDiffRegion,
    activeHunkIdx,
    activeWorkbookSection,
    focusWorkbookDiffRegion,
    guidedPulseNonce,
    lastForcedRevealHunkIdxRef,
    markProgrammaticScroll,
    mode,
    navigationTargetCell,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    scrollToStackedTarget,
    stackedRowScrollTargetsBySide,
    suppressGuidedNavigationUntilRef,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'row')) return;
    if (!shouldForceReveal && lastAutoRowKeyRef.current === selectionKey) return;
    const frozenRowIndex = mode === 'columns'
      ? frozenRows.findIndex((row) => getWorkbookSideRowNumber(row, selectedCell.side) === selectedCell.rowNumber)
      : -1;
    if (frozenRowIndex >= 0) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      scrollToFrozenRowIndex(frozenRowIndex, 'center', 'smart');
      return;
    }
    const stackedTarget = mode === 'stacked'
      ? (stackedRowScrollTargetsBySide[selectedCell.side].get(selectedCell.rowNumber) ?? null)
      : null;
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (stackedTarget) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      scrollToStackedTarget(stackedTarget, 'center', 'smart');
    } else if (idx >= 0) {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll(360);
      scrollToIndex(idx, 'center', 'smart');
    }
  }, [
    active,
    activeDiffRegion,
    activeHunkIdx,
    activeWorkbookSection,
    frozenRows,
    isAutoScrollSuppressed,
    isSelectionAutoScrollLocked,
    isUserScrollPaused,
    lastAutoRowKeyRef,
    lastForcedRevealHunkIdxRef,
    markProgrammaticScroll,
    mode,
    navigationTargetCell,
    rowItemIndexBySide,
    scrollToFrozenRowIndex,
    scrollToIndex,
    scrollToStackedTarget,
    selectedCell,
    stackedRowScrollTargetsBySide,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    const shouldForceReveal = activeHunkIdx !== lastForcedRevealHunkIdxRef.current;
    if (!shouldForceReveal && isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (!shouldForceReveal && isSelectionAutoScrollLocked(selectionKey, 'cell')) return;
    if (!shouldForceReveal && lastAutoCellKeyRef.current === selectionKey) return;

    const rafId = requestAnimationFrame(() => {
      if (shouldForceReveal) lastForcedRevealHunkIdxRef.current = activeHunkIdx;
      lastAutoCellKeyRef.current = selectionKey;
      focusWorkbookCell(selectedCell, 'ensure-visible');
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeDiffRegion,
    activeHunkIdx,
    activeWorkbookSection,
    focusWorkbookCell,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    isSelectionAutoScrollLocked,
    lastAutoCellKeyRef,
    lastForcedRevealHunkIdxRef,
    navigationTargetCell,
    selectedCell,
  ]);
}
