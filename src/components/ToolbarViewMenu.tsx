import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { WorkbookCompareMode } from '../types';
import Tooltip from './Tooltip';

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
  collapseCtx,
  setCollapseCtx,
  showWhitespace,
  setShowWhitespace,
  showHiddenColumns,
  setShowHiddenColumns,
  workbookCompareMode,
  setWorkbookCompareMode,
  fontSize,
  setFontSize,
  isWorkbookMode,
  showLabel,
  noDragStyle,
  anchorStyle,
}: ToolbarViewMenuProps) => {
  const T = useTheme();
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
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

  const sectionTitleStyle: CSSProperties = {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_UI,
    fontWeight: 700,
    color: T.t2,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  };

  const ToggleRow = ({
    checked,
    label,
    onClick,
    tooltip,
  }: {
    checked: boolean;
    label: string;
    onClick: () => void;
    tooltip: string;
  }) => (
    <Tooltip content={tooltip} anchorStyle={anchorStyle}>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={onClick}
        style={{
          minHeight: 38,
          padding: '0 12px',
          borderRadius: 12,
          border: `1px solid ${checked ? `${T.acc}44` : T.border}`,
          background: checked ? `${T.acc}12` : T.bg0,
          color: checked ? T.acc : T.t0,
          fontFamily: FONT_UI,
          fontSize: FONT_SIZE.sm,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left',
          ...interactiveStyle,
        }}>
        <span>{label}</span>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 18,
            padding: 2,
            borderRadius: 999,
            background: checked ? T.acc : T.bg3,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: checked ? 'flex-end' : 'flex-start',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: checked ? '#fff' : T.t2,
            }}
          />
        </span>
      </button>
    </Tooltip>
  );

  const CompareModeButton = ({
    active,
    label,
    onClick,
    tooltip,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
    tooltip: string;
  }) => (
    <Tooltip content={tooltip} anchorStyle={anchorStyle}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={active}
        onClick={onClick}
        style={{
          minHeight: 42,
          padding: '0 12px',
          borderRadius: 12,
          border: `1px solid ${active ? `${T.acc}44` : T.border}`,
          background: active ? `${T.acc}12` : T.bg0,
          color: active ? T.acc : T.t0,
          fontFamily: FONT_UI,
          fontSize: FONT_SIZE.sm,
          fontWeight: 700,
          cursor: 'pointer',
          ...interactiveStyle,
        }}>
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

    return {
      left,
      top: anchorRect.bottom + MENU_GAP,
    };
  }, [anchorRect]);

  const menu = open && menuLayout && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: 'fixed',
          top: menuLayout.top,
          left: menuLayout.left,
          width: MENU_WIDTH,
          padding: 8,
          borderRadius: 16,
          border: `1px solid ${T.border}`,
          background: T.bg1,
          boxShadow: `0 18px 44px -26px ${T.border2}`,
          display: 'grid',
          gap: 10,
          zIndex: 120,
          ...interactiveStyle,
        }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={sectionTitleStyle}>{t('toolbarSectionDisplay')}</div>
          <ToggleRow
            checked={collapseCtx}
            onClick={() => setCollapseCtx((value) => !value)}
            label={collapseCtx ? t('toolbarExpandAllLabel') : t('toolbarCollapseLabel')}
            tooltip={t('toolbarCollapseTitle')}
          />
          <ToggleRow
            checked={showWhitespace}
            onClick={() => setShowWhitespace((value) => !value)}
            label={t('toolbarWhitespaceLabel')}
            tooltip={t('toolbarWhitespaceTitle')}
          />
          {isWorkbookMode && (
            <ToggleRow
              checked={showHiddenColumns}
              onClick={() => setShowHiddenColumns((value) => !value)}
              label={t('toolbarHiddenColumnsLabel')}
              tooltip={t('toolbarHiddenColumnsTitle')}
            />
          )}
        </div>

        {isWorkbookMode && (
          <>
            <div style={{ height: 1, background: T.border }} />

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={sectionTitleStyle}>{t('toolbarSectionCompare')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                <CompareModeButton
                  active={workbookCompareMode === 'content'}
                  label={t('toolbarCompareModeContent')}
                  onClick={() => setWorkbookCompareMode('content')}
                  tooltip={t('toolbarCompareModeContentTitle')}
                />
                <CompareModeButton
                  active={workbookCompareMode === 'strict'}
                  label={t('toolbarCompareModeStrict')}
                  onClick={() => setWorkbookCompareMode('strict')}
                  tooltip={t('toolbarCompareModeStrictTitle')}
                />
              </div>
            </div>
          </>
        )}

        <div style={{ height: 1, background: T.border }} />

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={sectionTitleStyle}>{t('toolbarSectionFont')}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 2,
                borderRadius: 12,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                ...interactiveStyle,
              }}>
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.max(10, size - 1))}
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: T.t0,
                  fontFamily: FONT_UI,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...interactiveStyle,
                }}>
                A-
              </button>
              <span style={{ minWidth: 28, textAlign: 'center', color: T.t1, fontFamily: FONT_CODE, fontSize: FONT_SIZE.sm }}>
                {fontSize}
              </span>
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.min(20, size + 1))}
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: T.t0,
                  fontFamily: FONT_UI,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...interactiveStyle,
                }}>
                A+
              </button>
            </div>
            <span style={{ fontSize: FONT_SIZE.xs, color: T.t2, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>
              10px - 20px
            </span>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0, ...noDragStyle }}>
      <Tooltip content={t('toolbarViewTitle')} anchorStyle={anchorStyle}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{
            height: 32,
            padding: showLabel ? '0 10px 0 12px' : '0 10px',
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            color: open ? T.acc : T.t0,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box',
            ...interactiveStyle,
          }}>
          {showLabel && <span>{t('toolbarViewLabel')}</span>}
          {viewStateCount > 0 && (
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: '0 6px',
                borderRadius: 999,
                background: `${T.acc}16`,
                color: T.acc,
                fontSize: 10,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}>
              {viewStateCount}
            </span>
          )}
            <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>▼</span>
        </button>
      </Tooltip>
      {menu}
    </div>
  );
});

export default ToolbarViewMenu;
