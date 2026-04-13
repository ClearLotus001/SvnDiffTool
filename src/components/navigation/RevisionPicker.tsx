// src/components/navigation/RevisionPicker.tsx
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronUp } from 'lucide-react';
import type { SvnRevisionInfo } from '@/types';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import { cssAlpha, cssAlphaRaw, cssVar } from '@/theme/cssUtils';
import {
  RP_UI,
  buildQueryDateTime,
  buildRevisionSearchText,
  clampTimePart,
  formatCalendarDateLabel,
  formatDisplayRevision,
  getCodeFieldStyle,
  getFieldStyle,
  parseDateTimeDraft,
  sanitizeNumericDraft,
} from '@/utils/navigation/revisionPickerUtils';
import RevisionDatePicker from '@/components/navigation/RevisionDatePicker';
import RevisionOptionRow from '@/components/navigation/RevisionOptionRow';

interface RevisionPickerProps {
  align: 'left' | 'right';
  accent: string;
  title: string;
  value: SvnRevisionInfo | null;
  options: SvnRevisionInfo[];
  disabled?: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  queryDateTime?: string;
  queryError?: string;
  isSearchingDateTime?: boolean;
  onChange?: ((nextId: string) => void) | undefined;
  onOpen?: (() => void) | undefined;
  onLoadMore?: (() => void) | undefined;
  onQueryDateTime?: ((value: string) => void) | undefined;
}

function CalendarGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.25 1.5V3.25M10.75 1.5V3.25M2 5.25H12M3.5 2.5H10.5C11.0523 2.5 11.5 2.94772 11.5 3.5V11C11.5 11.5523 11.0523 12 10.5 12H3.5C2.94772 12 2.5 11.5523 2.5 11V3.5C2.5 2.94772 2.94772 2.5 3.5 2.5Z" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const RevisionPicker = memo(({
  align, accent, title, value, options, disabled = false, isLoading = false, hasMore = false,
  isLoadingMore = false, queryDateTime = '', queryError = '', isSearchingDateTime = false,
  onChange, onOpen, onLoadMore, onQueryDateTime,
}: RevisionPickerProps) => {
  const themeKey = useTheme();
  const { t, locale } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [hoveredId, setHoveredId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftHour, setDraftHour] = useState('23');
  const [draftMinute, setDraftMinute] = useState('59');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const selectedId = value?.id ?? '';
  const panelAlignStyle = align === 'left' ? { left: 0 } : { right: 0 };
  const controlColorScheme: CSSProperties['colorScheme'] = themeKey === 'light' ? 'light' : 'dark';
  const highlightStyle: CSSProperties = {
    background: cssAlpha('searchHl', '5c'),
    color: 'var(--text-title)',
    fontWeight: 700,
    borderRadius: 5,
    padding: '0 2px',
    boxShadow: `inset 0 0 0 1px ${cssAlpha('searchHl', '88')}`,
  };
  const hasActiveTimeFilter = Boolean(queryDateTime || draftDate);
  const hasActiveFilter = Boolean(searchQuery.trim() || hasActiveTimeFilter);
  const activeDateFilter = draftDate || (queryDateTime ? queryDateTime.slice(0, 10) : '');
  const selectedDescription = useMemo(() => (value ? (value.message.trim() || (value.title && value.title !== value.revision ? value.title.trim() : '')) : ''), [value]);
  const triggerTitleText = selectedDescription || title;

  useEffect(() => {
    const next = parseDateTimeDraft(queryDateTime);
    setDraftDate(next.date);
    setDraftHour(next.hour);
    setDraftMinute(next.minute);
  }, [queryDateTime]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current?.contains(target ?? null)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => { if (open) searchInputRef.current?.focus(); }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const revisionOptions = useMemo(() => options.filter((o) => o.kind === 'revision'), [options]);
  const dateMatchedRevisionOptions = useMemo(
    () => (!activeDateFilter ? revisionOptions : revisionOptions.filter((o) => o.date.startsWith(activeDateFilter))),
    [activeDateFilter, revisionOptions],
  );
  const filteredRevisionOptions = useMemo(
    () => (!deferredSearchQuery
      ? dateMatchedRevisionOptions
      : dateMatchedRevisionOptions.filter((o) => buildRevisionSearchText(o).includes(deferredSearchQuery))),
    [dateMatchedRevisionOptions, deferredSearchQuery],
  );

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = 0;
    setShowScrollTop(false);
  }, [deferredSearchQuery, open, queryDateTime]);

  useEffect(() => {
    if (!open || !draftDate || !onQueryDateTime) return undefined;
    const nextQuery = buildQueryDateTime(draftDate, draftHour, draftMinute);
    if (!nextQuery || nextQuery === queryDateTime) return undefined;
    const timeoutId = window.setTimeout(() => onQueryDateTime(nextQuery), 320);
    return () => window.clearTimeout(timeoutId);
  }, [draftDate, draftHour, draftMinute, onQueryDateTime, open, queryDateTime]);

  const handleListScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = listRef.current;
    setShowScrollTop(scrollTop > 180);
    if (!hasMore || isLoadingMore || isSearchingDateTime) return;
    if (activeDateFilter && dateMatchedRevisionOptions.length === 0) return;
    if (scrollTop + clientHeight >= scrollHeight - 88) onLoadMore?.();
  };

  const handleQuery = () => onQueryDateTime?.(buildQueryDateTime(draftDate, draftHour, draftMinute));
  const handleToggleOpen = () => {
    setOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        onOpen?.();
      }
      return nextOpen;
    });
  };
  const handleDateFilterKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleQuery();
  };
  const handleClearFilters = () => {
    setSearchQuery('');
    setDraftDate('');
    setDraftHour('23');
    setDraftMinute('59');
    onQueryDateTime?.('');
  };

  const visibleCount = filteredRevisionOptions.length;
  const hasVisibleRows = visibleCount > 0;
  const showDateEmptyState = Boolean(activeDateFilter) && dateMatchedRevisionOptions.length === 0;
  const emptyPrimaryText = showDateEmptyState
    ? t('revisionPickerNoDateResults', { date: formatCalendarDateLabel(activeDateFilter, locale) })
    : t('revisionPickerNoResults');
  const emptySecondaryText = showDateEmptyState
    ? t('revisionPickerNoDateResultsHint')
    : (!searchQuery.trim() && hasMore ? t('revisionPickerSearchRangeHint') : '');

  return (
    <div ref={wrapperRef} className="relative" style={{ flex: '1 1 312px', minWidth: 220, maxWidth: 408 }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={title}
        title={triggerTitleText}
        disabled={disabled}
        onClick={handleToggleOpen}
        className="flex items-center justify-between gap-1.5 w-full min-w-0 rounded-full text-left"
        style={{
          height: RP_UI.triggerHeight,
          padding: RP_UI.triggerPadding,
          border: `1px solid ${open ? cssAlphaRaw(accent, '55') : cssVar('border')}`,
          background: disabled ? cssVar('bg1') : `linear-gradient(180deg, ${cssVar('bg2')} 0%, ${cssVar('bg1')} 100%)`,
          color: cssVar('t0'),
          boxShadow: open ? `0 14px 28px -24px ${cssAlphaRaw(accent, '66')}, inset 0 0 0 1px ${cssAlphaRaw(accent, '22')}` : 'none',
          cursor: disabled ? 'default' : 'pointer',
        }}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center h-full shrink-0 font-ui text-[11px] font-semibold leading-none tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: `var(${accent})` }}>
            {value ? formatDisplayRevision(value.revision) : t('splitHeaderVersionUnknown')}
          </span>
        </div>
        <span aria-hidden="true" className="shrink-0 text-[8px] font-ui leading-none" style={{ color: open ? `var(${accent})` : cssVar('t2') }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* ── Dropdown Panel ── */}
      {open && (
        <div
          className="absolute z-[72] overflow-hidden"
          style={{
            top: 'calc(100% + 10px)',
            ...panelAlignStyle,
            width: RP_UI.panelWidth,
            borderRadius: RP_UI.panelRadius,
            border: `1px solid ${cssVar('border')}`,
            background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
            boxShadow: `0 24px 48px -28px ${cssVar('border2')}`,
          }}>
          {/* ── Header / Filters ── */}
          <div
            className="grid gap-2.5 p-3 border-b border-border-default"
            style={{ background: `linear-gradient(180deg, ${cssAlphaRaw(accent, '08')} 0%, ${cssVar('bg1')} 100%)` }}>
            {/* Top info row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="grid gap-0.5">
                <span className="font-ui text-[10px] font-bold uppercase tracking-wider" style={{ color: `var(${accent})` }}>
                  {t('revisionPickerTimeline')}
                </span>
                <span className="text-text-secondary text-[10px] font-ui">
                  {t('revisionPickerResultsLoaded', { visible: visibleCount, total: options.length })}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 flex-wrap">
                {deferredSearchQuery && (
                  <span className="inline-flex items-center h-[34px] px-3 rounded-[10px] border border-border-default bg-bg-surface-hover text-text-secondary text-[11px] font-ui whitespace-nowrap">
                    {t('revisionPickerSearchActive')}
                  </span>
                )}
                {queryDateTime && (
                  <span className="inline-flex items-center h-[34px] px-3 rounded-[10px] border border-border-default bg-bg-surface-hover text-text-secondary text-[11px] font-ui whitespace-nowrap">
                    {t('revisionPickerScopedTo', { date: queryDateTime.replace('T', ' ') })}
                  </span>
                )}
              </div>
            </div>

            {/* Search input */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
              <label className="grid gap-1 min-w-0">
                <span className="text-text-secondary text-[10px] font-bold font-ui">{t('revisionPickerSearchLabel')}</span>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  placeholder={t('revisionPickerSearchPlaceholder')}
                  style={getFieldStyle(controlColorScheme)}
                />
              </label>
              <div className="grid gap-1 self-stretch">
                <span className="invisible text-[10px] font-bold font-ui">.</span>
                <div className="inline-flex items-center h-[34px] px-3 rounded-[10px] border border-border-default bg-bg-surface-hover text-text-secondary text-[11px] font-ui whitespace-nowrap">
                  {t('revisionPickerSearchScope')}
                </div>
              </div>
            </div>

            {/* Date / time filters */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1 min-w-[156px]" style={{ flex: '1 1 184px' }}>
                <span className="text-text-secondary text-[10px] font-bold font-ui">{t('revisionPickerDateLabel')}</span>
                <RevisionDatePicker
                  value={draftDate}
                  accent={accent}
                  disabled={disabled}
                  onChange={setDraftDate}
                  onClear={() => { setDraftDate(''); onQueryDateTime?.(''); }}
                />
              </div>
              <label className="grid gap-1" style={{ flex: '0 0 68px' }}>
                <span className="text-text-secondary text-[10px] font-bold font-ui">{t('revisionPickerHourLabel')}</span>
                <input
                  type="text" inputMode="numeric" value={draftHour}
                  onChange={(e) => setDraftHour(sanitizeNumericDraft(e.currentTarget.value))}
                  onBlur={() => setDraftHour((c) => clampTimePart(c, 23, '23'))}
                  onKeyDown={handleDateFilterKeyDown}
                  style={getCodeFieldStyle()}
                />
              </label>
              <label className="grid gap-1" style={{ flex: '0 0 68px' }}>
                <span className="text-text-secondary text-[10px] font-bold font-ui">{t('revisionPickerMinuteLabel')}</span>
                <input
                  type="text" inputMode="numeric" value={draftMinute}
                  onChange={(e) => setDraftMinute(sanitizeNumericDraft(e.currentTarget.value))}
                  onBlur={() => setDraftMinute((c) => clampTimePart(c, 59, '59'))}
                  onKeyDown={handleDateFilterKeyDown}
                  style={getCodeFieldStyle()}
                />
              </label>
              <div style={{ flex: `0 0 ${RP_UI.topActionWidth}px`, width: RP_UI.topActionWidth, minWidth: RP_UI.topActionWidth }}>
                <button
                  type="button"
                  disabled={!hasActiveFilter && !isSearchingDateTime}
                  onClick={handleClearFilters}
                  className={`
                    w-full rounded-[10px] border border-border-default bg-bg-surface-hover
                    text-[11px] font-semibold font-ui whitespace-nowrap
                    transition-all duration-150
                    ${hasActiveFilter ? 'text-text-primary cursor-pointer hover:border-accent' : 'text-text-secondary cursor-default'}
                  `}
                  style={{ height: RP_UI.actionHeight, padding: '0 12px' }}>
                  {t('revisionPickerClearFilters')}
                </button>
              </div>
            </div>
            {queryError && <span className="text-diff-remove-text text-[10px] font-ui">{queryError}</span>}
          </div>

          {/* ── List ── */}
          <div className="relative p-[10px_12px_12px]">
            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="overflow-y-auto overflow-x-hidden rounded-[14px] border border-border-default bg-bg-surface-solid"
              style={{ maxHeight: RP_UI.listMaxHeight, scrollbarWidth: 'thin' }}>
              {/* Column header */}
              {filteredRevisionOptions.length > 0 && (
                <div
                  className="sticky top-0 z-[2] flex items-center gap-3.5 min-w-0 py-[7px] px-3 border-b border-border-default"
                  style={{ background: `linear-gradient(180deg, ${cssVar('bg2')} 0%, ${cssVar('bg1')} 100%)` }}>
                  <div
                    className="min-w-0 text-text-secondary text-[10px] font-bold font-ui uppercase tracking-wider"
                    style={{ flex: `0 0 ${RP_UI.rowLeftWidth}px`, width: RP_UI.rowLeftWidth }}>
                    {t('revisionPickerColumnRevision')}
                  </div>
                  <div className="flex items-center justify-between gap-3 min-w-0 flex-1 text-text-secondary text-[10px] font-bold font-ui uppercase tracking-wider">
                    <span>{t('revisionPickerColumnMessage')}</span>
                    <span>{t('revisionPickerColumnMeta')}</span>
                  </div>
                </div>
              )}

              {/* Rows */}
              {filteredRevisionOptions.map((option) => (
                <RevisionOptionRow
                  key={option.id}
                  option={option}
                  selected={option.id === selectedId}
                  hovered={option.id === hoveredId}
                  searchQuery={deferredSearchQuery}
                  highlightStyle={highlightStyle}
                  onSelect={(id) => { onChange?.(id); setOpen(false); }}
                  onHover={setHoveredId}
                  onLeave={(id) => setHoveredId((c) => (c === id ? '' : c))}
                />
              ))}

              {/* Empty state */}
              {!isLoading && !isSearchingDateTime && !hasVisibleRows && (
                <div className="grid gap-2.5 p-[28px_18px] text-center">
                  <span
                    aria-hidden="true"
                    className="justify-self-center size-10 rounded-[14px] inline-flex items-center justify-center"
                    style={{ background: cssAlphaRaw(accent, '12'), border: `1px solid ${cssAlphaRaw(accent, '22')}` }}>
                    <CalendarGlyph color={`var(${accent})`} />
                  </span>
                  <span className="text-text-primary text-[11px] font-bold font-ui">{emptyPrimaryText}</span>
                  {emptySecondaryText && <span className="text-text-secondary text-[10px] font-ui">{emptySecondaryText}</span>}
                </div>
              )}

              {/* Loading */}
              {(isLoading || isSearchingDateTime) && (
                <div className="p-[22px_16px] text-text-secondary text-[11px] font-ui text-center">
                  {isSearchingDateTime ? t('revisionPickerQuerying') : t('appLoadingDiff')}
                </div>
              )}
            </div>

            {/* Scroll to top */}
            {showScrollTop && (
              <button
                type="button"
                onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="absolute right-5 bottom-[18px] h-[30px] px-2.5 rounded-full border border-border-default text-text-primary text-[10px] font-bold font-ui cursor-pointer transition-all duration-150 hover:-translate-y-px active:scale-95"
                style={{
                  background: `linear-gradient(180deg, ${cssVar('bg2')} 0%, ${cssVar('bg1')} 100%)`,
                  boxShadow: `0 12px 28px -24px ${cssVar('border2')}`,
                }}>
                <ChevronUp size={12} className="inline mr-1" />
                {t('revisionPickerBackToTop')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default RevisionPicker;
