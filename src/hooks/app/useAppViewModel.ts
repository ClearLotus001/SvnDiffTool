import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { TranslationFn } from '@/context/i18n';

import type {
  TextDiffStats,
  WorkbookDiffRegion,
} from '@/types';
import { computeHunks } from '@/engine/text/diff';
import { summarizeDiffChanges } from '@/engine/text/textChangeAlignment';
import {
  resolveDisplayFileName,
  resolveTwoFileVersionLabels,
  resolveVersionLabel,
} from '@/utils/diff/diffMeta';
import { prepareTextDiffAnalysisFromDiffLines } from '@/utils/diff/preparedTextAnalysis';
import {
  EMPTY_WORKBOOK_SECTION_ROW_INDEX,
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from '@/utils/workbook/workbookSheetIndex';
import {
  getWorkbookSheetMaxRowNumber,
  resolveWorkbookGotoTarget,
} from '@/utils/workbook/workbookGoto';
import { buildWorkbookVisibilityModel } from '@/utils/workbook/workbookVisibilityModel';
import {
  buildWorkbookDiffRegions,
  buildWorkbookNavigationRegions,
  formatWorkbookDiffRegionSummary,
} from '@/utils/workbook/workbookDiffRegion';
import { getWorkbookSharedExpandedBlocks } from '@/utils/workbook/workbookLayoutState';
import {
  buildWorkbookLineSheetContexts,
  getWorkbookSections,
} from '@/utils/workbook/workbookSections';
import {
  applyWorkbookRegionVersionLabels,
  getCompareContextLabels,
  getPreparedTextAnalysisForMode,
  getPreparedWorkbookNavigationRegionsForMode,
  getPreparedWorkbookSectionsForMode,
  getPreparedWorkbookDeltaForMode,
} from '@/hooks/app/helpers';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { useAppStore } from '@/store/appStore';
import { createWorkbookSelectionState } from '@/utils/workbook/workbookSelectionState';
import { revealWorkbookSelection } from '@/utils/workbook/workbookManualVisibility';
import useAppSearchModel from '@/hooks/app/useAppSearchModel';

interface UseAppViewModelArgs {
  t: TranslationFn;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
  currentDiffData: import('@/types').DiffData | null;
}

const WORKBOOK_FILE_EXTENSION_RE = /\.(xlsx|xlsm|xltx|xltm|xlsb|xls)$/i;
const EMPTY_MODIFIED_WORKBOOK_SHEET_NAMES = new Set<string>();

function isWorkbookFileCandidate(name: string): boolean {
  return WORKBOOK_FILE_EXTENSION_RE.test(name.trim());
}

export default function useAppViewModel({
  t,
  workbookSharedExpandedBlocksRef,
  scrollToIndexRef,
  currentDiffData,
}: UseAppViewModelArgs) {
  // ── Read state directly from Zustand store ──────────────────────────
  const compareContext = useAppStore((s) => s.compareContext);
  const launchBaseName = useAppStore((s) => s.launchBaseName);
  const baseName = useAppStore((s) => s.baseName);
  const launchMineName = useAppStore((s) => s.launchMineName);
  const mineName = useAppStore((s) => s.mineName);
  const fileName = useAppStore((s) => s.fileName);
  const baseRevisionInfo = useAppStore((s) => s.baseRevisionInfo);
  const mineRevisionInfo = useAppStore((s) => s.mineRevisionInfo);
  const canSwitchRevisions = useAppStore((s) => s.canSwitchRevisions);
  const workbookSelection = useAppStore((s) => s.workbookSelection);
  const workbookFreezeBySheet = useAppStore((s) => s.workbookFreezeBySheet);
  const baseWorkbookMetadata = useAppStore((s) => s.baseWorkbookMetadata);
  const mineWorkbookMetadata = useAppStore((s) => s.mineWorkbookMetadata);
  const workbookArtifactDiff = useAppStore((s) => s.workbookArtifactDiff);
  const diffSourceNoticeCode = useAppStore((s) => s.diffSourceNoticeCode);
  const diffLines = useAppStore((s) => s.diffLines);
  const isElectron = useAppStore((s) => s.isElectron);
  const isDevMode = useAppStore((s) => s.isDevMode);
  const workbookCompareMode = useAppStore((s) => s.workbookCompareMode);
  const showOnlyDifferences = useAppStore((s) => s.showOnlyDifferences);
  const hunkIdx = useAppStore((s) => s.hunkIdx);
  const activeWorkbookSheetName = useAppStore((s) => s.activeWorkbookSheetName);
  const isWorkbookCandidate = useMemo(
    () => isWorkbookFileCandidate(fileName || baseName || mineName),
    [baseName, fileName, mineName],
  );
  const preparedTextAnalysis = useMemo(
    () => {
      const transported = getPreparedTextAnalysisForMode(currentDiffData, workbookCompareMode);
      if (
        transported
        && (
          transported.diffLines.length === 0
          || transported.splitRowDescriptors.length > 0
        )
      ) {
        return transported;
      }
      return !isWorkbookCandidate && diffLines.length > 0
        ? prepareTextDiffAnalysisFromDiffLines(diffLines)
        : null;
    },
    [currentDiffData, diffLines, isWorkbookCandidate, workbookCompareMode],
  );
  const preparedWorkbookSections = useMemo(
    () => getPreparedWorkbookSectionsForMode(currentDiffData, workbookCompareMode),
    [currentDiffData, workbookCompareMode],
  );
  const preparedWorkbookNavigationRegions = useMemo(
    () => getPreparedWorkbookNavigationRegionsForMode(currentDiffData, workbookCompareMode),
    [currentDiffData, workbookCompareMode],
  );
  // ── Read setters directly from store ──────────────────────────────────
  const setWorkbookSelection = useAppStore((s) => s.setWorkbookSelection);
  const setWorkbookHiddenStateBySheet = useAppStore((s) => s.setWorkbookHiddenStateBySheet);
  const setWorkbookContextMenu = useAppStore((s) => s.setWorkbookContextMenu);

  // ── Derived state (same logic as before) ─────────────────────────────
  const twoFileBasePath = compareContext === 'literal_two_file_compare'
    ? (currentDiffData?.basePath?.trim() ?? '')
    : '';
  const twoFileMinePath = compareContext === 'literal_two_file_compare'
    ? (currentDiffData?.minePath?.trim() ?? '')
    : '';
  const displayBaseName = (
    compareContext === 'literal_two_file_compare'
      ? (twoFileBasePath || launchBaseName || baseName || t('commonBase'))
      : (baseName || t('commonBase'))
  );
  const displayMineName = (
    compareContext === 'literal_two_file_compare'
      ? (twoFileMinePath || launchMineName || mineName || t('commonMine'))
      : (mineName || t('commonMine'))
  );

  const displayFileName = useMemo(
    () => resolveDisplayFileName(fileName, baseName, mineName),
    [fileName, baseName, mineName],
  );

  const selectedCell = workbookSelection.primary;

  const twoFileVersionLabels = useMemo(
    () => resolveTwoFileVersionLabels(displayBaseName, displayMineName),
    [displayBaseName, displayMineName],
  );
  const baseVersionLabel = useMemo(
    () => (
      compareContext === 'literal_two_file_compare'
        ? (canSwitchRevisions
            ? resolveVersionLabel(displayBaseName, baseRevisionInfo, twoFileVersionLabels.base)
            : twoFileVersionLabels.base)
        : resolveVersionLabel(displayBaseName, baseRevisionInfo, t('commonBase'))
    ),
    [baseRevisionInfo, canSwitchRevisions, compareContext, displayBaseName, t, twoFileVersionLabels.base],
  );
  const mineVersionLabel = useMemo(
    () => (
      compareContext === 'literal_two_file_compare'
        ? (canSwitchRevisions
            ? resolveVersionLabel(displayMineName, mineRevisionInfo, twoFileVersionLabels.mine)
            : twoFileVersionLabels.mine)
        : resolveVersionLabel(displayMineName, mineRevisionInfo, t('commonMine'))
    ),
    [mineRevisionInfo, canSwitchRevisions, compareContext, displayMineName, t, twoFileVersionLabels.mine],
  );

  const compareContextLabels = useMemo(
    () => getCompareContextLabels(compareContext),
    [compareContext],
  );
  const baseRoleTitle = t(compareContextLabels.baseTitleKey);
  const mineRoleTitle = t(compareContextLabels.mineTitleKey);
  const baseStatsTitle = t(compareContextLabels.baseStatsKey);
  const mineStatsTitle = t(compareContextLabels.mineStatsKey);

  const activeFreezeState = useMemo(
    () => (selectedCell ? (workbookFreezeBySheet[selectedCell.sheetName] ?? null) : null),
    [selectedCell, workbookFreezeBySheet],
  );
  const activeSelectionMergeRanges = useMemo(() => {
    if (!selectedCell) return [];
    const sheetName = selectedCell.sheetName;
    return selectedCell.side === 'base'
      ? (baseWorkbookMetadata?.sheets[sheetName]?.mergeRanges ?? [])
      : (mineWorkbookMetadata?.sheets[sheetName]?.mergeRanges ?? []);
  }, [baseWorkbookMetadata, mineWorkbookMetadata, selectedCell]);

  const artifactNoticeKey = useMemo(() => (
    workbookArtifactDiff?.hasArtifactOnlyDiff
      ? [
          fileName,
          baseRevisionInfo?.id ?? baseRevisionInfo?.revision ?? baseName,
          mineRevisionInfo?.id ?? mineRevisionInfo?.revision ?? mineName,
          workbookArtifactDiff.baseBytes,
          workbookArtifactDiff.mineBytes,
        ].join('::')
      : ''
  ), [
    baseName,
    baseRevisionInfo?.id,
    baseRevisionInfo?.revision,
    fileName,
    mineName,
    mineRevisionInfo?.id,
    mineRevisionInfo?.revision,
    workbookArtifactDiff,
  ]);
  const diffSourceNoticeKey = diffSourceNoticeCode ?? '';

  const hunks = useMemo(
    () => (isWorkbookCandidate ? [] : computeHunks(diffLines)),
    [diffLines, isWorkbookCandidate],
  );
  const textDiffStats = useMemo<TextDiffStats>(
    () => preparedTextAnalysis?.stats ?? summarizeDiffChanges(diffLines),
    [diffLines, preparedTextAnalysis],
  );
  const hunkPositions = useMemo(() => hunks.map((h) => h.startIdx), [hunks]);
  const totalHunks = hunks.length;

  const workbookSections = useMemo(
    () => {
      if (!isWorkbookCandidate) return [];
      return preparedWorkbookSections ?? getWorkbookSections(diffLines, workbookCompareMode);
    },
    [diffLines, isWorkbookCandidate, preparedWorkbookSections, workbookCompareMode],
  );
  const isWorkbookMode = workbookSections.length > 0;
  const activeWorkbookSection = useMemo(
    () => (
      activeWorkbookSheetName
        ? (workbookSections.find((section) => section.name === activeWorkbookSheetName) ?? null)
        : null
    ),
    [activeWorkbookSheetName, workbookSections],
  );
  const workbookSectionRowIndex = useMemo(
    () => {
      if (!isWorkbookMode) return EMPTY_WORKBOOK_SECTION_ROW_INDEX;
      const snapshotWorkbookDelta = getPreparedWorkbookDeltaForMode(currentDiffData, workbookCompareMode);
      return snapshotWorkbookDelta
        ? buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, snapshotWorkbookDelta)
        : buildWorkbookSectionRowIndex(diffLines, workbookSections, workbookCompareMode);
    },
    [currentDiffData, diffLines, isWorkbookMode, workbookCompareMode, workbookSections],
  );
  const workbookDiffRegions = useMemo<WorkbookDiffRegion[]>(
    () => {
      if (!isWorkbookMode) return [];
      if (preparedWorkbookNavigationRegions) {
        return applyWorkbookRegionVersionLabels(
          preparedWorkbookNavigationRegions,
          baseVersionLabel,
          mineVersionLabel,
        );
      }
      const workbookCellRegions = buildWorkbookDiffRegions(
        workbookSections,
        workbookSectionRowIndex,
        baseVersionLabel,
        mineVersionLabel,
        workbookCompareMode,
        baseWorkbookMetadata,
        mineWorkbookMetadata,
      );
      return buildWorkbookNavigationRegions(
        workbookCellRegions,
        hunks,
        workbookSections.map((section) => section.name),
      );
    },
    [
      baseVersionLabel,
      baseWorkbookMetadata,
      hunks,
      isWorkbookMode,
      mineVersionLabel,
      mineWorkbookMetadata,
      preparedWorkbookNavigationRegions,
      workbookCompareMode,
      workbookSectionRowIndex,
      workbookSections,
    ],
  );
  const modifiedWorkbookSheetNames = useMemo<ReadonlySet<string>>(() => {
    if (!isWorkbookMode) return EMPTY_MODIFIED_WORKBOOK_SHEET_NAMES;
    if (preparedWorkbookNavigationRegions) {
      return new Set(preparedWorkbookNavigationRegions.map((region) => region.sheetName));
    }
    return new Set(workbookDiffRegions.map((region) => region.sheetName));
  }, [
    isWorkbookMode,
    preparedWorkbookNavigationRegions,
    workbookDiffRegions,
  ]);
  const workbookVisibilityModel = useMemo(() => buildWorkbookVisibilityModel({
    showOnlyDifferences: showOnlyDifferences && isWorkbookMode,
    sections: workbookSections,
    sectionRowIndex: workbookSectionRowIndex,
    modifiedSheetNames: modifiedWorkbookSheetNames,
    compareMode: workbookCompareMode,
  }), [
    isWorkbookMode,
    modifiedWorkbookSheetNames,
    showOnlyDifferences,
    workbookCompareMode,
    workbookSectionRowIndex,
    workbookSections,
  ]);
  const {
    searchJumpNonce,
    isSearching,
    isSearchPatternInvalid,
    searchMatches,
    searchMatchCount,
    searchResultsTruncated,
    searchResultItemResolver,
    handleSearch,
    handleSearchPreviewNav,
    handleSearchNav,
    handleSearchJump,
  } = useAppSearchModel({
    t,
    diffLines,
    isWorkbookCandidate,
    isWorkbookMode,
    activeWorkbookSheetName,
    baseRoleTitle,
    mineRoleTitle,
    workbookVisibilityModel,
  });
  const activeWorkbookDiffRegion = isWorkbookMode
    ? (workbookDiffRegions[hunkIdx] ?? null)
    : null;
  const activeWorkbookSharedExpandedBlocks = getWorkbookSharedExpandedBlocks(
    workbookSharedExpandedBlocksRef.current,
    activeWorkbookSheetName,
    activeWorkbookDiffRegion?.id ?? null,
  );
  const activeWorkbookTargetCell = activeWorkbookDiffRegion?.anchorSelection ?? null;
  const activeWorkbookGuidedRange = useMemo(() => (
    activeWorkbookDiffRegion
      ? {
          startIdx: activeWorkbookDiffRegion.lineStartIdx,
          endIdx: activeWorkbookDiffRegion.lineEndIdx,
          addCount: 0,
          delCount: 0,
        }
      : null
  ), [activeWorkbookDiffRegion]);
  const navigationCount = isWorkbookMode ? workbookDiffRegions.length : totalHunks;
  const currentNavigationLabel = useMemo(() => {
    if (!isWorkbookMode) return '';
    return formatWorkbookDiffRegionSummary(activeWorkbookDiffRegion);
  }, [activeWorkbookDiffRegion, isWorkbookMode]);

  const totalLines = useMemo(() => {
    if (isWorkbookMode) {
      if (workbookVisibilityModel.policy.mode === 'differences-only' && activeWorkbookSheetName) {
        return getWorkbookSheetMaxRowNumber(
          diffLines,
          buildWorkbookLineSheetContexts(diffLines),
          activeWorkbookSheetName,
          workbookVisibilityModel.visibleLineIndexesBySheet.get(activeWorkbookSheetName),
        );
      }
      const activeSheetMaxRow = activeWorkbookSection?.rowCount ?? 0;
      if (activeSheetMaxRow > 0) return activeSheetMaxRow;

      const maxWorkbookRowCount = workbookSections.reduce(
        (max, section) => Math.max(max, section.rowCount),
        0,
      );
      if (maxWorkbookRowCount > 0) return maxWorkbookRowCount;
    }

    let max = 0;
    diffLines.forEach((line) => {
      const lineMax = Math.max(line.baseLineNo ?? 0, line.mineLineNo ?? 0);
      if (lineMax > max) max = lineMax;
    });
    return max;
  }, [activeWorkbookSection, activeWorkbookSheetName, diffLines, isWorkbookMode, workbookSections, workbookVisibilityModel]);
  const canLaunchUninstaller = isElectron && !isDevMode && typeof window.versora?.launchUninstaller === 'function';

  // Build a line-number → diff-index Map for O(1) goto lookup.
  const lineNoToIdx = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i]!;
      if (line.baseLineNo != null && !map.has(line.baseLineNo)) {
        map.set(line.baseLineNo, i);
      }
      if (line.mineLineNo != null && !map.has(line.mineLineNo)) {
        map.set(line.mineLineNo, i);
      }
    }
    return map;
  }, [diffLines]);

  const handleGoto = useCallback((lineNo: number) => {
    if (!scrollToIndexRef.current) return;

    if (isWorkbookMode && activeWorkbookSheetName) {
      const lineSheetContexts = buildWorkbookLineSheetContexts(diffLines);
      const resolvedGotoTarget = resolveWorkbookGotoTarget({
        lineNo,
        diffLines,
        lineSheetContexts,
        sheetName: activeWorkbookSheetName,
        preferredSide: selectedCell?.sheetName === activeWorkbookSheetName
          ? selectedCell.side
          : null,
        preferredColumn: selectedCell?.kind !== 'column'
          ? (selectedCell?.colIndex ?? 0)
          : selectedCell.colIndex,
        preferredColumnLabel: selectedCell?.colLabel,
        baseVersionLabel,
        mineVersionLabel,
        allowedLineIndexes: workbookVisibilityModel.policy.mode === 'differences-only'
          ? workbookVisibilityModel.visibleLineIndexesBySheet.get(activeWorkbookSheetName)
          : undefined,
      });

      if (resolvedGotoTarget) {
        setWorkbookSelection(createWorkbookSelectionState(resolvedGotoTarget.selection));
        setWorkbookHiddenStateBySheet((prev) => revealWorkbookSelection(prev, resolvedGotoTarget.selection));
        setWorkbookContextMenu(null);
        scrollToIndexRef.current(resolvedGotoTarget.lineIdx, 'center');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToIndexRef.current?.(resolvedGotoTarget.lineIdx, 'center');
          });
        });
        return;
      }
    }

    // O(1) exact match via pre-built index
    const exactIdx = lineNoToIdx.get(lineNo);
    if (exactIdx !== undefined) {
      scrollToIndexRef.current(exactIdx, 'center');
      return;
    }

    // Fallback: binary search for nearest line >= lineNo (lines are monotonic)
    let lo = 0;
    let hi = diffLines.length - 1;
    let nearestIdx = diffLines.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const midLine = diffLines[mid]!;
      const midLineNo = Math.max(midLine.baseLineNo ?? 0, midLine.mineLineNo ?? 0);
      if (midLineNo >= lineNo) {
        nearestIdx = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    if (diffLines.length > 0) {
      scrollToIndexRef.current(nearestIdx, 'center');
    }
  }, [
    activeWorkbookSheetName,
    baseVersionLabel,
    diffLines,
    isWorkbookMode,
    lineNoToIdx,
    mineVersionLabel,
    scrollToIndexRef,
    selectedCell,
    workbookVisibilityModel,
    setWorkbookContextMenu,
    setWorkbookHiddenStateBySheet,
    setWorkbookSelection,
  ]);

  return {
    displayBaseName,
    displayMineName,
    twoFileBasePath,
    twoFileMinePath,
    displayFileName,
    selectedCell,
    baseVersionLabel,
    mineVersionLabel,
    baseRoleTitle,
    mineRoleTitle,
    baseStatsTitle,
    mineStatsTitle,
    activeFreezeState,
    activeSelectionMergeRanges,
    artifactNoticeKey,
    diffSourceNoticeKey,
    hunks,
    preparedTextAnalysis,
    textDiffStats,
    hunkPositions,
    searchJumpNonce,
    isSearching,
    isSearchPatternInvalid,
    searchMatches,
    searchMatchCount,
    searchResultsTruncated,
    searchResultItemResolver,
    workbookSections,
    workbookSectionRowIndex,
    workbookVisibilityModel,
    isWorkbookMode,
    workbookDiffRegions,
    activeWorkbookDiffRegion,
    activeWorkbookSharedExpandedBlocks,
    activeWorkbookTargetCell,
    activeWorkbookGuidedRange,
    navigationCount,
    currentNavigationLabel,
    totalLines,
    canLaunchUninstaller,
    handleSearch,
    handleSearchPreviewNav,
    handleSearchNav,
    handleSearchJump,
    handleGoto,
  };
}
