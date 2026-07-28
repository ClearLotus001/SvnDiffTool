import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { TranslationFn } from '@/context/i18n';

import type {
  SearchMatch,
  TextDiffStats,
  WorkbookDiffRegion,
} from '@/types';
import { computeHunks } from '@/engine/text/diff';
import { summarizeDiffChanges } from '@/engine/text/textChangeAlignment';
import { buildSearchPattern, getSearchableLineContent, navigateSearch } from '@/engine/text/search';
import { computeSearchMatchesAsync } from '@/utils/diff/computeSearchMatchesAsync';
import {
  resolveDisplayFileName,
  resolveTwoFileVersionLabels,
  resolveVersionLabel,
} from '@/utils/diff/diffMeta';
import { prepareTextDiffAnalysisFromDiffLines } from '@/utils/diff/preparedTextAnalysis';
import { createSearchResultItemResolver } from '@/utils/diff/searchResultItems';
import {
  EMPTY_WORKBOOK_SECTION_ROW_INDEX,
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from '@/utils/workbook/workbookSheetIndex';
import {
  resolveWorkbookGotoTarget,
} from '@/utils/workbook/workbookGoto';
import {
  buildWorkbookDiffRegions,
  buildWorkbookNavigationRegions,
  formatWorkbookDiffRegionSummary,
} from '@/utils/workbook/workbookDiffRegion';
import { getWorkbookSharedExpandedBlocks } from '@/utils/workbook/workbookLayoutState';
import { buildWorkbookLineSheetContexts, getWorkbookSections } from '@/utils/workbook/workbookSections';
import { resolveWorkbookSearchMatchTarget } from '@/utils/workbook/workbookNavigation';
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

interface UseAppViewModelArgs {
  t: TranslationFn;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
  currentDiffData: import('@/types').DiffData | null;
}

const WORKBOOK_FILE_EXTENSION_RE = /\.(xlsx|xlsm|xltx|xltm|xlsb|xls)$/i;
const EMPTY_SEARCH_MATCHES: SearchMatch[] = [];
const EMPTY_SEARCHABLE_LINES: string[] = [];
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
  const searchSeqRef = useRef(0);
  const [allSearchMatches, setAllSearchMatches] = useState<SearchMatch[]>(EMPTY_SEARCH_MATCHES);
  const [isSearching, setIsSearching] = useState(false);
  // ── Read state directly from Zustand store ──────────────────────────
  const compareContext = useAppStore((s) => s.compareContext);
  const launchBaseName = useAppStore((s) => s.launchBaseName);
  const baseName = useAppStore((s) => s.baseName);
  const launchMineName = useAppStore((s) => s.launchMineName);
  const mineName = useAppStore((s) => s.mineName);
  const fileName = useAppStore((s) => s.fileName);
  const baseRevisionInfo = useAppStore((s) => s.baseRevisionInfo);
  const mineRevisionInfo = useAppStore((s) => s.mineRevisionInfo);
  const workbookSelection = useAppStore((s) => s.workbookSelection);
  const workbookFreezeBySheet = useAppStore((s) => s.workbookFreezeBySheet);
  const baseWorkbookMetadata = useAppStore((s) => s.baseWorkbookMetadata);
  const mineWorkbookMetadata = useAppStore((s) => s.mineWorkbookMetadata);
  const workbookArtifactDiff = useAppStore((s) => s.workbookArtifactDiff);
  const diffSourceNoticeCode = useAppStore((s) => s.diffSourceNoticeCode);
  const diffLines = useAppStore((s) => s.diffLines);
  const searchQ = useAppStore((s) => s.searchQ);
  const searchRx = useAppStore((s) => s.searchRx);
  const searchCs = useAppStore((s) => s.searchCs);
  const searchWorkbookScope = useAppStore((s) => s.searchWorkbookScope);
  const searchJumpNonce = useAppStore((s) => s.searchJumpNonce);
  const isElectron = useAppStore((s) => s.isElectron);
  const isDevMode = useAppStore((s) => s.isDevMode);
  const workbookCompareMode = useAppStore((s) => s.workbookCompareMode);
  const hunkIdx = useAppStore((s) => s.hunkIdx);
  const activeWorkbookSheetName = useAppStore((s) => s.activeWorkbookSheetName);
  const isWorkbookCandidate = useMemo(
    () => isWorkbookFileCandidate(fileName || baseName || mineName),
    [baseName, fileName, mineName],
  );
  const preparedTextAnalysis = useMemo(
    () => getPreparedTextAnalysisForMode(currentDiffData, workbookCompareMode)
      ?? (!isWorkbookCandidate && diffLines.length > 0 ? prepareTextDiffAnalysisFromDiffLines(diffLines) : null),
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
  const setSearchQ = useAppStore((s) => s.setSearchQ);
  const setSearchRx = useAppStore((s) => s.setSearchRx);
  const setSearchCs = useAppStore((s) => s.setSearchCs);
  const setSearchWorkbookScope = useAppStore((s) => s.setSearchWorkbookScope);
  const setActiveSearchIdx = useAppStore((s) => s.setActiveSearchIdx);
  const setSearchJumpNonce = useAppStore((s) => s.setSearchJumpNonce);
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
        ? twoFileVersionLabels.base
        : resolveVersionLabel(displayBaseName, baseRevisionInfo, t('commonBase'))
    ),
    [baseRevisionInfo, compareContext, displayBaseName, t, twoFileVersionLabels.base],
  );
  const mineVersionLabel = useMemo(
    () => (
      compareContext === 'literal_two_file_compare'
        ? twoFileVersionLabels.mine
        : resolveVersionLabel(displayMineName, mineRevisionInfo, t('commonMine'))
    ),
    [mineRevisionInfo, compareContext, displayMineName, t, twoFileVersionLabels.mine],
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

  const searchPattern = useMemo(
    () => buildSearchPattern(searchQ, { isRegex: searchRx, isCaseSensitive: searchCs }),
    [searchQ, searchRx, searchCs],
  );
  const hasSearchQuery = searchQ.trim().length > 0;
  const shouldBuildWorkbookLineSheetContexts = Boolean(searchPattern) && isWorkbookCandidate;
  const searchableLines = useMemo(
    () => (hasSearchQuery ? diffLines.map(getSearchableLineContent) : EMPTY_SEARCHABLE_LINES),
    [diffLines, hasSearchQuery],
  );
  const workbookLineSheetContexts = useMemo(
    () => (shouldBuildWorkbookLineSheetContexts ? buildWorkbookLineSheetContexts(diffLines) : []),
    [diffLines, shouldBuildWorkbookLineSheetContexts],
  );
  useEffect(() => {
    const seq = ++searchSeqRef.current;
    if (!searchPattern || !hasSearchQuery) {
      setAllSearchMatches(EMPTY_SEARCH_MATCHES);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setAllSearchMatches(EMPTY_SEARCH_MATCHES);

    void computeSearchMatchesAsync(searchableLines, {
      query: searchQ,
      isRegex: searchRx,
      isCaseSensitive: searchCs,
    }).then((matches) => {
      if (seq !== searchSeqRef.current) return;
      setIsSearching(false);
      if (!isWorkbookCandidate || workbookLineSheetContexts.length === 0) {
        setAllSearchMatches(matches);
        return;
      }
      setAllSearchMatches(matches.map((match) => ({
        ...match,
        workbookTarget: resolveWorkbookSearchMatchTarget(
          diffLines[match.lineIdx] ?? null,
          match,
          workbookLineSheetContexts[match.lineIdx] ?? null,
        ),
      })));
    }).catch(() => {
      if (seq !== searchSeqRef.current) return;
      setIsSearching(false);
      setAllSearchMatches(EMPTY_SEARCH_MATCHES);
    });
  }, [
    diffLines,
    hasSearchQuery,
    isWorkbookCandidate,
    searchCs,
    searchPattern,
    searchQ,
    searchRx,
    searchableLines,
    workbookLineSheetContexts,
  ]);

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
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!isWorkbookMode || searchWorkbookScope !== 'sheet' || !activeWorkbookSheetName) {
      return allSearchMatches;
    }
    return allSearchMatches.filter((match) => match.workbookTarget?.sheetName === activeWorkbookSheetName);
  }, [activeWorkbookSheetName, allSearchMatches, isWorkbookMode, searchWorkbookScope]);
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
  }, [activeWorkbookSection, diffLines, isWorkbookMode, workbookSections]);
  const searchResultItemResolver = useMemo(() => createSearchResultItemResolver({
    diffLines,
    searchMatches,
    baseRoleTitle,
    mineRoleTitle,
    noResultsLabel: t('searchNoResults'),
  }), [baseRoleTitle, diffLines, mineRoleTitle, searchMatches, t]);

  const canLaunchUninstaller = isElectron && !isDevMode && typeof window.svnDiff?.launchUninstaller === 'function';

  useEffect(() => {
    setActiveSearchIdx((prev) => {
      if (searchMatches.length === 0) return -1;
      if (prev < 0) return 0;
      return Math.min(prev, searchMatches.length - 1);
    });
  }, [searchMatches.length, setActiveSearchIdx]);

  const handleSearch = useCallback((q: string, rx: boolean, cs: boolean, workbookScope: 'all' | 'sheet') => {
    setSearchQ(q);
    setSearchRx(rx);
    setSearchCs(cs);
    setSearchWorkbookScope(workbookScope);
    setActiveSearchIdx(q ? 0 : -1);
    setSearchJumpNonce((value) => value + 1);
  }, [setActiveSearchIdx, setSearchCs, setSearchJumpNonce, setSearchQ, setSearchRx, setSearchWorkbookScope]);

  const handleSearchNav = useCallback((dir: 1 | -1) => {
    setActiveSearchIdx((index) => navigateSearch(index, searchMatches.length, dir));
    setSearchJumpNonce((value) => value + 1);
  }, [searchMatches.length, setActiveSearchIdx, setSearchJumpNonce]);

  const handleSearchPreviewNav = useCallback((dir: 1 | -1) => {
    setActiveSearchIdx((index) => navigateSearch(index, searchMatches.length, dir));
  }, [searchMatches.length, setActiveSearchIdx]);

  const handleSearchJump = useCallback((index: number) => {
    setActiveSearchIdx(() => (
      index >= 0 && index < searchMatches.length
        ? index
        : -1
    ));
    setSearchJumpNonce((value) => value + 1);
  }, [searchMatches.length, setActiveSearchIdx, setSearchJumpNonce]);

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
    searchMatches,
    searchResultItemResolver,
    workbookSections,
    workbookSectionRowIndex,
    modifiedWorkbookSheetNames,
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
