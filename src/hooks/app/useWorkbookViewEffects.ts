import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type {
  DiffLine,
  Hunk,
  SearchMatch,
  WorkbookDiffRegion,
  WorkbookSelectedCell,
} from '@/types';
import { workbookDiffRegionContainsSelection } from '@/utils/workbook/workbookDiffRegion';
import { revealWorkbookSelection } from '@/utils/workbook/workbookManualVisibility';
import { createWorkbookSelectionState } from '@/utils/workbook/workbookSelectionState';
import { findWorkbookSectionIndex, type WorkbookSection } from '@/utils/workbook/workbookSections';
import type { WorkbookUiController } from '@/hooks/app/contracts';

interface UseWorkbookViewEffectsArgs {
  navigationCount: number;
  setHunkIdx: Dispatch<SetStateAction<number>>;
  workbookSections: WorkbookSection[];
  workbookUi: WorkbookUiController;
  isWorkbookMode: boolean;
  selectedCell: WorkbookSelectedCell | null;
  activeSearchIdx: number;
  searchMatches: SearchMatch[];
  activeWorkbookDiffRegion: WorkbookDiffRegion | null;
  hunkPositions: number[];
  hunkIdx: number;
  hasLoadedDiff: boolean;
  setGuidedPulseNonce: Dispatch<SetStateAction<number>>;
  activeWorkbookTargetCell: WorkbookSelectedCell | null;
  hunks: Hunk[];
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
  diffLines: DiffLine[];
}

export default function useWorkbookViewEffects({
  navigationCount,
  setHunkIdx,
  workbookSections,
  workbookUi,
  isWorkbookMode,
  selectedCell,
  activeSearchIdx,
  searchMatches,
  activeWorkbookDiffRegion,
  hunkPositions,
  hunkIdx,
  hasLoadedDiff,
  setGuidedPulseNonce,
  activeWorkbookTargetCell,
  hunks,
  scrollToIndexRef,
  diffLines,
}: UseWorkbookViewEffectsArgs) {
  const {
    actions: {
      setActiveSheetName: setActiveWorkbookSheetName,
      setSelection: setWorkbookSelection,
      setHiddenStateBySheet: setWorkbookHiddenStateBySheet,
      setContextMenu: setWorkbookContextMenu,
    },
  } = workbookUi;

  useEffect(() => {
    setHunkIdx((prev) => {
      if (navigationCount <= 0) return 0;
      return Math.min(prev, navigationCount - 1);
    });
  }, [navigationCount, setHunkIdx]);

  useEffect(() => {
    if (workbookSections.length === 0) {
      setActiveWorkbookSheetName(null);
      return;
    }

    setActiveWorkbookSheetName((prev) => {
      if (prev && workbookSections.some((section) => section.name === prev)) {
        return prev;
      }
      return workbookSections[0]?.name ?? null;
    });
  }, [setActiveWorkbookSheetName, workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode || !selectedCell?.sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === selectedCell.sheetName ? prev : selectedCell.sheetName));
  }, [isWorkbookMode, selectedCell?.sheetName, setActiveWorkbookSheetName]);

  useEffect(() => {
    if (!isWorkbookMode || activeSearchIdx < 0) return;
    const lineIdx = searchMatches[activeSearchIdx]?.lineIdx;
    if (lineIdx == null) return;
    const sheetName = workbookSections[findWorkbookSectionIndex(workbookSections, lineIdx)]?.name;
    if (!sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === sheetName ? prev : sheetName));
  }, [activeSearchIdx, isWorkbookMode, searchMatches, setActiveWorkbookSheetName, workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode) return;
    const sheetName = activeWorkbookDiffRegion?.sheetName
      ?? (() => {
        const targetLineIdx = hunkPositions[hunkIdx];
        if (targetLineIdx == null) return null;
        return workbookSections[findWorkbookSectionIndex(workbookSections, targetLineIdx)]?.name ?? null;
      })();
    if (!sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === sheetName ? prev : sheetName));
  }, [
    activeWorkbookDiffRegion?.sheetName,
    hunkIdx,
    hunkPositions,
    isWorkbookMode,
    setActiveWorkbookSheetName,
    workbookSections,
  ]);

  useEffect(() => {
    if (!hasLoadedDiff) return;
    setGuidedPulseNonce((value) => value + 1);
  }, [activeWorkbookDiffRegion?.id, hasLoadedDiff, hunkIdx, isWorkbookMode, setGuidedPulseNonce]);

  useEffect(() => {
    if (isWorkbookMode) {
      if (activeWorkbookDiffRegion) {
        setWorkbookSelection((prev) => {
          if (workbookDiffRegionContainsSelection(activeWorkbookDiffRegion, prev.primary)) {
            return prev;
          }
          return prev.primary ? createWorkbookSelectionState(null) : prev;
        });
      }

      const targetCell = activeWorkbookTargetCell;
      if (targetCell) {
        setActiveWorkbookSheetName((prev) => (prev === targetCell.sheetName ? prev : targetCell.sheetName));
        setWorkbookHiddenStateBySheet((prev) => revealWorkbookSelection(prev, targetCell));
        setWorkbookContextMenu(null);
      }
      return;
    }

    let raf2 = 0;
    const targetHunk = hunks[hunkIdx];
    if (!targetHunk) return;
    const targetLineIdx = targetHunk.startIdx;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        scrollToIndexRef.current?.(targetLineIdx, 'center');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [
    activeWorkbookDiffRegion,
    activeWorkbookTargetCell,
    hunkIdx,
    hunks,
    isWorkbookMode,
    scrollToIndexRef,
    setActiveWorkbookSheetName,
    setWorkbookContextMenu,
    setWorkbookHiddenStateBySheet,
    setWorkbookSelection,
  ]);

  useEffect(() => {
    setWorkbookSelection(createWorkbookSelectionState(null));
    setWorkbookContextMenu(null);
  }, [diffLines, setWorkbookContextMenu, setWorkbookSelection]);
}
