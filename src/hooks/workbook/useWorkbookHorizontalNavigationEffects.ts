import { useEffect, useRef, type MutableRefObject } from 'react';

import type {
  SearchMatch,
  WorkbookDiffRegion,
  WorkbookSelectedCell,
} from '@/types';
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

interface UseWorkbookHorizontalNavigationEffectsParams {
  active: boolean;
  activeSearchMatch: SearchMatch | null;
  activeSearchTargetCell: WorkbookSelectedCell | null;
  activeWorkbookSection: WorkbookSection | undefined;
  activeHiddenRows: number[];
  activeHiddenColumns: number[];
  showHiddenColumns: boolean;
  searchJumpNonce: number;
  onSelectionRequest: (request: { target: WorkbookSelectedCell; reason: 'search' }) => void;
  onRevealHiddenRows: (sheetName: string, rowNumbers: number[]) => void;
  onRevealHiddenColumns: (sheetName: string, columns: number[]) => void;
  scrollToSearchTarget: (target: WorkbookSelectedCell | null, fallbackLineIdx: number) => SearchScrollResult;
  focusWorkbookCell: (cell: WorkbookSelectedCell, mode: 'focus' | 'ensure-visible') => boolean;
  activeDiffRegion: WorkbookDiffRegion | null;
  navigationTargetCell: WorkbookSelectedCell | null;
  selectedCell: WorkbookSelectedCell | null;
  frozenRows: SplitRow[];
  rowItemIndexBySide: {
    base: Map<number, number>;
    mine: Map<number, number>;
  };
  scrollFrozenRowsToIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  scrollToResolvedLine: (
    lineIdx: number,
    align?: 'start' | 'center',
    behavior?: 'auto' | 'smooth' | 'smart',
  ) => boolean;
  scrollToIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  syncScrollPosition: (source: 'left' | 'right') => void;
  syncFrozenRowsPaneScrollPosition: (source: 'left' | 'right') => void;
  focusWorkbookDiffRegion: (region: WorkbookDiffRegion) => void;
  markProgrammaticScroll: (side: 'left' | 'right', duration?: number) => void;
  isAutoScrollSuppressed: () => boolean;
  isUserScrollPaused: () => boolean;
  lastAutoRowKeyRef: MutableRefObject<string>;
  lastAutoCellKeyRef: MutableRefObject<string>;
  suppressGuidedNavigationUntilRef: MutableRefObject<number>;
}

export function useWorkbookHorizontalNavigationEffects({
  active,
  activeSearchMatch,
  activeSearchTargetCell,
  activeWorkbookSection,
  activeHiddenRows,
  activeHiddenColumns,
  showHiddenColumns,
  searchJumpNonce,
  onSelectionRequest,
  onRevealHiddenRows,
  onRevealHiddenColumns,
  scrollToSearchTarget,
  focusWorkbookCell,
  activeDiffRegion,
  navigationTargetCell,
  selectedCell,
  frozenRows,
  rowItemIndexBySide,
  scrollFrozenRowsToIndex,
  scrollToResolvedLine,
  scrollToIndex,
  syncScrollPosition,
  syncFrozenRowsPaneScrollPosition,
  focusWorkbookDiffRegion,
  markProgrammaticScroll,
  isAutoScrollSuppressed,
  isUserScrollPaused,
  lastAutoRowKeyRef,
  lastAutoCellKeyRef,
  suppressGuidedNavigationUntilRef,
}: UseWorkbookHorizontalNavigationEffectsParams): void {
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
    onRevealHiddenColumns,
    onRevealHiddenRows,
    onSelectionRequest,
    scrollToSearchTarget,
    searchJumpNonce,
    showHiddenColumns,
    suppressGuidedNavigationUntilRef,
  ]);

  useEffect(() => {
    lastGuidedNavigationKeyRef.current = '';
  }, [activeDiffRegion?.id, activeWorkbookSection?.name]);

  useEffect(() => {
    if (!active) return;
    if (!activeDiffRegion || !activeWorkbookSection) return;
    if (activeDiffRegion.sheetName !== activeWorkbookSection.name) return;
    if (getNow() < suppressGuidedNavigationUntilRef.current) return;
    const navigationKey = activeDiffRegion.id;
    if (lastGuidedNavigationKeyRef.current === navigationKey) return;

    lastGuidedNavigationKeyRef.current = navigationKey;
    const anchorPatch = activeDiffRegion.patches[0] ?? null;
    const anchorSide: 'base' | 'mine' = anchorPatch?.hasBaseSide ? 'base' : 'mine';
    const anchorRowNumber = anchorSide === 'base'
      ? (anchorPatch?.baseRowStart ?? anchorPatch?.baseRowEnd ?? null)
      : (anchorPatch?.mineRowStart ?? anchorPatch?.mineRowEnd ?? null);
    const targetRowIndex = anchorRowNumber != null
      ? (rowItemIndexBySide[anchorSide].get(anchorRowNumber) ?? -1)
      : -1;
    if (targetRowIndex >= 0) {
      markProgrammaticScroll('left', 420);
      scrollToIndex(targetRowIndex, 'start', 'auto');
      requestAnimationFrame(() => syncScrollPosition('left'));
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
    activeWorkbookSection,
    focusWorkbookDiffRegion,
    markProgrammaticScroll,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    syncScrollPosition,
    suppressGuidedNavigationUntilRef,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'column') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoRowKeyRef.current === selectionKey) return;
    const frozenRowIndex = frozenRows.findIndex((row) => getWorkbookSideRowNumber(row, selectedCell.side) === selectedCell.rowNumber);
    if (frozenRowIndex >= 0) {
      lastAutoRowKeyRef.current = selectionKey;
      scrollFrozenRowsToIndex(frozenRowIndex, 'center', 'smart');
      requestAnimationFrame(() => syncFrozenRowsPaneScrollPosition('left'));
      return;
    }
    const idx = rowItemIndexBySide[selectedCell.side].get(selectedCell.rowNumber) ?? -1;
    if (idx >= 0) {
      lastAutoRowKeyRef.current = selectionKey;
      markProgrammaticScroll('left', 360);
      scrollToIndex(idx, 'center', 'smart');
      requestAnimationFrame(() => syncScrollPosition('left'));
    }
  }, [
    active,
    activeDiffRegion,
    activeWorkbookSection,
    frozenRows,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    lastAutoRowKeyRef,
    markProgrammaticScroll,
    navigationTargetCell,
    rowItemIndexBySide,
    scrollFrozenRowsToIndex,
    scrollToIndex,
    selectedCell,
    syncFrozenRowsPaneScrollPosition,
    syncScrollPosition,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!selectedCell || !activeWorkbookSection || selectedCell.sheetName !== activeWorkbookSection.name) return;
    if (selectedCell.kind === 'row') return;
    if (navigationTargetCell && activeDiffRegion && !workbookDiffRegionContainsSelection(activeDiffRegion, selectedCell)) return;
    if (isAutoScrollSuppressed()) return;
    if (isUserScrollPaused()) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (lastAutoCellKeyRef.current === selectionKey) return;

    const rafId = requestAnimationFrame(() => {
      lastAutoCellKeyRef.current = selectionKey;
      focusWorkbookCell(selectedCell, 'ensure-visible');
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    activeDiffRegion,
    activeWorkbookSection,
    focusWorkbookCell,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    lastAutoCellKeyRef,
    navigationTargetCell,
    selectedCell,
  ]);
}
