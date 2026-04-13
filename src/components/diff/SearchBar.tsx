// src/components/SearchBar.tsx
import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, ListFilter, Loader2 } from 'lucide-react';
import type { SearchResultItem } from '@/types';
import { useI18n } from '@/context/i18n';
import Tooltip from '@/components/shared/Tooltip';
import SearchResultsPopover from '@/components/diff/SearchResultsPopover';

const SEARCH_LOADING_INDICATOR_DELAY_MS = 180;

interface SearchBarProps {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWorkbookMode: boolean;
  workbookSearchScope: 'all' | 'sheet';
  activeSheetName: string | null;
  matchCount: number;
  activeIdx: number;
  isSearching: boolean;
  resolveResult: (index: number) => SearchResultItem | null;
  onSearch: (q: string, regex: boolean, cs: boolean, workbookScope: 'all' | 'sheet') => void;
  onPreviewNav: (dir: 1 | -1) => void;
  onNav: (dir: 1 | -1) => void;
  onJump: (index: number) => void;
  onClose: () => void;
}

const SearchBar = memo(({
  query,
  isRegex,
  isCaseSensitive,
  isWorkbookMode,
  workbookSearchScope,
  activeSheetName,
  matchCount,
  activeIdx,
  isSearching,
  resolveResult,
  onSearch,
  onPreviewNav,
  onNav,
  onJump,
  onClose,
}: SearchBarProps) => {
  const { t } = useI18n();
  const [showResults, setShowResults] = useState(false);
  const [showSearchLoadingIndicator, setShowSearchLoadingIndicator] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const collapsedResultsKeyRef = useRef<string | null>(null);
  const manuallyOpenedResultsKeyRef = useRef<string | null>(null);
  const hasQuery = query.trim().length > 0;
  const resolvedScope = isWorkbookMode ? workbookSearchScope : 'all';
  const searchPlaceholderKey = isWorkbookMode
    ? (resolvedScope === 'sheet' ? 'searchPlaceholderWorkbookCurrentSheet' : 'searchPlaceholderWorkbookAllSheets')
    : 'searchPlaceholderText';
  const resultsVisibilityKey = `${query}::${isRegex ? '1' : '0'}::${isCaseSensitive ? '1' : '0'}::${resolvedScope}`;
  const closeResults = useCallback(() => {
    collapsedResultsKeyRef.current = resultsVisibilityKey;
    manuallyOpenedResultsKeyRef.current = null;
    setShowResults(false);
  }, [resultsVisibilityKey]);
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);
  const jumpRelative = useCallback((dir: 1 | -1) => {
    if (!hasQuery) return;
    collapsedResultsKeyRef.current = null;
    manuallyOpenedResultsKeyRef.current = resultsVisibilityKey;
    setShowResults(true);
    onPreviewNav(dir);
  }, [hasQuery, onPreviewNav, resultsVisibilityKey]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!hasQuery || !isSearching) {
      setShowSearchLoadingIndicator(false);
      return;
    }

    setShowSearchLoadingIndicator(false);
    const timeoutId = window.setTimeout(() => {
      setShowSearchLoadingIndicator(true);
    }, SEARCH_LOADING_INDICATOR_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [hasQuery, isSearching, resultsVisibilityKey]);
  useEffect(() => {
    setPopoverPosition(null);
  }, [resultsVisibilityKey]);
  useEffect(() => {
    if (!showResults || popoverPosition) return;
    const rect = anchorRef.current?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPopoverPosition({
      left: rect.left,
      top: rect.bottom + 10,
    });
  }, [popoverPosition, showResults]);
  useEffect(() => {
    if (!hasQuery) {
      collapsedResultsKeyRef.current = null;
      manuallyOpenedResultsKeyRef.current = null;
      setShowResults(false);
      return;
    }
    if (manuallyOpenedResultsKeyRef.current === resultsVisibilityKey) {
      setShowResults(true);
      return;
    }
    if (collapsedResultsKeyRef.current === resultsVisibilityKey) {
      setShowResults(false);
      return;
    }
    setShowResults(true);
  }, [hasQuery, resultsVisibilityKey]);
  useEffect(() => {
    if (!showResults) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closeResults();
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [closeResults, showResults]);

  const searchSummary = hasQuery
    ? (
      showSearchLoadingIndicator
        ? t('searchLoading')
        : (!isSearching ? (matchCount > 0 ? `${activeIdx + 1} / ${matchCount}` : t('searchNoResults')) : '')
    )
    : '';
  const shouldRenderSearchSummary = hasQuery && (showSearchLoadingIndicator || !isSearching);

  const compactPill = (active: boolean, label: string, tooltip: string, onClick: () => void) => (
    <Tooltip content={tooltip}>
      <button
        onMouseDown={(event) => {
          event.preventDefault();
          focusInput();
        }}
        onClick={onClick}
        aria-label={tooltip}
        className={`
          h-7 min-w-7 px-2 rounded-[9px] text-[12px] font-ui font-semibold leading-none
          cursor-pointer transition-all duration-150
          ${active
            ? 'bg-bg-surface-solid text-accent shadow-[inset_0_0_0_1px_var(--border-strong)]'
            : 'bg-transparent text-text-secondary hover:bg-bg-surface-solid hover:text-accent'
          }
        `}>
        {label}
      </button>
    </Tooltip>
  );

  const scopeTab = (active: boolean, label: string, tooltip: string, onClick: () => void) => (
    <Tooltip content={tooltip}>
      <button
        onMouseDown={(event) => {
          event.preventDefault();
          focusInput();
        }}
        onClick={onClick}
        aria-label={tooltip}
        className={`
          h-7 px-2.5 rounded-[9px] text-[12px] font-ui font-semibold leading-none
          cursor-pointer transition-all duration-150 whitespace-nowrap
          ${active
            ? 'bg-bg-surface-solid text-accent shadow-[inset_0_0_0_1px_var(--border-strong)]'
            : 'bg-transparent text-text-secondary hover:bg-bg-surface-solid hover:text-accent'}
        `}>
        {label}
      </button>
    </Tooltip>
  );

  const iconToolButton = (
    icon: React.ReactNode,
    tooltip: string,
    onClick: () => void,
    active = false,
    danger = false,
  ) => (
    <Tooltip content={tooltip}>
      <button
        onMouseDown={(event) => {
          event.preventDefault();
          focusInput();
        }}
        onClick={onClick}
        aria-label={tooltip}
        className={`
          size-7 rounded-[9px] border text-[12px]
          inline-flex items-center justify-center cursor-pointer
          transition-all duration-150
          ${active
            ? 'border-[var(--accent)]/28 bg-[var(--accent)]/[0.08] text-accent'
            : danger
              ? 'border-transparent bg-transparent text-text-secondary hover:bg-diff-remove-text/8 hover:text-diff-remove-text'
              : 'border-border-strong bg-transparent text-text-primary hover:bg-bg-surface-hover hover:text-accent hover:border-accent'}
        `}>
        {icon}
      </button>
    </Tooltip>
  );

  const controlGroupClassName = 'inline-flex items-center rounded-xl border border-border-default bg-bg-surface-hover p-0.5 shrink-0 overflow-hidden';

  const toggleResults = useCallback(() => {
    if (!hasQuery) return;
    setShowResults((value) => {
      const nextValue = !value;
      if (nextValue) {
        collapsedResultsKeyRef.current = null;
        manuallyOpenedResultsKeyRef.current = resultsVisibilityKey;
      } else {
        collapsedResultsKeyRef.current = resultsVisibilityKey;
        manuallyOpenedResultsKeyRef.current = null;
      }
      return nextValue;
    });
  }, [hasQuery, resultsVisibilityKey]);

  return (
    <div
      ref={rootRef}
      onKeyDownCapture={(event) => {
        if (event.target === inputRef.current) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          jumpRelative(1);
          focusInput();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          jumpRelative(-1);
          focusInput();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeResults();
          focusInput();
          return;
        }
      }}
      className="motion-toolbar-panel relative flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border-default bg-bg-surface-solid px-4 py-1.5 font-ui shrink-0">
      <div
        ref={anchorRef}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="relative flex min-w-[260px] max-w-[560px] flex-[1_1_380px] items-center">
          <Search size={15} className="pointer-events-none absolute left-3 text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onSearch(e.target.value, isRegex, isCaseSensitive, resolvedScope)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                jumpRelative(1);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                jumpRelative(-1);
                return;
              }
              if (e.key === 'Escape') {
                closeResults();
                onClose();
              }
            }}
            placeholder={t(searchPlaceholderKey)}
            className={`
              searchbar-input flex-1 h-9 w-full pl-8 rounded-[14px] appearance-none allow-text-selection
              bg-bg-surface-hover border border-border-default
              text-text-title text-[14px] font-code
              outline-none ring-0 shadow-none placeholder:text-text-secondary
              focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0
              focus:border-accent/40 focus:bg-bg-surface-solid focus:shadow-none transition-all duration-150
              ${shouldRenderSearchSummary ? (showSearchLoadingIndicator ? 'pr-[132px]' : 'pr-[96px]') : 'pr-3'}
            `}
            style={{ boxShadow: 'none' }}
          />
          {shouldRenderSearchSummary && (
            <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
              <span className="mr-2 h-4 w-px bg-border-default/80" />
              <span
                className={`
                  inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-code shrink-0
                  backdrop-blur-[6px]
                  transition-all duration-150
                  ${showSearchLoadingIndicator
                    ? 'min-w-[102px] border-[var(--accent)]/22 bg-[var(--accent)]/[0.08] text-accent'
                    : matchCount === 0
                      ? 'min-w-[68px] border-diff-remove-text/25 bg-diff-remove-text/8 text-diff-remove-text'
                      : 'min-w-[68px] border-border-strong bg-bg-surface-solid/90 text-text-secondary'}
                `}>
                {showSearchLoadingIndicator && <Loader2 size={12} className="animate-spin" />}
                {searchSummary}
              </span>
            </div>
          )}
        </div>
        <div className={controlGroupClassName}>
          {compactPill(isRegex, '.*', t('searchRegexTitle'), () => onSearch(query, !isRegex, isCaseSensitive, resolvedScope))}
          {compactPill(isCaseSensitive, 'Aa', t('searchCaseSensitiveTitle'), () => onSearch(query, isRegex, !isCaseSensitive, resolvedScope))}
        </div>
        {isWorkbookMode && (
          <div className={controlGroupClassName}>
            {scopeTab(
              resolvedScope === 'sheet',
              t('searchScopeCurrentSheetShort'),
              activeSheetName ? t('searchScopeCurrentSheetTitle', { name: activeSheetName }) : t('searchScopeCurrentSheetTitleFallback'),
              () => onSearch(query, isRegex, isCaseSensitive, 'sheet'),
            )}
            {scopeTab(
              resolvedScope === 'all',
              t('searchScopeAllSheetsShort'),
              t('searchScopeAllSheetsTitle'),
              () => onSearch(query, isRegex, isCaseSensitive, 'all'),
            )}
          </div>
        )}
        <div className={controlGroupClassName}>
          {iconToolButton(<ListFilter size={13} />, t('searchResultsListTitle'), toggleResults, showResults)}
          <span className="mx-0.5 h-4 w-px bg-border-default/80" />
          {iconToolButton(<ChevronUp size={14} />, t('searchPrevTitle'), () => onNav(-1))}
          {iconToolButton(<ChevronDown size={14} />, t('searchNextTitle'), () => onNav(1))}
        </div>
        <div className={controlGroupClassName}>
          {iconToolButton(<X size={14} />, t('searchCloseTitle'), () => {
            closeResults();
            onClose();
          }, false, true)}
        </div>
      </div>

      {showResults && hasQuery && (
        <SearchResultsPopover
          isWorkbookMode={isWorkbookMode}
          resultCount={matchCount}
          resolveResult={resolveResult}
          activeIdx={activeIdx}
          isSearching={isSearching}
          query={query}
          isRegex={isRegex}
          isCaseSensitive={isCaseSensitive}
          position={popoverPosition}
          onPositionChange={setPopoverPosition}
          containerRef={popoverRef}
          onJump={onJump}
          onClose={closeResults}
          onRequestFocusInput={focusInput}
        />
      )}
    </div>
  );
});

export default SearchBar;
