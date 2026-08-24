import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TranslationFn } from '@/context/i18n';
import type { DiffLine, SearchMatch } from '@/types';
import { compileSearchPattern, getSearchableLineContent, navigateSearch } from '@/engine/text/search';
import { useAppStore } from '@/store/appStore';
import { computeSearchMatchesAsync } from '@/utils/diff/computeSearchMatchesAsync';
import { createSearchResultItemResolver } from '@/utils/diff/searchResultItems';
import { getWorkbookSearchableContentStart } from '@/utils/workbook/workbookDisplay';
import { resolveWorkbookSearchMatchTarget } from '@/utils/workbook/workbookNavigation';
import {
  buildWorkbookLineSheetContexts,
  resolveWorkbookSheetNameForLineContext,
} from '@/utils/workbook/workbookSections';

const EMPTY_SEARCH_MATCHES: SearchMatch[] = [];
const EMPTY_SEARCHABLE_LINE_PROJECTION = { lines: [] as string[], lineStartOffsets: null as number[] | null };
const SEARCH_REQUEST_DEBOUNCE_MS = 90;

export default function useAppSearchModel({
  t,
  diffLines,
  isWorkbookCandidate,
  isWorkbookMode,
  activeWorkbookSheetName,
  baseRoleTitle,
  mineRoleTitle,
}: {
  t: TranslationFn;
  diffLines: DiffLine[];
  isWorkbookCandidate: boolean;
  isWorkbookMode: boolean;
  activeWorkbookSheetName: string | null;
  baseRoleTitle: string;
  mineRoleTitle: string;
}) {
  const searchQ = useAppStore((state) => state.searchQ);
  const searchRx = useAppStore((state) => state.searchRx);
  const searchCs = useAppStore((state) => state.searchCs);
  const searchWorkbookScope = useAppStore((state) => state.searchWorkbookScope);
  const searchJumpNonce = useAppStore((state) => state.searchJumpNonce);
  const setSearchQ = useAppStore((state) => state.setSearchQ);
  const setSearchRx = useAppStore((state) => state.setSearchRx);
  const setSearchCs = useAppStore((state) => state.setSearchCs);
  const setSearchWorkbookScope = useAppStore((state) => state.setSearchWorkbookScope);
  const setActiveSearchIdx = useAppStore((state) => state.setActiveSearchIdx);
  const setSearchJumpNonce = useAppStore((state) => state.setSearchJumpNonce);
  const sequenceRef = useRef(0);
  const [allMatches, setAllMatches] = useState<SearchMatch[]>(EMPTY_SEARCH_MATCHES);
  const [matchCount, setMatchCount] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const compilation = useMemo(
    () => compileSearchPattern(searchQ, { isRegex: searchRx, isCaseSensitive: searchCs }),
    [searchCs, searchQ, searchRx],
  );
  const hasQuery = searchQ.trim().length > 0;
  const lineSheetContexts = useMemo(
    () => (compilation.pattern && isWorkbookCandidate ? buildWorkbookLineSheetContexts(diffLines) : []),
    [compilation.pattern, diffLines, isWorkbookCandidate],
  );
  const projection = useMemo(() => {
    if (!hasQuery) return EMPTY_SEARCHABLE_LINE_PROJECTION;
    const limitToSheet = isWorkbookCandidate
      && searchWorkbookScope === 'sheet'
      && Boolean(activeWorkbookSheetName)
      && lineSheetContexts.length > 0;
    const lines = diffLines.map((line, lineIndex) => {
      const inScope = !limitToSheet || resolveWorkbookSheetNameForLineContext({
        line,
        context: lineSheetContexts[lineIndex],
        preferredSheetName: activeWorkbookSheetName,
      }) === activeWorkbookSheetName;
      return inScope ? getSearchableLineContent(line) : '';
    });
    return {
      lines,
      lineStartOffsets: isWorkbookCandidate ? lines.map(getWorkbookSearchableContentStart) : null,
    };
  }, [activeWorkbookSheetName, diffLines, hasQuery, isWorkbookCandidate, lineSheetContexts, searchWorkbookScope]);

  useEffect(() => {
    const sequence = ++sequenceRef.current;
    if (!compilation.pattern || !hasQuery) {
      setAllMatches(EMPTY_SEARCH_MATCHES);
      setMatchCount(0);
      setResultsTruncated(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(false);
    const timeoutId = window.setTimeout(() => {
      if (sequence !== sequenceRef.current) return;
      setIsSearching(true);
      void computeSearchMatchesAsync(projection.lines, {
        query: searchQ,
        isRegex: searchRx,
        isCaseSensitive: searchCs,
      }, projection.lineStartOffsets).then((result) => {
        if (sequence !== sequenceRef.current) return;
        setIsSearching(false);
        setMatchCount(result.totalCount);
        setResultsTruncated(result.truncated);
        setAllMatches(!isWorkbookCandidate || lineSheetContexts.length === 0
          ? result.matches
          : result.matches.map((match) => ({
            ...match,
            workbookTarget: resolveWorkbookSearchMatchTarget(
              diffLines[match.lineIdx] ?? null,
              match,
              lineSheetContexts[match.lineIdx] ?? null,
            ),
          })));
      }).catch(() => {
        if (sequence !== sequenceRef.current) return;
        setIsSearching(false);
        setAllMatches(EMPTY_SEARCH_MATCHES);
        setMatchCount(0);
        setResultsTruncated(false);
      });
    }, SEARCH_REQUEST_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [compilation.pattern, diffLines, hasQuery, isWorkbookCandidate, lineSheetContexts, projection, searchCs, searchQ, searchRx]);

  const searchMatches = useMemo(() => (
    !isWorkbookMode || searchWorkbookScope !== 'sheet' || !activeWorkbookSheetName
      ? allMatches
      : allMatches.filter((match) => match.workbookTarget?.sheetName === activeWorkbookSheetName)
  ), [activeWorkbookSheetName, allMatches, isWorkbookMode, searchWorkbookScope]);
  const searchResultItemResolver = useMemo(() => createSearchResultItemResolver({
    diffLines,
    searchMatches,
    baseRoleTitle,
    mineRoleTitle,
    noResultsLabel: t('searchNoResults'),
  }), [baseRoleTitle, diffLines, mineRoleTitle, searchMatches, t]);

  useEffect(() => {
    setActiveSearchIdx((previous) => searchMatches.length === 0 ? -1 : Math.min(Math.max(previous, 0), searchMatches.length - 1));
  }, [searchMatches.length, setActiveSearchIdx]);

  const handleSearch = useCallback((query: string, regex: boolean, caseSensitive: boolean, scope: 'all' | 'sheet') => {
    setSearchQ(query); setSearchRx(regex); setSearchCs(caseSensitive); setSearchWorkbookScope(scope);
    setActiveSearchIdx(query ? 0 : -1); setSearchJumpNonce((value) => value + 1);
  }, [setActiveSearchIdx, setSearchCs, setSearchJumpNonce, setSearchQ, setSearchRx, setSearchWorkbookScope]);
  const handleSearchNav = useCallback((direction: 1 | -1) => {
    setActiveSearchIdx((index) => navigateSearch(index, searchMatches.length, direction));
    setSearchJumpNonce((value) => value + 1);
  }, [searchMatches.length, setActiveSearchIdx, setSearchJumpNonce]);
  const handleSearchPreviewNav = useCallback((direction: 1 | -1) => {
    setActiveSearchIdx((index) => navigateSearch(index, searchMatches.length, direction));
  }, [searchMatches.length, setActiveSearchIdx]);
  const handleSearchJump = useCallback((index: number) => {
    setActiveSearchIdx(index >= 0 && index < searchMatches.length ? index : -1);
    setSearchJumpNonce((value) => value + 1);
  }, [searchMatches.length, setActiveSearchIdx, setSearchJumpNonce]);

  return {
    searchJumpNonce,
    isSearching,
    isSearchPatternInvalid: compilation.status === 'invalid',
    searchMatches,
    searchMatchCount: matchCount,
    searchResultsTruncated: resultsTruncated,
    searchResultItemResolver,
    handleSearch,
    handleSearchNav,
    handleSearchPreviewNav,
    handleSearchJump,
  };
}
