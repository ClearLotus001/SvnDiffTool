// src/components/navigation/RevisionDatePicker.tsx
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlphaRaw, cssVar } from '@/theme/cssUtils';
import {
  RP_UI,
  FLOATING_PANEL_GAP,
  FLOATING_PANEL_VIEWPORT_PADDING,
  buildCalendarDayCells,
  buildDateValueFromDate,
  buildMonthKey,
  buildMonthLabels,
  buildWeekdayLabels,
  buildYearChoices,
  computeFloatingPanelLayout,
  formatDateDisplayValue,
  formatMonthDisplay,
  parseMonthKey,
  shiftMonthKey,
} from '@/utils/navigation/revisionPickerUtils';

interface RevisionDatePickerProps {
  value: string;
  accent: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onClear?: (() => void) | undefined;
}

const RevisionDatePicker = memo(({
  value, accent, disabled = false, onChange, onClear,
}: RevisionDatePickerProps) => {
  const { t, locale } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const todayValue = useMemo(() => buildDateValueFromDate(new Date()), []);
  const initialMonthKey = useMemo(() => (value ? value.slice(0, 7) : todayValue.slice(0, 7)), [todayValue, value]);
  const initialMonthMeta = useMemo(
    () => parseMonthKey(initialMonthKey) ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    [initialMonthKey],
  );
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => initialMonthKey);
  const [quickMode, setQuickMode] = useState<'day' | 'month' | 'year'>('day');
  const [yearGridStart, setYearGridStart] = useState(() => initialMonthMeta.year - 5);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: RP_UI.calendarWidth, height: 360 });

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useEffect(() => {
    if (open) return;
    setViewMonth(value ? value.slice(0, 7) : todayValue.slice(0, 7));
    const nextMonthMeta = parseMonthKey(value ? value.slice(0, 7) : todayValue.slice(0, 7));
    if (nextMonthMeta) setYearGridStart(nextMonthMeta.year - 5);
    setQuickMode('day');
  }, [open, todayValue, value]);

  useEffect(() => {
    if (!open) return undefined;
    const updateRect = () => {
      const nextRect = wrapperRef.current?.getBoundingClientRect();
      if (nextRect) setAnchorRect(nextRect);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current?.contains(target ?? null) || panelRef.current?.contains(target ?? null)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    updateRect();
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  const viewMonthMeta = useMemo(() => parseMonthKey(viewMonth) ?? initialMonthMeta, [initialMonthMeta, viewMonth]);
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale), [locale]);
  const monthLabels = useMemo(() => buildMonthLabels(locale), [locale]);
  const yearChoices = useMemo(() => buildYearChoices(yearGridStart), [yearGridStart]);
  const dayCells = useMemo(() => buildCalendarDayCells(viewMonth, value), [viewMonth, value]);
  const hasValue = Boolean(value);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const nextWidth = Math.ceil(panel.offsetWidth);
    const nextHeight = Math.ceil(panel.offsetHeight);
    setPanelSize((prev) => (prev.width === nextWidth && prev.height === nextHeight ? prev : { width: nextWidth, height: nextHeight }));
  }, [dayCells, monthLabels, open, quickMode, value, viewMonth, weekdayLabels, yearChoices]);

  const panelLayout = useMemo(() => {
    if (!open || !anchorRect || typeof window === 'undefined') return null;
    return computeFloatingPanelLayout(anchorRect, window.innerWidth, window.innerHeight, panelSize.width, panelSize.height);
  }, [anchorRect, open, panelSize.height, panelSize.width]);

  // ── 通用网格按钮样式 ──
  const gridBtnCls = 'h-[34px] rounded-[10px] border font-ui text-[11px] cursor-pointer transition-all duration-150 hover:brightness-110';
  const navBtnCls = 'size-[30px] rounded-[9px] border border-border-default bg-bg-surface-hover text-text-primary cursor-pointer inline-flex items-center justify-center hover:text-accent hover:border-accent active:scale-95 transition-all duration-150';

  const panelContent = (
    <div
      ref={panelRef}
      className="motion-floating-panel fixed z-[120] p-2.5 rounded-2xl border border-border-default overflow-x-hidden overflow-y-auto"
      style={{
        top: panelLayout?.top ?? ((anchorRect?.bottom ?? 0) + FLOATING_PANEL_GAP),
        left: panelLayout?.left ?? (anchorRect?.left ?? FLOATING_PANEL_VIEWPORT_PADDING),
        width: `min(${RP_UI.calendarWidth}px, calc(100vw - 24px))`,
        maxWidth: RP_UI.calendarWidth,
        maxHeight: 'calc(100vh - 24px)',
        background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
        boxShadow: `0 22px 40px -28px ${cssVar('border2')}`,
      }}>
      {/* 月导航 */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button type="button" className={navBtnCls} onClick={() => { setViewMonth((c) => shiftMonthKey(c, -1)); setQuickMode('day'); }}>
          <ChevronLeft size={14} />
        </button>
        <div className="min-w-0 text-text-title text-[11px] font-bold font-ui tracking-wide">
          {formatMonthDisplay(viewMonth, locale)}
        </div>
        <button type="button" className={navBtnCls} onClick={() => { setViewMonth((c) => shiftMonthKey(c, 1)); setQuickMode('day'); }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 年/月快选切换 */}
      <div className="grid grid-cols-2 gap-1.5 mb-2.5">
        <button
          type="button"
          className={gridBtnCls}
          style={{
            borderColor: quickMode === 'year' ? cssAlphaRaw(accent, '33') : undefined,
            background: quickMode === 'year' ? cssAlphaRaw(accent, '12') : undefined,
            color: quickMode === 'year' ? `var(${accent})` : undefined,
          }}
          onClick={() => { setYearGridStart(viewMonthMeta.year - 5); setQuickMode((c) => (c === 'year' ? 'day' : 'year')); }}>
          {viewMonthMeta.year}
        </button>
        <button
          type="button"
          className={gridBtnCls}
          style={{
            borderColor: quickMode === 'month' ? cssAlphaRaw(accent, '33') : undefined,
            background: quickMode === 'month' ? cssAlphaRaw(accent, '12') : undefined,
            color: quickMode === 'month' ? `var(${accent})` : undefined,
          }}
          onClick={() => setQuickMode((c) => (c === 'month' ? 'day' : 'month'))}>
          {monthLabels[viewMonthMeta.month - 1] ?? `${viewMonthMeta.month}`}
        </button>
      </div>

      {/* 年份网格 */}
      {quickMode === 'year' && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={navBtnCls} onClick={() => setYearGridStart((c) => c - 12)}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-text-secondary text-[10px] font-bold font-ui">{`${yearGridStart} - ${yearGridStart + 11}`}</span>
            <button type="button" className={navBtnCls} onClick={() => setYearGridStart((c) => c + 12)}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {yearChoices.map((year) => {
              const selected = year === viewMonthMeta.year;
              return (
                <button key={year} type="button" className={gridBtnCls}
                  style={{
                    borderColor: selected ? `var(${accent})` : undefined,
                    background: selected ? cssAlphaRaw(accent, '14') : undefined,
                    color: selected ? `var(${accent})` : undefined,
                    fontWeight: selected ? 700 : 600,
                  }}
                  onClick={() => { setViewMonth(buildMonthKey(year, viewMonthMeta.month)); setYearGridStart(year - 5); setQuickMode('day'); }}>
                  {year}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 月份网格 */}
      {quickMode === 'month' && (
        <div className="grid grid-cols-4 gap-1.5">
          {monthLabels.map((label, index) => {
            const month = index + 1;
            const selected = month === viewMonthMeta.month;
            return (
              <button key={`${label}-${month}`} type="button" className={gridBtnCls}
                style={{
                  borderColor: selected ? `var(${accent})` : undefined,
                  background: selected ? cssAlphaRaw(accent, '14') : undefined,
                  color: selected ? `var(${accent})` : undefined,
                  fontWeight: selected ? 700 : 600,
                }}
                onClick={() => { setViewMonth(buildMonthKey(viewMonthMeta.year, month)); setQuickMode('day'); }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* 日期网格 */}
      {quickMode === 'day' && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekdayLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="inline-flex items-center justify-center h-[22px] text-text-secondary text-[10px] font-bold font-ui uppercase tracking-wide">
              {label}
            </span>
          ))}
          {dayCells.map((cell) => {
            const dayColor = cell.isSelected ? 'var(--btn-active-text)' : cell.inMonth ? cssVar('t0') : cssVar('t2');
            return (
              <button
                key={cell.dateValue}
                type="button"
                className="w-full rounded-[10px] border font-ui text-[11px] cursor-pointer transition-all duration-150 hover:brightness-110"
                style={{
                  height: RP_UI.calendarDaySize,
                  border: `1px solid ${cell.isSelected ? `var(${accent})` : cell.isToday ? cssAlphaRaw(accent, '48') : 'transparent'}`,
                  background: cell.isSelected
                    ? `linear-gradient(180deg, var(${accent}) 0%, ${cssAlphaRaw(accent, 'cc')} 100%)`
                    : cell.isToday ? cssAlphaRaw(accent, '14') : 'transparent',
                  color: dayColor,
                  fontWeight: cell.isSelected || cell.isToday ? 700 : 500,
                  boxShadow: cell.isSelected ? `0 12px 26px -24px ${cssAlphaRaw(accent, 'bb')}` : 'none',
                }}
                onClick={() => { onChange(cell.dateValue); setViewMonth(cell.dateValue.slice(0, 7)); setOpen(false); }}>
                {cell.dayLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-between gap-2 mt-2.5">
        <button
          type="button"
          className="h-[30px] px-3 rounded-full border border-border-default bg-bg-surface-hover text-text-secondary text-[10px] font-semibold font-ui cursor-pointer hover:text-text-primary active:scale-95 transition-all duration-150"
          onClick={() => { onClear?.(); setOpen(false); }}>
          {t('revisionPickerDateClear')}
        </button>
        <button
          type="button"
          className="h-[30px] px-3 rounded-full text-[10px] font-bold font-ui cursor-pointer hover:brightness-110 active:scale-95 transition-all duration-150"
          style={{
            border: `1px solid ${cssAlphaRaw(accent, '28')}`,
            background: cssAlphaRaw(accent, '10'),
            color: `var(${accent})`,
          }}
          onClick={() => { onChange(todayValue); setViewMonth(todayValue.slice(0, 7)); setOpen(false); }}>
          {t('revisionPickerDateToday')}
        </button>
      </div>
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((c) => !c)}
        className="w-full min-w-0 flex items-center justify-between gap-2.5 rounded-[10px] font-code text-[11px] outline-none"
        style={{
          height: RP_UI.inputHeight,
          padding: '0 10px',
          border: `1px solid ${open ? cssAlphaRaw(accent, '55') : cssVar('border')}`,
          background: cssVar('bg2'),
          color: hasValue ? cssVar('t0') : cssVar('t2'),
          cursor: disabled ? 'default' : 'pointer',
          boxShadow: open ? `0 16px 30px -26px ${cssAlphaRaw(accent, '66')}, inset 0 0 0 1px ${cssAlphaRaw(accent, '14')}` : 'none',
        }}>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap tracking-wide">
          {formatDateDisplayValue(value)}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 size-6 rounded-lg inline-flex items-center justify-center box-border"
          style={{
            background: open ? cssAlphaRaw(accent, '16') : 'transparent',
            color: open ? `var(${accent})` : cssVar('t2'),
            border: open ? `1px solid ${cssAlphaRaw(accent, '28')}` : '1px solid transparent',
          }}>
          <Calendar size={14} />
        </span>
      </button>
      {open && anchorRect && typeof document !== 'undefined' && createPortal(panelContent, document.body)}
    </div>
  );
});

export default RevisionDatePicker;
