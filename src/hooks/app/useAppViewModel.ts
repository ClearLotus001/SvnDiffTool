import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { TranslationFn } from '@/context/i18n';

import type {
  SearchMatch,
  SearchResultItem,
  TextDiffStats,
  WorkbookDiffRegion,
} from '@/types';
import { computeHunks } from '@/engine/text/diff';
import { summarizeDiffChanges } from '@/engine/text/textChangeAlignment';
import { buildSearchPattern, getSearchableLineContent, navigateSearch } from '@/engine/text/search';
import { computeSearchMatchesAsync } from '@/utils/diff/computeSearchMatchesAsync';
import { resolveDisplayFileName, resolveVersionLabel } from '@/utils/diff/diffMeta';
import {
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
  type IndexedWorkbookSectionRows,
} from '@/utils/workbook/workbookSheetIndex';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import {
  buildWorkbookDiffRegions,
  buildWorkbookNavigationRegions,
  formatWorkbookDiffRegionSummary,
} from '@/utils/workbook/workbookDiffRegion';
import { getWorkbookSharedExpandedBlocks } from '@/utils/workbook/workbookLayoutState';
import { buildWorkbookLineSheetContexts, getWorkbookColumnLabel, getWorkbookSections } from '@/utils/workbook/workbookSections';
import { resolveWorkbookSearchMatchTarget } from '@/utils/workbook/workbookNavigation';
import { getCompareContextLabels } from '@/hooks/app/helpers';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { useAppStore } from '@/store/appStore';

interface UseAppViewModelArgs {
  t: TranslationFn;
  workbookSharedExpandedBlocksRef: MutableRefObject<Map<string, CollapseExpansionState>>;
  scrollToIndexRef: MutableRefObject<((idx: number, align?: 'start' | 'center') => void) | null>;
}

const WORKBOOK_FILE_EXTENSION_RE = /\.(xlsx|xlsm|xltx|xltm|xlsb|xls)$/i;
const EMPTY_SEARCH_MATCHES: SearchMatch[] = [];
const EMPTY_SEARCHABLE_LINES: string[] = [];

function isWorkbookFileCandidate(name: string): boolean {
  return WORKBOOK_FILE_EXTENSION_RE.test(name.trim());
}

function buildSearchKey(match: SearchMatch | null | undefined): string {
  if (!match) return '';
  return [
    match.lineIdx,
    match.start,
    match.end,
    match.workbookTarget?.sheetName ?? '',
    match.workbookTarget?.side ?? '',
    match.workbookTarget?.rowNumber ?? '',
    match.workbookTarget?.colIndex ?? '',
  ].join(':');
}

function normalizeSearchPreview(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\n+/g, ' / ')
    .trim();
}

function buildSearchSnippet(content: string, start: number, end: number): string {
  if (!content) return '';
  const normalized = normalizeSearchPreview(content);
  if (normalized.length <= 96) return normalized;
  const snippetStart = Math.max(0, start - 28);
  const snippetEnd = Math.min(content.length, end + 44);
  const rawSnippet = content.slice(snippetStart, snippetEnd);
  const snippet = normalizeSearchPreview(rawSnippet);
  return `${snippetStart > 0 ? '…' : ''}${snippet}${snippetEnd < content.length ? '…' : ''}`;
}

export default function useAppViewModel({
  t,
  workbookSharedExpandedBlocksRef,
  scrollToIndexRef,
}: UseAppViewModelArgs) {
  const searchSeqRef = useRef(0);
  const [allSearchMatches, setAllSearchMatches] = useState<SearchMatch[]>(EMPTY_SEARCH_MATCHES);
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
  const precomputedWorkbookDelta = useAppStore((s) => s.precomputedWorkbookDelta);
  const hunkIdx = useAppStore((s) => s.hunkIdx);
  const activeWorkbookSheetName = useAppStore((s) => s.activeWorkbookSheetName);

  // ── Read setters directly from store ──────────────────────────────────
  const setSearchQ = useAppStore((s) => s.setSearchQ);
  const setSearchRx = useAppStore((s) => s.setSearchRx);
  const setSearchCs = useAppStore((s) => s.setSearchCs);
  const setSearchWorkbookScope = useAppStore((s) => s.setSearchWorkbookScope);
  const setActiveSearchIdx = useAppStore((s) => s.setActiveSearchIdx);
  const setSearchJumpNonce = useAppStore((s) => s.setSearchJumpNonce);

  // ── Derived state (same logic as before) ─────────────────────────────
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
  const textDiffStats = useMemo<TextDiffStats>(
    () => summarizeDiffChanges(diffLines),
    [diffLines],
  );
  const hunkPositions = useMemo(() => hunks.map((h) => h.startIdx), [hunks]);
  const totalHunks = hunks.length;

  const searchPattern = useMemo(
    () => buildSearchPattern(searchQ, { isRegex: searchRx, isCaseSensitive: searchCs }),
    [searchQ, searchRx, searchCs],
  );
  const hasSearchQuery = searchQ.trim().length > 0;
  const isWorkbookCandidate = useMemo(
    () => isWorkbookFileCandidate(fileName || baseName || mineName),
    [baseName, fileName, mineName],
  );
  const shouldBuildWorkbookLineSheetContexts = Boolean(searchPattern) && isWorkbookCandidate;
  const searchableLines = useMemo(
    () => (hasSearchQuery ? diffLines.map(getSearchableLineContent) : EMPTY_SEARCHABLE_LINES),
    [diffLines, hasSearchQuery],
  );
  const workbookLineSheetContexts = useMemo(
    () => {
      if (!shouldBuildWorkbookLineSheetContexts) return [];
      return buildWorkbookLineSheetContexts(diffLines);
    },
    [diffLines, shouldBuildWorkbookLineSheetContexts],
  );
  useEffect(() => {
    const seq = ++searchSeqRef.current;
    if (!searchPattern || !hasSearchQuery) {
      setAllSearchMatches(EMPTY_SEARCH_MATCHES);
      return;
    }

    void computeSearchMatchesAsync(searchableLines, {
      query: searchQ,
      isRegex: searchRx,
      isCaseSensitive: searchCs,
    }).then((matches) => {
      if (seq !== searchSeqRef.current) return;
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
    () => (isWorkbookCandidate ? getWorkbookSections(diffLines, workbookCompareMode) : []),
    [diffLines, isWorkbookCandidate, workbookCompareMode],
  );
  const isWorkbookMode = workbookSections.length > 0;
  const workbookSectionRowIndex = useMemo(
    () => {
      if (!isWorkbookMode) return new Map<string, IndexedWorkbookSectionRows>();
      return precomputedWorkbookDelta
        ? buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, precomputedWorkbookDelta)
        : buildWorkbookSectionRowIndex(diffLines, workbookSections, workbookCompareMode);
    },
    [diffLines, isWorkbookMode, precomputedWorkbookDelta, workbookCompareMode, workbookSections],
  );
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!isWorkbookMode || searchWorkbookScope !== 'sheet' || !activeWorkbookSheetName) {
      return allSearchMatches;
    }
    return allSearchMatches.filter((match) => match.workbookTarget?.sheetName === activeWorkbookSheetName);
  }, [activeWorkbookSheetName, allSearchMatches, isWorkbookMode, searchWorkbookScope]);
  const workbookCellRegions = useMemo<WorkbookDiffRegion[]>(
    () => {
      if (!isWorkbookMode) return [];
      return buildWorkbookDiffRegions(
        workbookSections,
        workbookSectionRowIndex,
        baseVersionLabel,
        mineVersionLabel,
        workbookCompareMode,
        baseWorkbookMetadata,
        mineWorkbookMetadata,
      );
    },
    [
      baseVersionLabel,
      baseWorkbookMetadata,
      isWorkbookMode,
      mineVersionLabel,
      mineWorkbookMetadata,
      workbookCompareMode,
      workbookSectionRowIndex,
      workbookSections,
    ],
  );
  const workbookDiffRegions = useMemo<WorkbookDiffRegion[]>(
    () => buildWorkbookNavigationRegions(workbookCellRegions, hunks),
    [hunks, workbookCellRegions],
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
    return formatWorkbookDiffRegionSummary(activeWorkbookDiffRegion);
  }, [activeWorkbookDiffRegion, isWorkbookMode]);

  const totalLines = useMemo(() => {
    let max = 0;
    diffLines.forEach((line) => {
      const lineMax = Math.max(line.baseLineNo ?? 0, line.mineLineNo ?? 0);
      if (lineMax > max) max = lineMax;
    });
    return max;
  }, [diffLines]);
  const searchResultItems = useMemo<SearchResultItem[]>(() => searchMatches.map((match, index) => {
    const line = diffLines[match.lineIdx] ?? null;
    const workbookTarget = match.workbookTarget;
    const side = workbookTarget?.side ?? null;
    const sideLabel = side === 'base'
      ? baseRoleTitle
      : side === 'mine'
        ? mineRoleTitle
        : '';
    const workbookContent = line
      ? (line.type === 'delete' ? (line.base ?? line.mine ?? '') : (line.mine ?? line.base ?? ''))
      : '';
    const parsedWorkbookLine = workbookContent ? parseWorkbookDisplayLine(workbookContent) : null;
    const address = workbookTarget?.rowNumber != null
      ? workbookTarget.colIndex != null
        ? `${getWorkbookColumnLabel(workbookTarget.colIndex)}${workbookTarget.rowNumber}`
        : String(workbookTarget.rowNumber)
      : '';
    const workbookPreview = parsedWorkbookLine?.kind === 'row' && workbookTarget?.colIndex != null
      ? normalizeSearchPreview(
        parsedWorkbookLine.cells[workbookTarget.colIndex]?.value
        || parsedWorkbookLine.cells[workbookTarget.colIndex]?.formula
        || '',
      )
      : '';
    const preview = workbookPreview || buildSearchSnippet(workbookContent || '', match.start, match.end);
    const detail = workbookTarget?.sheetName
      ? [
        workbookTarget.sheetName,
        sideLabel,
      ].filter(Boolean).join(' · ')
      : sideLabel;
    const locationLabel = workbookTarget?.sheetName
      ? [workbookTarget.sheetName, address].filter(Boolean).join('!')
      : `#${match.lineIdx + 1}`;

    return {
      index,
      lineIdx: match.lineIdx,
      workbookTarget,
      scopeKey: buildSearchKey(match),
      sheetName: workbookTarget?.sheetName ?? null,
      side,
      sideLabel,
      rowNumber: workbookTarget?.rowNumber ?? null,
      colIndex: workbookTarget?.colIndex ?? null,
      address,
      locationLabel,
      preview: preview || t('searchNoResults'),
      detail,
    };
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
  }, [diffLines, lineNoToIdx, scrollToIndexRef]);

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
    textDiffStats,
    hunkPositions,
    searchJumpNonce,
    searchMatches,
    searchResultItems,
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
    handleSearchPreviewNav,
    handleSearchNav,
    handleSearchJump,
    handleGoto,
  };
}
