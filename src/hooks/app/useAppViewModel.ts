import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { TranslationFn } from '@/context/i18n';

import type {
  DiffLine,
  SearchMatch,
  SvnRevisionInfo,
  TextDiffPresentation,
  WorkbookArtifactDiff,
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookFreezeState,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSelectionState,
} from '@/types';
import { computeHunks } from '@/engine/text/diff';
import { buildTextDiffPresentation } from '@/engine/text/textChangeAlignment';
import { buildSearchPattern, findMatches, navigateSearch } from '@/engine/text/search';
import { resolveDisplayFileName, resolveVersionLabel } from '@/utils/diff/diffMeta';
import {
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from '@/utils/workbook/workbookSheetIndex';
import {
  buildWorkbookDiffRegions,
} from '@/utils/workbook/workbookDiffRegion';
import { getWorkbookSharedExpandedBlocks } from '@/utils/workbook/workbookLayoutState';
import { getWorkbookSections } from '@/utils/workbook/workbookSections';
import { getCompareContextLabels } from '@/hooks/app/helpers';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';

interface UseAppViewModelArgs {
  t: TranslationFn;
  compareContext: 'standard_local_compare' | 'literal_two_file_compare' | 'revision_vs_revision_compare';
  launchBaseName: string;
  baseName: string;
  launchMineName: string;
  mineName: string;
  fileName: string;
  baseRevisionInfo: SvnRevisionInfo | null;
  mineRevisionInfo: SvnRevisionInfo | null;
  workbookSelection: WorkbookSelectionState;
  workbookFreezeBySheet: Record<string, WorkbookFreezeState>;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  workbookArtifactDiff: WorkbookArtifactDiff | null;
  diffSourceNoticeCode: string | null;
  diffLines: DiffLine[];
  searchQ: string;
  searchRx: boolean;
  searchCs: boolean;
  isElectron: boolean;
  isDevMode: boolean;
  workbookCompareMode: WorkbookCompareMode;
  precomputedWorkbookDelta: WorkbookPrecomputedDeltaPayload | null;
  hunkIdx: number;
  activeWorkbookSheetName: string | null;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  setSearchQ: Dispatch<SetStateAction<string>>;
  setSearchRx: Dispatch<SetStateAction<boolean>>;
  setSearchCs: Dispatch<SetStateAction<boolean>>;
  setActiveSearchIdx: Dispatch<SetStateAction<number>>;
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
}

export default function useAppViewModel({
  t,
  compareContext,
  launchBaseName,
  baseName,
  launchMineName,
  mineName,
  fileName,
  baseRevisionInfo,
  mineRevisionInfo,
  workbookSelection,
  workbookFreezeBySheet,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  workbookArtifactDiff,
  diffSourceNoticeCode,
  diffLines,
  searchQ,
  searchRx,
  searchCs,
  isElectron,
  isDevMode,
  workbookCompareMode,
  precomputedWorkbookDelta,
  hunkIdx,
  activeWorkbookSheetName,
  workbookSharedExpandedBlocksRef,
  setSearchQ,
  setSearchRx,
  setSearchCs,
  setActiveSearchIdx,
  scrollToIndexRef,
}: UseAppViewModelArgs) {
  const displayBaseName = (
    compareContext === 'literal_two_file_compare'
      ? (launchBaseName || baseName || t('commonBase'))
      : (baseName || t('commonBase'))
  );
  const displayMineName = (
    compareContext === 'literal_two_file_compare'
      ? (launchMineName || mineName || t('commonMine'))
      : (mineName || t('commonMine'))
  );

  const displayFileName = useMemo(
    () => resolveDisplayFileName(fileName, baseName, mineName),
    [fileName, baseName, mineName],
  );

  const selectedCell = workbookSelection.primary;

  const baseVersionLabel = useMemo(
    () => (
      compareContext === 'literal_two_file_compare'
        ? displayBaseName
        : resolveVersionLabel(displayBaseName, baseRevisionInfo, t('commonBase'))
    ),
    [baseRevisionInfo, compareContext, displayBaseName, t],
  );
  const mineVersionLabel = useMemo(
    () => (
      compareContext === 'literal_two_file_compare'
        ? displayMineName
        : resolveVersionLabel(displayMineName, mineRevisionInfo, t('commonMine'))
    ),
    [mineRevisionInfo, compareContext, displayMineName, t],
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

  const hunks = useMemo(() => computeHunks(diffLines), [diffLines]);
  const textDiffPresentation = useMemo<TextDiffPresentation>(
    () => buildTextDiffPresentation(diffLines),
    [diffLines],
  );
  const hunkPositions = useMemo(() => hunks.map((h) => h.startIdx), [hunks]);
  const totalHunks = hunks.length;

  const searchPattern = useMemo(
    () => buildSearchPattern(searchQ, { isRegex: searchRx, isCaseSensitive: searchCs }),
    [searchQ, searchRx, searchCs],
  );
  const searchMatches = useMemo<SearchMatch[]>(
    () => findMatches(diffLines, searchPattern),
    [diffLines, searchPattern],
  );

  const workbookSections = useMemo(
    () => getWorkbookSections(diffLines, workbookCompareMode),
    [diffLines, workbookCompareMode],
  );
  const workbookSectionRowIndex = useMemo(
    () => (
      workbookCompareMode === 'strict' && precomputedWorkbookDelta
        ? buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, precomputedWorkbookDelta)
        : buildWorkbookSectionRowIndex(diffLines, workbookSections, workbookCompareMode)
    ),
    [diffLines, precomputedWorkbookDelta, workbookCompareMode, workbookSections],
  );
  const isWorkbookMode = workbookSections.length > 0;
  const workbookCellRegions = useMemo<WorkbookDiffRegion[]>(
    () => buildWorkbookDiffRegions(
      workbookSections,
      workbookSectionRowIndex,
      baseVersionLabel,
      mineVersionLabel,
      workbookCompareMode,
      baseWorkbookMetadata,
      mineWorkbookMetadata,
    ),
    [
      baseVersionLabel,
      baseWorkbookMetadata,
      mineVersionLabel,
      mineWorkbookMetadata,
      workbookCompareMode,
      workbookSectionRowIndex,
      workbookSections,
    ],
  );
  const workbookDiffRegions = useMemo<WorkbookDiffRegion[]>(
    () => workbookCellRegions,
    [workbookCellRegions],
  );
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
    return '';
  }, [isWorkbookMode]);

  const totalLines = useMemo(() => {
    let max = 0;
    diffLines.forEach((line) => {
      const lineMax = Math.max(line.baseLineNo ?? 0, line.mineLineNo ?? 0);
      if (lineMax > max) max = lineMax;
    });
    return max;
  }, [diffLines]);

  const canLaunchUninstaller = isElectron && !isDevMode && typeof window.svnDiff?.launchUninstaller === 'function';

  const handleSearch = useCallback((q: string, rx: boolean, cs: boolean) => {
    setSearchQ(q);
    setSearchRx(rx);
    setSearchCs(cs);
    setActiveSearchIdx(q ? 0 : -1);
  }, [setActiveSearchIdx, setSearchCs, setSearchQ, setSearchRx]);

  const handleSearchNav = useCallback((dir: 1 | -1) => {
    setActiveSearchIdx((index) => navigateSearch(index, searchMatches.length, dir));
  }, [searchMatches.length, setActiveSearchIdx]);

  const handleGoto = useCallback((lineNo: number) => {
    if (!scrollToIndexRef.current) return;
    const exactIdx = diffLines.findIndex((line) => line.mineLineNo === lineNo || line.baseLineNo === lineNo);
    if (exactIdx >= 0) {
      scrollToIndexRef.current(exactIdx, 'center');
      return;
    }

    const nearestIdx = diffLines.findIndex((line) => Math.max(line.baseLineNo ?? 0, line.mineLineNo ?? 0) >= lineNo);
    if (nearestIdx >= 0) {
      scrollToIndexRef.current(nearestIdx, 'center');
      return;
    }

    if (diffLines.length > 0) {
      scrollToIndexRef.current(diffLines.length - 1, 'center');
    }
  }, [diffLines, scrollToIndexRef]);

  return {
    displayBaseName,
    displayMineName,
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
    textDiffPresentation,
    hunkPositions,
    searchMatches,
    workbookSections,
    workbookSectionRowIndex,
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
    handleSearchNav,
    handleGoto,
  };
}
