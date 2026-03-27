import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { SvnRevisionInfo } from '@/types';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n, type Locale } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import Tooltip from '@/components/shared/Tooltip';

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
  onLoadMore?: (() => void) | undefined;
  onQueryDateTime?: ((value: string) => void) | undefined;
}

interface TruncatedTooltipTextProps {
  text: string;
  query: string;
  lines?: number;
  maxWidth?: number;
  textStyle: CSSProperties;
  tooltipText?: string;
  highlightStyle: CSSProperties;
  anchorStyle?: CSSProperties | undefined;
}

const UI = {
  triggerPadding: '6px 10px 7px',
  triggerRadius: 14,
  metaSize: 10,
  inputHeight: 34,
  actionHeight: 32,
  rowLeftWidth: 108,
  rowPadding: '8px 12px',
  panelWidth: 'min(712px, calc(100vw - 40px))',
  panelRadius: 18,
  listMaxHeight: 334,
  topActionWidth: 124,
  calendarWidth: 286,
  calendarDaySize: 34,
} as const;

function formatDisplayRevision(revision: string) {
  return revision.replace(/^r/i, '');
}

function buildRevisionOptionDescription(option: SvnRevisionInfo) {
  const title = option.title && option.title !== option.revision ? option.title.trim() : '';
  return option.message.trim() || title;
}

function buildRevisionOptionMeta(option: SvnRevisionInfo) {
  return [option.author, option.date].filter(Boolean).join(' · ');
}

function buildRevisionSearchText(option: SvnRevisionInfo) {
  return [option.revision, option.title, option.author, option.date, option.message].join(' ').toLowerCase();
}

function parseDateTimeDraft(value: string) {
  if (!value) return { date: '', hour: '23', minute: '59' };
  const [date = '', time = '23:59'] = value.split('T');
  const [hour = '23', minute = '59'] = time.split(':');
  return { date, hour, minute };
}

function sanitizeNumericDraft(value: string, maxDigits = 2) {
  return value.replace(/\D+/g, '').slice(0, maxDigits);
}

function clampTimePart(value: string, max: number, fallback: string) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return `${Math.max(0, Math.min(max, numeric))}`.padStart(2, '0');
}

function buildQueryDateTime(date: string, hour: string, minute: string) {
  if (!date.trim()) return '';
  return `${date}T${clampTimePart(hour, 23, '23')}:${clampTimePart(minute, 59, '59')}`;
}

function clampInlineText(lines: number): CSSProperties {
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' };
}

function padDatePart(value: number) {
  return `${value}`.padStart(2, '0');
}

function buildDateValue(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function buildDateValueFromDate(date: Date) {
  return buildDateValue(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseDateValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const yearText = match[1] ?? '';
  const monthText = match[2] ?? '';
  const dayText = match[3] ?? '';
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(year, month - 1, day, 12);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function buildMonthKey(year: number, month: number) {
  return `${year}-${padDatePart(month)}`;
}

function parseMonthKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const yearText = match[1] ?? '';
  const monthText = match[2] ?? '';
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

  return { year, month };
}

function shiftMonthKey(monthKey: string, delta: number) {
  const parsed = parseMonthKey(monthKey);
  const source = parsed
    ? new Date(parsed.year, parsed.month - 1, 1, 12)
    : new Date();
  const next = new Date(source.getFullYear(), source.getMonth() + delta, 1, 12);
  return buildMonthKey(next.getFullYear(), next.getMonth() + 1);
}

function formatDateDisplayValue(value: string) {
  const parsed = parseDateValue(value);
  if (!parsed) return 'YYYY/MM/DD';
  return `${parsed.year}/${padDatePart(parsed.month)}/${padDatePart(parsed.day)}`;
}

function formatCalendarDateLabel(value: string, locale: Locale) {
  const parsed = parseDateValue(value);
  if (!parsed) return value;

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(parsed.year, parsed.month - 1, parsed.day, 12));
  } catch {
    return value;
  }
}

function formatMonthDisplay(monthKey: string, locale: Locale) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
    }).format(new Date(parsed.year, parsed.month - 1, 1, 12));
  } catch {
    return `${parsed.year}-${padDatePart(parsed.month)}`;
  }
}

function buildWeekdayLabels(locale: Locale) {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 7 + index, 12)));
  } catch {
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  }
}

function buildMonthLabels(locale: Locale) {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    return Array.from({ length: 12 }, (_, index) => formatter.format(new Date(2024, index, 1, 12)));
  } catch {
    return Array.from({ length: 12 }, (_, index) => `${index + 1}`);
  }
}

function buildYearChoices(startYear: number, count = 12) {
  return Array.from({ length: count }, (_, index) => startYear + index);
}

function buildCalendarDayCells(monthKey: string, selectedValue: string) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return [] as Array<{
    dateValue: string;
    dayLabel: string;
    inMonth: boolean;
    isSelected: boolean;
    isToday: boolean;
  }>;

  const firstOfMonth = new Date(parsed.year, parsed.month - 1, 1, 12);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(parsed.year, parsed.month - 1, 1 - startOffset, 12);
  const todayValue = buildDateValueFromDate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12);
    const dateValue = buildDateValueFromDate(cellDate);
    return {
      dateValue,
      dayLabel: `${cellDate.getDate()}`,
      inMonth: cellDate.getMonth() === parsed.month - 1,
      isSelected: dateValue === selectedValue,
      isToday: dateValue === todayValue,
    };
  });
}

function getFieldStyle(T: ReturnType<typeof useTheme>, colorScheme: CSSProperties['colorScheme']): CSSProperties {
  return {
    width: '100%', minWidth: 0, height: UI.inputHeight, padding: '0 10px', borderRadius: 10,
    border: `1px solid ${T.border}`, background: T.bg2, color: T.t0, fontSize: FONT_SIZE.xs,
    fontFamily: FONT_UI, colorScheme, outline: 'none',
  };
}

function getCodeFieldStyle(T: ReturnType<typeof useTheme>): CSSProperties {
  return {
    width: '100%', minWidth: 0, height: UI.inputHeight, padding: '0 10px', borderRadius: 10,
    border: `1px solid ${T.border}`, background: T.bg2, color: T.t0, fontSize: FONT_SIZE.xs,
    fontFamily: FONT_CODE, outline: 'none',
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, query: string, highlightStyle: CSSProperties): ReactNode {
  if (!query) return text;
  const escaped = escapeRegExp(query.trim());
  if (!escaped) return text;
  const matcher = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(matcher);
  if (parts.length <= 1) return text;
  return parts.map((part, index) => (
    index % 2 === 1
      ? <mark key={`${part}-${index}`} style={highlightStyle}>{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  ));
}

function CalendarGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.25 1.5V3.25M10.75 1.5V3.25M2 5.25H12M3.5 2.5H10.5C11.0523 2.5 11.5 2.94772 11.5 3.5V11C11.5 11.5523 11.0523 12 10.5 12H3.5C2.94772 12 2.5 11.5523 2.5 11V3.5C2.5 2.94772 2.94772 2.5 3.5 2.5Z" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RevisionDatePickerProps {
  value: string;
  accent: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onClear?: (() => void) | undefined;
}

const RevisionDatePicker = memo(({
  value,
  accent,
  disabled = false,
  onChange,
  onClear,
}: RevisionDatePickerProps) => {
  const T = useTheme();
  const { t, locale } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const todayValue = useMemo(() => buildDateValueFromDate(new Date()), []);
  const initialMonthKey = useMemo(
    () => (value ? value.slice(0, 7) : todayValue.slice(0, 7)),
    [todayValue, value],
  );
  const initialMonthMeta = useMemo(() => parseMonthKey(initialMonthKey) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }, [initialMonthKey]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => initialMonthKey);
  const [quickMode, setQuickMode] = useState<'day' | 'month' | 'year'>('day');
  const [yearGridStart, setYearGridStart] = useState(() => initialMonthMeta.year - 5);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (open) return;
    setViewMonth(value ? value.slice(0, 7) : todayValue.slice(0, 7));
    const nextMonthMeta = parseMonthKey(value ? value.slice(0, 7) : todayValue.slice(0, 7));
    if (nextMonthMeta) setYearGridStart(nextMonthMeta.year - 5);
    setQuickMode('day');
  }, [open, todayValue, value]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current?.contains(target ?? null)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const viewMonthMeta = useMemo(
    () => parseMonthKey(viewMonth) ?? initialMonthMeta,
    [initialMonthMeta, viewMonth],
  );
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale), [locale]);
  const monthLabels = useMemo(() => buildMonthLabels(locale), [locale]);
  const yearChoices = useMemo(() => buildYearChoices(yearGridStart), [yearGridStart]);
  const dayCells = useMemo(() => buildCalendarDayCells(viewMonth, value), [viewMonth, value]);
  const hasValue = Boolean(value);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minWidth: 0,
          height: UI.inputHeight,
          padding: '0 10px',
          borderRadius: 10,
          border: `1px solid ${open ? `${accent}55` : T.border}`,
          background: T.bg2,
          color: hasValue ? T.t0 : T.t2,
          fontSize: FONT_SIZE.xs,
          fontFamily: FONT_CODE,
          outline: 'none',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          boxShadow: open ? `0 16px 30px -26px ${accent}66, inset 0 0 0 1px ${accent}14` : 'none',
        }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: 0.2 }}>
          {formatDateDisplayValue(value)}
        </span>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: open ? `${accent}16` : 'transparent',
            color: open ? accent : T.t2,
            border: open ? `1px solid ${accent}28` : '1px solid transparent',
            boxSizing: 'border-box',
          }}>
          <CalendarGlyph color={open ? accent : T.t2} />
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 9,
            width: UI.calendarWidth,
            padding: 10,
            borderRadius: 16,
            border: `1px solid ${T.border}`,
            background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
            boxShadow: `0 22px 40px -28px ${T.border2}`,
            overflow: 'hidden',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => {
                setViewMonth((current) => shiftMonthKey(current, -1));
                setQuickMode('day');
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                color: T.t1,
                fontSize: FONT_SIZE.sm,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {'<'}
            </button>
            <div style={{ minWidth: 0, color: T.t0, fontSize: FONT_SIZE.xs, fontWeight: 700, fontFamily: FONT_UI, letterSpacing: 0.2 }}>
              {formatMonthDisplay(viewMonth, locale)}
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMonth((current) => shiftMonthKey(current, 1));
                setQuickMode('day');
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                color: T.t1,
                fontSize: FONT_SIZE.sm,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {'>'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => {
                setYearGridStart(viewMonthMeta.year - 5);
                setQuickMode((current) => (current === 'year' ? 'day' : 'year'));
              }}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 10,
                border: `1px solid ${quickMode === 'year' ? `${accent}33` : T.border}`,
                background: quickMode === 'year' ? `${accent}12` : T.bg2,
                color: quickMode === 'year' ? accent : T.t1,
                fontSize: FONT_SIZE.xs,
                fontWeight: 700,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {viewMonthMeta.year}
            </button>
            <button
              type="button"
              onClick={() => setQuickMode((current) => (current === 'month' ? 'day' : 'month'))}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 10,
                border: `1px solid ${quickMode === 'month' ? `${accent}33` : T.border}`,
                background: quickMode === 'month' ? `${accent}12` : T.bg2,
                color: quickMode === 'month' ? accent : T.t1,
                fontSize: FONT_SIZE.xs,
                fontWeight: 700,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {monthLabels[viewMonthMeta.month - 1] ?? `${viewMonthMeta.month}`}
            </button>
          </div>

          {quickMode === 'year' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setYearGridStart((current) => current - 12)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: `1px solid ${T.border}`,
                    background: T.bg2,
                    color: T.t1,
                    fontSize: FONT_SIZE.sm,
                    fontFamily: FONT_UI,
                    cursor: 'pointer',
                  }}>
                  {'<'}
                </button>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>
                  {`${yearGridStart} - ${yearGridStart + 11}`}
                </span>
                <button
                  type="button"
                  onClick={() => setYearGridStart((current) => current + 12)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: `1px solid ${T.border}`,
                    background: T.bg2,
                    color: T.t1,
                    fontSize: FONT_SIZE.sm,
                    fontFamily: FONT_UI,
                    cursor: 'pointer',
                  }}>
                  {'>'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {yearChoices.map((year) => {
                  const selected = year === viewMonthMeta.year;
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        setViewMonth(buildMonthKey(year, viewMonthMeta.month));
                        setYearGridStart(year - 5);
                        setQuickMode('day');
                      }}
                      style={{
                        height: 34,
                        borderRadius: 10,
                        border: `1px solid ${selected ? accent : T.border}`,
                        background: selected ? `${accent}14` : T.bg2,
                        color: selected ? accent : T.t1,
                        fontSize: FONT_SIZE.xs,
                        fontWeight: selected ? 700 : 600,
                        fontFamily: FONT_UI,
                        cursor: 'pointer',
                      }}>
                      {year}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {quickMode === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {monthLabels.map((label, index) => {
                const month = index + 1;
                const selected = month === viewMonthMeta.month;
                return (
                  <button
                    key={`${label}-${month}`}
                    type="button"
                    onClick={() => {
                      setViewMonth(buildMonthKey(viewMonthMeta.year, month));
                      setQuickMode('day');
                    }}
                    style={{
                      height: 34,
                      borderRadius: 10,
                      border: `1px solid ${selected ? accent : T.border}`,
                      background: selected ? `${accent}14` : T.bg2,
                      color: selected ? accent : T.t1,
                      fontSize: FONT_SIZE.xs,
                      fontWeight: selected ? 700 : 600,
                      fontFamily: FONT_UI,
                      cursor: 'pointer',
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {quickMode === 'day' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {weekdayLabels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 22,
                    color: T.t2,
                    fontSize: UI.metaSize,
                    fontWeight: 700,
                    fontFamily: FONT_UI,
                    textTransform: 'uppercase',
                    letterSpacing: 0.2,
                  }}>
                  {label}
                </span>
              ))}

              {dayCells.map((cell) => {
                const dayColor = cell.isSelected
                  ? '#fffaf2'
                  : cell.inMonth ? T.t0 : T.t2;

                return (
                  <button
                    key={cell.dateValue}
                    type="button"
                    onClick={() => {
                      onChange(cell.dateValue);
                      setViewMonth(cell.dateValue.slice(0, 7));
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      height: UI.calendarDaySize,
                      borderRadius: 10,
                      border: `1px solid ${
                        cell.isSelected
                          ? accent
                          : cell.isToday ? `${accent}48` : 'transparent'
                      }`,
                      background: cell.isSelected
                        ? `linear-gradient(180deg, ${accent} 0%, ${accent}cc 100%)`
                        : cell.isToday ? `${accent}14` : 'transparent',
                      color: dayColor,
                      fontSize: FONT_SIZE.xs,
                      fontWeight: cell.isSelected || cell.isToday ? 700 : 500,
                      fontFamily: FONT_UI,
                      cursor: 'pointer',
                      boxShadow: cell.isSelected ? `0 12px 26px -24px ${accent}bb` : 'none',
                    }}>
                    {cell.dayLabel}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setOpen(false);
              }}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                color: T.t2,
                fontSize: UI.metaSize,
                fontWeight: 600,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {t('revisionPickerDateClear')}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayValue);
                setViewMonth(todayValue.slice(0, 7));
                setOpen(false);
              }}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${accent}28`,
                background: `${accent}10`,
                color: accent,
                fontSize: UI.metaSize,
                fontWeight: 700,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}>
              {t('revisionPickerDateToday')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const TruncatedTooltipText = memo(({
  text, query, lines = 1, maxWidth = 360, textStyle, tooltipText, highlightStyle, anchorStyle,
}: TruncatedTooltipTextProps) => {
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const measure = () => {
      const next = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
      setIsTruncated((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lines, query, text]);

  return (
    <Tooltip content={tooltipText ?? text} maxWidth={maxWidth} disabled={!isTruncated} anchorStyle={anchorStyle}>
      <span ref={contentRef} style={{ ...textStyle, ...clampInlineText(lines) }}>
        {renderHighlightedText(text, query, highlightStyle)}
      </span>
    </Tooltip>
  );
});

const RevisionPicker = memo(({
  align, accent, title, value, options, disabled = false, isLoading = false, hasMore = false,
  isLoadingMore = false, queryDateTime = '', queryError = '', isSearchingDateTime = false,
  onChange, onLoadMore, onQueryDateTime,
}: RevisionPickerProps) => {
  const T = useTheme();
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
  const controlColorScheme: CSSProperties['colorScheme'] = T.t0 === '#141413' ? 'light' : 'dark';
  const highlightStyle: CSSProperties = {
    background: T.searchHl,
    color: '#2b2417',
    fontWeight: 700,
    borderRadius: 5,
    padding: '0 2px',
    boxShadow: `inset 0 0 0 1px ${accent}33`,
  };
  const normalizedRevisionHighlightQuery = deferredSearchQuery.replace(/^r(?=\d)/i, '');
  const hasActiveTimeFilter = Boolean(queryDateTime || draftDate);
  const hasActiveFilter = Boolean(searchQuery.trim() || hasActiveTimeFilter);
  const activeDateFilter = draftDate || (queryDateTime ? queryDateTime.slice(0, 10) : '');

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

  const revisionOptions = useMemo(() => options.filter((option) => option.kind === 'revision'), [options]);
  const dateMatchedRevisionOptions = useMemo(
    () => (!activeDateFilter ? revisionOptions : revisionOptions.filter((option) => option.date.startsWith(activeDateFilter))),
    [activeDateFilter, revisionOptions],
  );
  const filteredRevisionOptions = useMemo(
    () => (!deferredSearchQuery
      ? dateMatchedRevisionOptions
      : dateMatchedRevisionOptions.filter((option) => buildRevisionSearchText(option).includes(deferredSearchQuery))),
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

    const timeoutId = window.setTimeout(() => {
      onQueryDateTime(nextQuery);
    }, 320);
    return () => {
      window.clearTimeout(timeoutId);
    };
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

  const renderOption = (option: SvnRevisionInfo) => {
    const description = buildRevisionOptionDescription(option);
    const meta = buildRevisionOptionMeta(option);
    const selected = option.id === selectedId;
    const hovered = option.id === hoveredId;
    const isSpecial = option.kind !== 'revision';
    const hoverStroke = `${T.acc2}88`;
    const rowBackground = selected
      ? `linear-gradient(90deg, ${T.addHl} 0%, ${T.addBg} 100%)`
      : hovered ? `linear-gradient(90deg, ${T.acc2}12 0%, ${T.bg2} 100%)` : 'transparent';
    const revisionColor = selected ? T.addBrd : hovered ? T.acc2 : T.acc2;
    const displayRevision = formatDisplayRevision(option.revision);
    const rowStroke = selected ? T.addBrd : hovered ? hoverStroke : '';
    const rowStrokeWidth = selected ? 4 : 3;

    return (
      <button
        key={option.id}
        type="button"
        onMouseEnter={() => setHoveredId(option.id)}
        onMouseLeave={() => setHoveredId((current) => (current === option.id ? '' : current))}
        onClick={() => { onChange?.(option.id); setOpen(false); }}
        style={{
          position: 'relative',
          zIndex: selected ? 2 : hovered ? 1 : 0,
          display: 'block', width: '100%',
          border: 'none', borderBottom: `1px solid ${T.border}`, background: rowBackground, color: T.t0,
          textAlign: 'left', cursor: 'pointer', transition: 'background 120ms ease, box-shadow 120ms ease',
          boxShadow: 'none',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0, padding: UI.rowPadding }}>
          <div
            style={{
              display: 'grid',
              alignContent: 'center',
              gap: 2,
              flex: `0 0 ${UI.rowLeftWidth}px`,
              width: UI.rowLeftWidth,
              minWidth: 0,
              boxSizing: 'border-box',
            }}>
            <span style={{ color: revisionColor, fontSize: FONT_SIZE.sm, fontWeight: 700, fontFamily: FONT_CODE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {renderHighlightedText(displayRevision, normalizedRevisionHighlightQuery, highlightStyle)}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
            <TruncatedTooltipText
              text={description || option.title || option.revision}
              tooltipText={description || option.title || option.revision}
              query={deferredSearchQuery}
              lines={2}
              maxWidth={420}
              highlightStyle={highlightStyle}
              anchorStyle={{ display: 'block', flexShrink: 1, minWidth: 0, maxWidth: '100%' }}
              textStyle={{ minWidth: 0, color: selected ? T.t0 : T.t1, fontSize: FONT_SIZE.xs, fontWeight: selected ? 700 : 600, fontFamily: FONT_UI }}
            />
            {meta && <span style={{ flexShrink: 0, color: T.t2, fontSize: UI.metaSize, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>{renderHighlightedText(meta, deferredSearchQuery, highlightStyle)}</span>}
          </div>
          {isSpecial && option.message && option.message !== description && (
            <TruncatedTooltipText
              text={option.message}
              tooltipText={option.message}
              query={deferredSearchQuery}
              lines={2}
              maxWidth={420}
              highlightStyle={highlightStyle}
              anchorStyle={{ display: 'block', minWidth: 0, maxWidth: '100%' }}
              textStyle={{ color: T.t2, fontSize: UI.metaSize, fontFamily: FONT_UI }}
            />
          )}
        </div>
        </div>
        {rowStroke && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              border: `1px solid ${rowStroke}`,
              borderLeftWidth: rowStrokeWidth,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}
      </button>
    );
  };

  const visibleCount = filteredRevisionOptions.length;
  const hasVisibleRows = visibleCount > 0;
  const showRevisionHeader = filteredRevisionOptions.length > 0;
  const showDateEmptyState = Boolean(activeDateFilter) && dateMatchedRevisionOptions.length === 0;
  const emptyPrimaryText = showDateEmptyState
    ? t('revisionPickerNoDateResults', { date: formatCalendarDateLabel(activeDateFilter, locale) })
    : t('revisionPickerNoResults');
  const emptySecondaryText = showDateEmptyState
    ? t('revisionPickerNoDateResultsHint')
    : (!searchQuery.trim() && hasMore ? t('revisionPickerSearchRangeHint') : '');

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: '1 1 312px', minWidth: 220, maxWidth: 408 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={title}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minWidth: 0, padding: UI.triggerPadding, borderRadius: UI.triggerRadius,
          border: `1px solid ${open ? `${accent}55` : T.border}`, background: disabled ? T.bg1 : `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
          color: T.t0, textAlign: 'left', boxShadow: open ? `0 14px 28px -24px ${accent}66, inset 0 0 0 1px ${accent}22` : 'none', cursor: disabled ? 'default' : 'pointer',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ minWidth: 0, color: accent, fontSize: FONT_SIZE.sm, fontWeight: 700, fontFamily: FONT_CODE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value ? formatDisplayRevision(value.revision) : t('splitHeaderVersionUnknown')}
          </span>
        </div>
        <span aria-hidden="true" style={{ flexShrink: 0, color: open ? accent : T.t2, fontSize: UI.metaSize, fontFamily: FONT_UI }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', ...panelAlignStyle, zIndex: 72, width: UI.panelWidth, borderRadius: UI.panelRadius, border: `1px solid ${T.border}`, background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`, boxShadow: `0 24px 48px -28px ${T.border2}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gap: 10, padding: 12, borderBottom: `1px solid ${T.border}`, background: `linear-gradient(180deg, ${accent}08 0%, ${T.bg1} 100%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 2 }}>
                <span style={{ color: accent, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('revisionPickerTimeline')}</span>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontFamily: FONT_UI }}>{t('revisionPickerResultsLoaded', { visible: visibleCount, total: options.length })}</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {deferredSearchQuery && <span style={{ display: 'inline-flex', alignItems: 'center', height: UI.inputHeight, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg2, color: T.t2, fontSize: FONT_SIZE.xs, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>{t('revisionPickerSearchActive')}</span>}
                {queryDateTime && <span style={{ display: 'inline-flex', alignItems: 'center', height: UI.inputHeight, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg2, color: T.t2, fontSize: FONT_SIZE.xs, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>{t('revisionPickerScopedTo', { date: queryDateTime.replace('T', ' ') })}</span>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>{t('revisionPickerSearchLabel')}</span>
                <input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.currentTarget.value)} placeholder={t('revisionPickerSearchPlaceholder')} style={getFieldStyle(T, controlColorScheme)} />
              </label>
              <div style={{ display: 'grid', gap: 4, alignSelf: 'stretch' }}>
                <span style={{ visibility: 'hidden', fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>.</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', height: UI.inputHeight, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg2, color: T.t2, fontSize: FONT_SIZE.xs, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>{t('revisionPickerSearchScope')}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
              <div style={{ display: 'grid', gap: 4, flex: '1 1 184px', minWidth: 156 }}>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>{t('revisionPickerDateLabel')}</span>
                <RevisionDatePicker
                  value={draftDate}
                  accent={accent}
                  disabled={disabled}
                  onChange={setDraftDate}
                  onClear={() => {
                    setDraftDate('');
                    onQueryDateTime?.('');
                  }}
                />
              </div>
              <label style={{ display: 'grid', gap: 4, flex: '0 0 68px' }}>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>{t('revisionPickerHourLabel')}</span>
                <input type="text" inputMode="numeric" value={draftHour} onChange={(event) => setDraftHour(sanitizeNumericDraft(event.currentTarget.value))} onBlur={() => setDraftHour((current) => clampTimePart(current, 23, '23'))} onKeyDown={handleDateFilterKeyDown} style={getCodeFieldStyle(T)} />
              </label>
              <label style={{ display: 'grid', gap: 4, flex: '0 0 68px' }}>
                <span style={{ color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI }}>{t('revisionPickerMinuteLabel')}</span>
                <input type="text" inputMode="numeric" value={draftMinute} onChange={(event) => setDraftMinute(sanitizeNumericDraft(event.currentTarget.value))} onBlur={() => setDraftMinute((current) => clampTimePart(current, 59, '59'))} onKeyDown={handleDateFilterKeyDown} style={getCodeFieldStyle(T)} />
              </label>
              <div style={{ flex: `0 0 ${UI.topActionWidth}px`, width: UI.topActionWidth, minWidth: UI.topActionWidth }}>
                <button
                  type="button"
                  disabled={!hasActiveFilter && !isSearchingDateTime}
                  onClick={handleClearFilters}
                  style={{
                    width: '100%',
                    height: UI.actionHeight,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: T.bg2,
                    color: hasActiveFilter ? T.t1 : T.t2,
                    fontSize: FONT_SIZE.xs,
                    fontWeight: 600,
                    fontFamily: FONT_UI,
                    cursor: hasActiveFilter ? 'pointer' : 'default',
                    whiteSpace: 'nowrap',
                  }}>
                  {t('revisionPickerClearFilters')}
                </button>
              </div>
            </div>
            {queryError && <span style={{ color: T.delTx, fontSize: UI.metaSize, fontFamily: FONT_UI }}>{queryError}</span>}
          </div>

          <div style={{ position: 'relative', padding: '10px 12px 12px' }}>
            <div ref={listRef} onScroll={handleListScroll} style={{ maxHeight: UI.listMaxHeight, overflowY: 'auto', overflowX: 'hidden', border: `1px solid ${T.border}`, borderRadius: 14, background: T.bg1, scrollbarWidth: 'thin' }}>
              {showRevisionHeader && (
                <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, padding: '7px 12px', borderBottom: `1px solid ${T.border}`, background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)` }}>
                  <div style={{ flex: `0 0 ${UI.rowLeftWidth}px`, width: UI.rowLeftWidth, minWidth: 0, color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {t('revisionPickerColumnRevision')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0, flex: '1 1 auto', color: T.t2, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <span>{t('revisionPickerColumnMessage')}</span>
                    <span>{t('revisionPickerColumnMeta')}</span>
                  </div>
                </div>
              )}
              {filteredRevisionOptions.length > 0 && filteredRevisionOptions.map((option) => renderOption(option))}
              {!isLoading && !isSearchingDateTime && !hasVisibleRows && (
                <div style={{ display: 'grid', gap: 10, padding: '28px 18px', textAlign: 'center' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      justifySelf: 'center',
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${accent}12`,
                      border: `1px solid ${accent}22`,
                    }}>
                    <CalendarGlyph color={accent} />
                  </span>
                  <span style={{ color: T.t1, fontSize: FONT_SIZE.xs, fontWeight: 700, fontFamily: FONT_UI }}>
                    {emptyPrimaryText}
                  </span>
                  {emptySecondaryText && <span style={{ color: T.t2, fontSize: UI.metaSize, fontFamily: FONT_UI }}>{emptySecondaryText}</span>}
                </div>
              )}
              {(isLoading || isSearchingDateTime) && (
                <div style={{ padding: '22px 16px', color: T.t2, fontSize: FONT_SIZE.xs, fontFamily: FONT_UI, textAlign: 'center' }}>
                  {isSearchingDateTime ? t('revisionPickerQuerying') : t('appLoadingDiff')}
                </div>
              )}
            </div>
            {showScrollTop && (
              <button type="button" onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} style={{ position: 'absolute', right: 20, bottom: 18, height: 30, padding: '0 10px', borderRadius: 999, border: `1px solid ${T.border}`, background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`, color: T.t1, fontSize: UI.metaSize, fontWeight: 700, fontFamily: FONT_UI, boxShadow: `0 12px 28px -24px ${T.border2}`, cursor: 'pointer' }}>
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
