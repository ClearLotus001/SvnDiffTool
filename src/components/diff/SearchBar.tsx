// src/components/SearchBar.tsx
import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, ListFilter } from 'lucide-react';
import type { SearchResultItem } from '@/types';
import { useI18n } from '@/context/i18n';
import Tooltip from '@/components/shared/Tooltip';
import SearchResultsPopover from '@/components/diff/SearchResultsPopover';

interface SearchBarProps {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWorkbookMode: boolean;
  workbookSearchScope: 'all' | 'sheet';
  activeSheetName: string | null;
  matchCount: number;
  activeIdx: number;
  results: SearchResultItem[];
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
  results,
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
  const resolvedScope = isWorkbookMode ? workbookSearchScope : 'all';
  const resultsVisibilityKey = `${query}::${isRegex ? '1' : '0'}::${isCaseSensitive ? '1' : '0'}::${resolvedScope}`;
  const closeResults = useCallback(() => {
    collapsedResultsKeyRef.current = resultsVisibilityKey;
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
      setShowResults(false);
      return;
    }
    if (collapsedResultsKeyRef.current !== resultsVisibilityKey) {
      setShowResults(true);
    }
  }, [query, resultsVisibilityKey]);
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
  const scopeLabel = resolvedScope === 'sheet'
    ? t('searchScopeCurrentSheetShort')
    : t('searchScopeAllSheetsShort');

  const pill = (active: boolean, label: string, tooltip: string, onClick: () => void) => (
    <Tooltip content={tooltip}>
      <button
        onMouseDown={(event) => {
          event.preventDefault();
          focusInput();
        }}
        onClick={onClick}
        aria-label={tooltip}
        className={`
          h-[26px] px-2 rounded-md border text-[13px] font-ui font-medium
          cursor-pointer transition-all duration-150
          ${active
            ? 'bg-[var(--accent)]/[0.13] border-[var(--accent)]/40 text-accent'
            : 'bg-transparent border-border-strong text-text-primary'
          }
          hover:border-accent hover:text-accent
        `}>
        {label}
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
        if (event.key === 'Enter') {
          if (!showResults || activeIdx < 0) return;
          event.preventDefault();
          event.stopPropagation();
          onJump(activeIdx);
          focusInput();
        }
      }}
      className="motion-toolbar-panel relative flex items-center gap-2 border-b border-border-default bg-bg-surface-solid px-4 py-1.5 font-ui shrink-0">
      <Search size={16} className="text-text-secondary shrink-0" />
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
          if (e.key === 'Enter') {
            if (results.length > 0 && activeIdx >= 0) {
              e.preventDefault();
              e.stopPropagation();
              onJump(activeIdx);
              return;
            }
          }
          if (e.key === 'Escape') {
            closeResults();
            onClose();
          }
        }}
        placeholder={t('searchPlaceholder')}
        className="
          searchbar-input flex-1 max-w-[400px] h-8 px-3 rounded-2xl appearance-none
          bg-bg-surface-hover border border-border-strong
          text-text-title text-[14px] font-code
          outline-none ring-0 shadow-none placeholder:text-text-secondary
          focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0
          focus:border-border-strong focus:shadow-none transition-all duration-150
        "
        style={{ boxShadow: 'none' }}
      />
      {pill(isRegex, '.*', t('searchRegexTitle'), () => onSearch(query, !isRegex, isCaseSensitive, resolvedScope))}
      {pill(isCaseSensitive, 'Aa', t('searchCaseSensitiveTitle'), () => onSearch(query, isRegex, !isCaseSensitive, resolvedScope))}
      {isWorkbookMode && (
        <>
          {pill(resolvedScope === 'sheet', t('searchScopeCurrentSheetShort'), activeSheetName ? t('searchScopeCurrentSheetTitle', { name: activeSheetName }) : t('searchScopeCurrentSheetTitleFallback'), () => onSearch(query, isRegex, isCaseSensitive, 'sheet'))}
          {pill(resolvedScope === 'all', t('searchScopeAllSheetsShort'), t('searchScopeAllSheetsTitle'), () => onSearch(query, isRegex, isCaseSensitive, 'all'))}
        </>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {isWorkbookMode && (
          <span className="inline-flex items-center rounded-full border border-border-strong bg-bg-surface-hover px-2.5 py-1 text-[11px] font-ui font-semibold text-text-secondary">
            {scopeLabel}
          </span>
        )}
        {query && (
          <span
            className={`
              inline-flex min-w-[92px] items-center justify-center rounded-full border px-2.5 py-1 text-[12px] font-code
              ${matchCount === 0
                ? 'border-diff-remove-text/25 bg-diff-remove-text/8 text-diff-remove-text'
                : 'border-border-strong bg-bg-surface-hover text-text-secondary'}
            `}>
            {searchSummary}
          </span>
        )}
      </div>
      <Tooltip content={t('searchResultsTitle')}>
        <button
          onMouseDown={(event) => {
            event.preventDefault();
            focusInput();
          }}
          onClick={() => {
            if (!query) return;
            setShowResults((value) => {
              const nextValue = !value;
              collapsedResultsKeyRef.current = nextValue ? null : resultsVisibilityKey;
              return nextValue;
            });
          }}
          aria-label={t('searchResultsTitle')}
          className={`
            h-[28px] px-2.5 rounded-lg border text-[12px] font-ui font-semibold
            inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150
            ${showResults
              ? 'bg-[var(--accent)]/[0.13] border-[var(--accent)]/40 text-accent'
              : 'bg-transparent border-border-strong text-text-primary'
            }
            hover:border-accent hover:text-accent
          `}>
          <ListFilter size={13} />
          <span>{t('searchResultsButton')}</span>
        </button>
      </Tooltip>
      <Tooltip content={t('searchPrevTitle')}>
        <button
          onMouseDown={(event) => {
            event.preventDefault();
            focusInput();
          }}
          onClick={() => onNav(-1)}
          aria-label={t('searchPrevTitle')}
          className="
            size-[28px] rounded-lg border border-border-strong
            bg-transparent text-text-primary
            flex items-center justify-center cursor-pointer
            hover:bg-bg-surface-hover hover:text-accent hover:border-accent
            active:scale-95 transition-all duration-150
          ">
          <ChevronUp size={14} />
        </button>
      </Tooltip>
      <Tooltip content={t('searchNextTitle')}>
        <button
          onMouseDown={(event) => {
            event.preventDefault();
            focusInput();
          }}
          onClick={() => onNav(1)}
          aria-label={t('searchNextTitle')}
          className="
            size-[28px] rounded-lg border border-border-strong
            bg-transparent text-text-primary
            flex items-center justify-center cursor-pointer
            hover:bg-bg-surface-hover hover:text-accent hover:border-accent
            active:scale-95 transition-all duration-150
          ">
          <ChevronDown size={14} />
        </button>
      </Tooltip>
      <Tooltip content={t('searchCloseTitle')}>
        <button
          onMouseDown={(event) => {
            event.preventDefault();
            focusInput();
          }}
          onClick={() => {
            closeResults();
            onClose();
          }}
          aria-label={t('searchCloseTitle')}
          className="
            size-[28px] rounded-lg bg-transparent border-none
            text-text-primary cursor-pointer
            flex items-center justify-center
            hover:bg-bg-surface-hover hover:text-accent
            active:scale-95 transition-all duration-150
          ">
          <X size={14} />
        </button>
      </Tooltip>

      {showResults && query && (
        <SearchResultsPopover
          isWorkbookMode={isWorkbookMode}
          results={results}
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
