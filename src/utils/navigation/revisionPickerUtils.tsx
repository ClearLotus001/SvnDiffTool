// src/utils/navigation/revisionPickerUtils.ts
// RevisionPicker 纯工具函数 — 日期计算、搜索、布局定位
import type { CSSProperties, ReactNode } from 'react';
import type { SvnRevisionInfo } from '@/types';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import type { Locale } from '@/context/i18n';

export const RP_UI = {
  triggerPadding: '0 6px',
  triggerHeight: 20,
  triggerRadius: 5,
  metaSize: 10,
  inputHeight: 34,
  actionHeight: 32,
  rowLeftWidth: 108,
  rowPadding: '8px 12px',
  panelPreferredWidth: 712,
  panelMinWidth: 360,
  panelRadius: 18,
  listMaxHeight: 334,
  topActionWidth: 124,
  calendarWidth: 286,
  calendarDaySize: 34,
} as const;

export const FLOATING_PANEL_VIEWPORT_PADDING = 12;
export const FLOATING_PANEL_GAP = 8;

// ── 版本格式化 ──────────────────────────────────────────────────────────────

export function formatDisplayRevision(revision: string): string {
  return revision.replace(/^r/i, '');
}

export function buildRevisionOptionDescription(option: SvnRevisionInfo): string {
  const title = option.title && option.title !== option.revision ? option.title.trim() : '';
  return option.message.trim() || title;
}

export function buildRevisionOptionMeta(option: SvnRevisionInfo): string {
  return [option.author, option.date].filter(Boolean).join(' · ');
}

export function buildRevisionSearchText(option: SvnRevisionInfo): string {
  return [option.revision, option.title, option.author, option.date, option.message].join(' ').toLowerCase();
}

// ── 日期时间工具 ────────────────────────────────────────────────────────────

export function parseDateTimeDraft(value: string): { date: string; hour: string; minute: string } {
  if (!value) return { date: '', hour: '23', minute: '59' };
  const [date = '', time = '23:59'] = value.split('T');
  const [hour = '23', minute = '59'] = time.split(':');
  return { date, hour, minute };
}

export function sanitizeNumericDraft(value: string, maxDigits = 2): string {
  return value.replace(/\D+/g, '').slice(0, maxDigits);
}

export function clampTimePart(value: string, max: number, fallback: string): string {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return `${Math.max(0, Math.min(max, numeric))}`.padStart(2, '0');
}

export function buildQueryDateTime(date: string, hour: string, minute: string): string {
  if (!date.trim()) return '';
  return `${date}T${clampTimePart(hour, 23, '23')}:${clampTimePart(minute, 59, '59')}`;
}

function padDatePart(value: number): string {
  return `${value}`.padStart(2, '0');
}

function buildDateValue(year: number, month: number, day: number): string {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

export function buildDateValueFromDate(date: Date): string {
  return buildDateValue(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseDateValue(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const yearText = match[1] ?? '';
  const monthText = match[2] ?? '';
  const dayText = match[3] ?? '';
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function buildMonthKey(year: number, month: number): string {
  return `${year}-${padDatePart(month)}`;
}

export function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const yearText = match[1] ?? '';
  const monthText = match[2] ?? '';
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  const source = parsed ? new Date(parsed.year, parsed.month - 1, 1, 12) : new Date();
  const next = new Date(source.getFullYear(), source.getMonth() + delta, 1, 12);
  return buildMonthKey(next.getFullYear(), next.getMonth() + 1);
}

export function formatDateDisplayValue(value: string): string {
  const parsed = parseDateValue(value);
  if (!parsed) return 'YYYY/MM/DD';
  return `${parsed.year}/${padDatePart(parsed.month)}/${padDatePart(parsed.day)}`;
}

export function formatCalendarDateLabel(value: string, locale: Locale): string {
  const parsed = parseDateValue(value);
  if (!parsed) return value;
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(parsed.year, parsed.month - 1, parsed.day, 12));
  } catch {
    return value;
  }
}

export function formatMonthDisplay(monthKey: string, locale: Locale): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' })
      .format(new Date(parsed.year, parsed.month - 1, 1, 12));
  } catch {
    return `${parsed.year}-${padDatePart(parsed.month)}`;
  }
}

export function buildWeekdayLabels(locale: Locale): string[] {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (__, index) => formatter.format(new Date(2024, 0, 7 + index, 12)));
  } catch {
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  }
}

export function buildMonthLabels(locale: Locale): string[] {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    return Array.from({ length: 12 }, (__, index) => formatter.format(new Date(2024, index, 1, 12)));
  } catch {
    return Array.from({ length: 12 }, (__, index) => `${index + 1}`);
  }
}

export function buildYearChoices(startYear: number, count = 12): number[] {
  return Array.from({ length: count }, (__, index) => startYear + index);
}

export interface CalendarDayCell {
  dateValue: string;
  dayLabel: string;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}

export function buildCalendarDayCells(monthKey: string, selectedValue: string): CalendarDayCell[] {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return [];
  const firstOfMonth = new Date(parsed.year, parsed.month - 1, 1, 12);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(parsed.year, parsed.month - 1, 1 - startOffset, 12);
  const todayValue = buildDateValueFromDate(new Date());
  return Array.from({ length: 42 }, (__, index) => {
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

// ── 浮动面板定位 ─────────────────────────────────────────────────────────────

export function computeFloatingPanelLayout(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  panelWidth: number,
  panelHeight: number,
): { left: number; top: number } {
  const minLeft = FLOATING_PANEL_VIEWPORT_PADDING;
  const maxLeft = Math.max(FLOATING_PANEL_VIEWPORT_PADDING, viewportWidth - panelWidth - FLOATING_PANEL_VIEWPORT_PADDING);
  const leftAligned = rect.left;
  const rightAligned = rect.right - panelWidth;
  const fitsLeftAligned = leftAligned >= minLeft && leftAligned + panelWidth <= viewportWidth - FLOATING_PANEL_VIEWPORT_PADDING;
  const fitsRightAligned = rightAligned >= minLeft && rightAligned + panelWidth <= viewportWidth - FLOATING_PANEL_VIEWPORT_PADDING;

  let left: number;
  if (fitsLeftAligned) {
    left = leftAligned;
  } else if (fitsRightAligned) {
    left = rightAligned;
  } else {
    const clampedLeftAligned = Math.min(Math.max(leftAligned, minLeft), maxLeft);
    const clampedRightAligned = Math.min(Math.max(rightAligned, minLeft), maxLeft);
    left = Math.abs(clampedLeftAligned - leftAligned) <= Math.abs(clampedRightAligned - rightAligned)
      ? clampedLeftAligned
      : clampedRightAligned;
  }

  const canPlaceBottom = viewportHeight - rect.bottom >= panelHeight + FLOATING_PANEL_GAP + FLOATING_PANEL_VIEWPORT_PADDING;
  const canPlaceTop = rect.top >= panelHeight + FLOATING_PANEL_GAP + FLOATING_PANEL_VIEWPORT_PADDING;
  const top = canPlaceBottom || !canPlaceTop
    ? Math.min(rect.bottom + FLOATING_PANEL_GAP, Math.max(FLOATING_PANEL_VIEWPORT_PADDING, viewportHeight - panelHeight - FLOATING_PANEL_VIEWPORT_PADDING))
    : Math.max(FLOATING_PANEL_VIEWPORT_PADDING, rect.top - panelHeight - FLOATING_PANEL_GAP);

  return { left, top };
}

// ── 样式工具 ─────────────────────────────────────────────────────────────────

export function clampInlineText(lines: number): CSSProperties {
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' };
}

export function getFieldStyle(colorScheme: CSSProperties['colorScheme']): CSSProperties {
  return {
    width: '100%', minWidth: 0, height: RP_UI.inputHeight, padding: '0 10px', borderRadius: 10,
    border: `1px solid var(--border-color)`, background: 'var(--bg-surface-hover)', color: 'var(--text-title)', fontSize: FONT_SIZE.xs,
    fontFamily: FONT_UI, colorScheme, outline: 'none',
  };
}

export function getCodeFieldStyle(): CSSProperties {
  return {
    width: '100%', minWidth: 0, height: RP_UI.inputHeight, padding: '0 10px', borderRadius: 10,
    border: `1px solid var(--border-color)`, background: 'var(--bg-surface-hover)', color: 'var(--text-title)', fontSize: FONT_SIZE.xs,
    fontFamily: FONT_CODE, outline: 'none',
  };
}

// ── 高亮搜索文本 ─────────────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderHighlightedText(text: string, query: string, highlightStyle: CSSProperties): ReactNode {
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
