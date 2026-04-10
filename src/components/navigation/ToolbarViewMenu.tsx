import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { WorkbookCompareMode } from '@/types';
import Tooltip from '@/components/shared/Tooltip';

const DEFAULT_VIEW_STATE = {
  collapseCtx: true,
  showWhitespace: false,
  showHiddenColumns: false,
  workbookCompareMode: 'strict' as WorkbookCompareMode,
  fontSize: 14,
};
const MENU_WIDTH = 292;
const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;

interface ToolbarViewMenuProps {
  collapseCtx: boolean;
  setCollapseCtx: React.Dispatch<React.SetStateAction<boolean>>;
  showWhitespace: boolean;
  setShowWhitespace: React.Dispatch<React.SetStateAction<boolean>>;
  showHiddenColumns: boolean;
  setShowHiddenColumns: React.Dispatch<React.SetStateAction<boolean>>;
  workbookCompareMode: WorkbookCompareMode;
  setWorkbookCompareMode: (mode: WorkbookCompareMode) => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  isWorkbookMode: boolean;
  showLabel: boolean;
  noDragStyle?: CSSProperties | undefined;
  anchorStyle?: CSSProperties | undefined;
}

const ToolbarViewMenu = memo(({
  collapseCtx, setCollapseCtx,
  showWhitespace, setShowWhitespace,
  showHiddenColumns, setShowHiddenColumns,
  workbookCompareMode, setWorkbookCompareMode,
  fontSize, setFontSize,
  isWorkbookMode, showLabel,
  noDragStyle, anchorStyle,
}: ToolbarViewMenuProps) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const interactiveStyle = noDragStyle ?? {};

  const updateAnchorRect = () => {
    const nextRect = rootRef.current?.getBoundingClientRect();
    if (nextRect) setAnchorRect(nextRect);
  };

  useEffect(() => {
    if (!open) return;
    updateAnchorRect();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target ?? null)) return;
      if (menuRef.current?.contains(target ?? null)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const handleLayout = () => updateAnchorRect();
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleLayout);
    window.addEventListener('scroll', handleLayout, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleLayout);
      window.removeEventListener('scroll', handleLayout, true);
    };
  }, [open]);

  const viewStateCount = useMemo(() => {
    let count = 0;
    if (collapseCtx !== DEFAULT_VIEW_STATE.collapseCtx) count += 1;
    if (showWhitespace !== DEFAULT_VIEW_STATE.showWhitespace) count += 1;
    if (isWorkbookMode && showHiddenColumns !== DEFAULT_VIEW_STATE.showHiddenColumns) count += 1;
    if (isWorkbookMode && workbookCompareMode !== DEFAULT_VIEW_STATE.workbookCompareMode) count += 1;
    if (fontSize !== DEFAULT_VIEW_STATE.fontSize) count += 1;
    return count;
  }, [collapseCtx, fontSize, isWorkbookMode, showHiddenColumns, showWhitespace, workbookCompareMode]);

  const ToggleRow = ({
    checked, label, onClick, tooltip,
  }: {
    checked: boolean; label: string; onClick: () => void; tooltip: string;
  }) => (
    <Tooltip content={tooltip} anchorStyle={anchorStyle}>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={onClick}
        className={`
          min-h-[38px] px-3 rounded-xl border font-ui text-[13px] font-semibold
          flex items-center justify-between gap-3 cursor-pointer text-left
          transition-all duration-150
          ${checked
            ? 'border-accent/25 bg-[var(--accent)]/[0.07] text-accent'
            : 'border-border-default bg-bg-base text-text-title'
          }
          hover:border-accent/40
        `}
        style={interactiveStyle}>
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`w-[30px] h-[18px] p-0.5 rounded-full inline-flex items-center shrink-0 transition-all duration-150 ${checked ? 'justify-end bg-accent' : 'justify-start bg-bg-elevated'}`}>
          <span className={`size-3 rounded-full ${checked ? 'bg-btn-active-text' : 'bg-text-secondary'}`} />
        </span>
      </button>
    </Tooltip>
  );

  const CompareModeButton = ({
    active, label, onClick, tooltip, testId,
  }: {
    active: boolean; label: string; onClick: () => void; tooltip: string; testId?: string;
  }) => (
    <Tooltip content={tooltip} anchorStyle={anchorStyle}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={active}
        data-testid={testId}
        onClick={onClick}
        className={`
          min-h-[42px] px-3 rounded-xl border font-ui text-[13px] font-bold
          cursor-pointer transition-all duration-150
          ${active
            ? 'border-accent/25 bg-[var(--accent)]/[0.07] text-accent'
            : 'border-border-default bg-bg-base text-text-title hover:border-accent/40'
          }
        `}
        style={interactiveStyle}>
        {label}
      </button>
    </Tooltip>
  );

  const menuLayout = useMemo(() => {
    if (!anchorRect || typeof window === 'undefined') return null;
    const left = Math.min(
      Math.max(anchorRect.right - MENU_WIDTH, VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING),
    );
    return { left, top: anchorRect.bottom + MENU_GAP };
  }, [anchorRect]);

  const menu = open && menuLayout && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="menu"
        className="motion-floating-panel fixed p-2 rounded-2xl border border-border-default bg-bg-surface-solid grid gap-2.5 z-[120]"
        style={{
          top: menuLayout.top,
          left: menuLayout.left,
          width: MENU_WIDTH,
          boxShadow: `0 18px 44px -26px var(--border-strong)`,
          ...interactiveStyle,
        }}>
        <div className="grid gap-1.5">
          <div className="text-[11px] font-ui font-bold text-text-secondary tracking-wider uppercase">{t('toolbarSectionDisplay')}</div>
          <ToggleRow checked={collapseCtx} onClick={() => setCollapseCtx((v) => !v)} label={collapseCtx ? t('toolbarExpandAllLabel') : t('toolbarCollapseLabel')} tooltip={t('toolbarCollapseTitle')} />
          <ToggleRow checked={showWhitespace} onClick={() => setShowWhitespace((v) => !v)} label={t('toolbarWhitespaceLabel')} tooltip={t('toolbarWhitespaceTitle')} />
          {isWorkbookMode && (
            <ToggleRow checked={showHiddenColumns} onClick={() => setShowHiddenColumns((v) => !v)} label={t('toolbarHiddenColumnsLabel')} tooltip={t('toolbarHiddenColumnsTitle')} />
          )}
        </div>

        {isWorkbookMode && (
          <>
            <div className="h-px bg-border-default" />
            <div className="grid gap-1.5">
              <div className="text-[11px] font-ui font-bold text-text-secondary tracking-wider uppercase">{t('toolbarSectionCompare')}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <CompareModeButton
                  active={workbookCompareMode === 'content'}
                  label={t('toolbarCompareModeContent')}
                  onClick={() => setWorkbookCompareMode('content')}
                  tooltip={t('toolbarCompareModeContentTitle')}
                  testId="toolbar-compare-content"
                />
                <CompareModeButton
                  active={workbookCompareMode === 'strict'}
                  label={t('toolbarCompareModeStrict')}
                  onClick={() => setWorkbookCompareMode('strict')}
                  tooltip={t('toolbarCompareModeStrictTitle')}
                  testId="toolbar-compare-strict"
                />
              </div>
            </div>
          </>
        )}

        <div className="h-px bg-border-default" />

        <div className="grid gap-2">
          <div className="text-[11px] font-ui font-bold text-text-secondary tracking-wider uppercase">{t('toolbarSectionFont')}</div>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-0.5 rounded-xl border border-border-default bg-bg-surface-hover" style={interactiveStyle}>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.max(10, s - 1))}
                className="min-w-7 h-7 rounded-lg border-none bg-transparent text-text-title font-ui text-[13px] font-bold cursor-pointer hover:bg-bg-elevated active:scale-95 transition-all duration-150"
                style={interactiveStyle}>
                A-
              </button>
              <span className="min-w-7 text-center text-text-primary font-code text-[13px]">{fontSize}</span>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.min(20, s + 1))}
                className="min-w-7 h-7 rounded-lg border-none bg-transparent text-text-title font-ui text-[13px] font-bold cursor-pointer hover:bg-bg-elevated active:scale-95 transition-all duration-150"
                style={interactiveStyle}>
                A+
              </button>
            </div>
            <span className="text-[11px] text-text-secondary font-ui whitespace-nowrap">10px - 20px</span>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className="relative shrink-0" style={noDragStyle}>
      <Tooltip content={t('toolbarViewTitle')} anchorStyle={anchorStyle}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="toolbar-view-menu"
          onClick={() => setOpen((v) => !v)}
          className={`
            h-8 rounded-[10px] border border-border-default
            bg-bg-surface-hover font-ui text-[13px] font-bold
            inline-flex items-center gap-2 cursor-pointer whitespace-nowrap
            transition-all duration-150
            hover:-translate-y-px hover:border-border-strong hover:shadow-sm
            ${open ? 'text-accent' : 'text-text-title'}
          `}
          style={{
            padding: showLabel ? '0 10px 0 12px' : '0 10px',
            ...interactiveStyle,
          }}>
          {showLabel && <span>{t('toolbarViewLabel')}</span>}
          {viewStateCount > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-extrabold inline-flex items-center justify-center"
              style={{ background: cssAlpha('acc', '16'), color: cssVar('acc') }}>
              {viewStateCount}
            </span>
          )}
          <ChevronDown size={10} />
        </button>
      </Tooltip>
      {menu}
    </div>
  );
});

export default ToolbarViewMenu;
