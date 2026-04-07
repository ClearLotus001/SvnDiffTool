import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type {
  DiffData,
  LayoutMode,
  SearchMatch,
  TextLineSelectionSummary,
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookPrecomputedDeltaPayload,
} from '@/types';
import type { LoadPhase } from '@/hooks/app/types';
import { debugLog } from '@/hooks/app/helpers';
import { buildE2EDiffData, shouldEnableE2EBridge } from '@/utils/app/e2eBridge';
import { parseWorkbookRowLine } from '@/utils/workbook/workbookCompare';
import type { IndexedWorkbookSectionRows } from '@/utils/workbook/workbookSheetIndex';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import {
  setWorkbookDebugEnabled,
  workbookDebugLog,
} from '@/utils/workbook/workbookDebug';

interface UseAppRuntimeEffectsArgs {
  applyDiffData: (data: DiffData) => Promise<void>;
  displayFileName: string;
  hasLoadedDiff: boolean;
  isDevMode: boolean;
  isElectron: boolean;
  isLoadingDiff: boolean;
  isWorkbookMode: boolean;
  layout: LayoutMode;
  loadPhase: LoadPhase;
  setCollapseCtx: Dispatch<SetStateAction<boolean>>;
  setLayout: Dispatch<SetStateAction<LayoutMode>>;
  activeSearchIdx: number;
  searchJumpNonce: number;
  searchMatches: SearchMatch[];
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
  setTextLineSelectionSummary: Dispatch<SetStateAction<TextLineSelectionSummary | null>>;
  activeWorkbookDiffRegion: WorkbookDiffRegion | null;
  activeWorkbookSheetName: string | null;
  precomputedWorkbookDelta: WorkbookPrecomputedDeltaPayload | null;
  workbookCompareMode: WorkbookCompareMode;
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>;
  workbookSections: WorkbookSection[];
}

export default function useAppRuntimeEffects({
  applyDiffData,
  displayFileName,
  hasLoadedDiff,
  isDevMode,
  isElectron,
  isLoadingDiff,
  isWorkbookMode,
  layout,
  loadPhase,
  setCollapseCtx,
  setLayout,
  activeSearchIdx,
  searchJumpNonce,
  searchMatches,
  scrollToIndexRef,
  setTextLineSelectionSummary,
  activeWorkbookDiffRegion,
  activeWorkbookSheetName,
  precomputedWorkbookDelta,
  workbookCompareMode,
  workbookSectionRowIndex,
  workbookSections,
}: UseAppRuntimeEffectsArgs) {
  useEffect(() => {
    if (isWorkbookMode || !hasLoadedDiff) {
      setTextLineSelectionSummary(null);
    }
  }, [hasLoadedDiff, isWorkbookMode, setTextLineSelectionSummary]);

  useEffect(() => {
    debugLog('app-load-state', {
      loadPhase,
      hasLoadedDiff,
      isLoadingDiff,
      isElectron,
      isWorkbookMode,
      fileName: displayFileName,
    });
  }, [displayFileName, hasLoadedDiff, isElectron, isLoadingDiff, isWorkbookMode, loadPhase]);

  useEffect(() => {
    if (!shouldEnableE2EBridge()) return undefined;

    window.__SVN_DIFF_E2E__ = {
      loadTextDiff: async (payload) => {
        if (payload.layout) setLayout(payload.layout);
        if (typeof payload.collapseCtx === 'boolean') setCollapseCtx(payload.collapseCtx);
        await applyDiffData(buildE2EDiffData(payload));
      },
      getSnapshot: () => ({
        hasLoadedDiff,
        layout,
        isWorkbookMode,
        fileName: displayFileName,
      }),
    };

    return () => {
      delete window.__SVN_DIFF_E2E__;
    };
  }, [applyDiffData, displayFileName, hasLoadedDiff, isWorkbookMode, layout, setCollapseCtx, setLayout]);

  useEffect(() => {
    if (isWorkbookMode) return;
    if (activeSearchIdx < 0) return;
    const activeSearchMatch = searchMatches[activeSearchIdx] ?? null;
    if (!activeSearchMatch) return;

    const rafId = requestAnimationFrame(() => {
      scrollToIndexRef.current?.(activeSearchMatch.lineIdx, 'center');
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeSearchIdx, isWorkbookMode, scrollToIndexRef, searchJumpNonce, searchMatches]);

  useEffect(() => {
    setWorkbookDebugEnabled(isDevMode);
  }, [isDevMode]);

  useEffect(() => {
    if (!isDevMode || !isWorkbookMode) return;
    const activeSheetName = activeWorkbookSheetName ?? workbookSections[0]?.name ?? null;
    if (!activeSheetName) return;

    const activeSectionRows = workbookSectionRowIndex.get(activeSheetName)?.rows ?? [];
    const activePayloadSection = precomputedWorkbookDelta?.sections.find(
      (section) => section.name === activeSheetName,
    ) ?? null;

    workbookDebugLog('app/workbook-sheet-state', {
      activeSheetName,
      compareMode: workbookCompareMode,
      sectionCount: workbookSections.length,
      payloadSectionCount: precomputedWorkbookDelta?.sections.length ?? 0,
      activePayloadRowCount: activePayloadSection?.rows.length ?? 0,
      activeSectionRowCount: activeSectionRows.length,
      activeSectionPreview: activeSectionRows.slice(0, 8).map((row) => ({
        lineIdx: row.lineIdx,
        lineIdxs: row.lineIdxs,
        leftRowNumber: parseWorkbookRowLine(row.left)?.rowNumber ?? null,
        rightRowNumber: parseWorkbookRowLine(row.right)?.rowNumber ?? null,
        leftColumnCount: parseWorkbookRowLine(row.left)?.cells.length ?? 0,
        rightColumnCount: parseWorkbookRowLine(row.right)?.cells.length ?? 0,
        changedColumns: row.workbookRowDelta?.changedColumns ?? [],
      })),
      workbookSections: workbookSections.map((section) => ({
        name: section.name,
        changeType: section.changeType,
        startLineIdx: section.startLineIdx,
        endLineIdx: section.endLineIdx,
        maxColumns: section.maxColumns,
      })),
      activeDiffRegion: activeWorkbookDiffRegion
        ? {
            id: activeWorkbookDiffRegion.id,
            sheetName: activeWorkbookDiffRegion.sheetName,
            startRowIndex: activeWorkbookDiffRegion.startRowIndex,
            endRowIndex: activeWorkbookDiffRegion.endRowIndex,
            startCol: activeWorkbookDiffRegion.startCol,
            endCol: activeWorkbookDiffRegion.endCol,
          }
        : null,
    });
  }, [
    activeWorkbookDiffRegion,
    activeWorkbookSheetName,
    isDevMode,
    isWorkbookMode,
    precomputedWorkbookDelta,
    workbookCompareMode,
    workbookSectionRowIndex,
    workbookSections,
  ]);
}
