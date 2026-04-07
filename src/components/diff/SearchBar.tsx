// src/components/SearchBar.tsx
import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, ListFilter } from 'lucide-react';
import type { SearchResultItem } from '@/types';
import { useI18n } from '@/context/i18n';
import Tooltip from '@/components/shared/Tooltip';
import SearchResultsPopover from '@/components/diff/SearchResultsPopover';

const AUTO_OPEN_SEARCH_RESULTS_LIMIT = 200;

interface SearchBarProps {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWorkbookMode: boolean;
  workbookSearchScope: 'all' | 'sheet';
  activeSheetName: string | null;
  matchCount: number;
  activeIdx: number;
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
  resolveResult,
  onSearch,
  onPreviewNav,
  onNav,
  onJump,
  onClose,
}: SearchBarProps) => {
  const { t } = useI18n();
  const [showResults, setShowResults] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const collapsedResultsKeyRef = useRef<string | null>(null);
  const manuallyOpenedResultsKeyRef = useRef<string | null>(null);
  const resolvedScope = isWorkbookMode ? workbookSearchScope : 'all';
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
    if (!query) return;
    setShowResults(true);
    onPreviewNav(dir);
  }, [onPreviewNav, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!showResults || popoverPosition) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPopoverPosition({
      left: rect.left + 12,
      top: rect.bottom + 10,
    });
  }, [popoverPosition, showResults]);
  useEffect(() => {
    if (!query) {
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
    if (matchCount <= 0) {
      setShowResults(false);
      return;
    }
    if (matchCount > AUTO_OPEN_SEARCH_RESULTS_LIMIT) {
      collapsedResultsKeyRef.current = resultsVisibilityKey;
      setShowResults(false);
      return;
    }
    setShowResults(true);
  }, [matchCount, query, resultsVisibilityKey]);
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

  const searchSummary = query
    ? (matchCount > 0 ? `${activeIdx + 1} / ${matchCount}` : t('searchNoResults'))
    : '';

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
          h-[22px] min-w-[22px] px-1.5 rounded-[7px] text-[12px] font-ui font-semibold leading-none
          cursor-pointer transition-all duration-150
          ${active
            ? 'bg-bg-surface-solid text-accent shadow-[inset_0_0_0_1px_var(--border-strong)]'
            : 'bg-transparent text-text-secondary'
          }
          hover:bg-bg-base/70 hover:text-accent
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
          h-[22px] px-2 rounded-[7px] text-[12px] font-ui font-semibold leading-none
          cursor-pointer transition-all duration-150 whitespace-nowrap
          ${active
            ? 'bg-bg-surface-solid text-accent shadow-[inset_0_0_0_1px_var(--border-strong)]'
            : 'bg-transparent text-text-secondary hover:bg-bg-base/70 hover:text-accent'}
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
          size-[26px] rounded-[8px] border text-[12px]
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
      className="motion-toolbar-panel relative flex items-center gap-1.5 border-b border-border-default bg-bg-surface-solid px-4 py-1.5 font-ui shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="relative flex min-w-0 max-w-[440px] flex-1 items-center">
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
            placeholder={t('searchPlaceholder')}
            className="
              searchbar-input flex-1 h-8 w-full pl-8 pr-3 rounded-2xl appearance-none allow-text-selection
              bg-bg-surface-hover border border-border-strong
              text-text-title text-[14px] font-code
              outline-none ring-0 shadow-none placeholder:text-text-secondary
              focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0
              focus:border-border-strong focus:shadow-none transition-all duration-150
            "
            style={{ boxShadow: 'none' }}
          />
        </div>
        <div className="inline-flex items-center rounded-[10px] border border-border-strong bg-bg-surface-hover p-0.5 shrink-0 overflow-hidden">
          {compactPill(isRegex, '.*', t('searchRegexTitle'), () => onSearch(query, !isRegex, isCaseSensitive, resolvedScope))}
          {compactPill(isCaseSensitive, 'Aa', t('searchCaseSensitiveTitle'), () => onSearch(query, isRegex, !isCaseSensitive, resolvedScope))}
        </div>
      </div>
      {isWorkbookMode && (
        <div className="inline-flex items-center rounded-[10px] border border-border-strong bg-bg-surface-hover p-0.5 shrink-0 overflow-hidden">
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
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {query && (
          <span
            className={`
              inline-flex min-w-[82px] items-center justify-center rounded-full border px-2 py-1 text-[12px] font-code
              ${matchCount === 0
                ? 'border-diff-remove-text/25 bg-diff-remove-text/8 text-diff-remove-text'
                : 'border-border-strong bg-bg-surface-hover text-text-secondary'}
            `}>
            {searchSummary}
          </span>
        )}
      </div>
      {iconToolButton(<ListFilter size={13} />, t('searchResultsListTitle'), () => {
        if (!query) return;
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
      }, showResults)}
      {iconToolButton(<ChevronUp size={14} />, t('searchPrevTitle'), () => onNav(-1))}
      {iconToolButton(<ChevronDown size={14} />, t('searchNextTitle'), () => onNav(1))}
      {iconToolButton(<X size={14} />, t('searchCloseTitle'), () => {
        closeResults();
        onClose();
      }, false, true)}

      {showResults && query && (
        <SearchResultsPopover
          isWorkbookMode={isWorkbookMode}
          resultCount={matchCount}
          resolveResult={resolveResult}
          activeIdx={activeIdx}
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
