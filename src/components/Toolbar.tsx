// src/components/Toolbar.tsx
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import type { ThemeKey, LayoutMode, WorkbookCompareMode } from '../types';
import { THEMES } from '../theme';
import { useTheme } from '../context/theme';
import Tooltip from './Tooltip';

type IconName =
  | 'layoutUnified'
  | 'layoutSplit'
  | 'layoutVertical'
  | 'prev'
  | 'next'
  | 'search'
  | 'goto'
  | 'collapse'
  | 'expand'
  | 'whitespace'
  | 'hiddenColumns'
  | 'language'
  | 'file'
  | 'help'
  | 'brand'
  | 'chevronDown'
  | 'windowMinimize'
  | 'windowMaximize'
  | 'windowClose';

const LAYOUT_OPTIONS: {
  id: LayoutMode;
  labelKey: 'toolbarLayoutUnified' | 'toolbarLayoutSplit' | 'toolbarLayoutVertical';
  icon: IconName;
}[] = [
  { id: 'unified', labelKey: 'toolbarLayoutUnified',  icon: 'layoutUnified' },
  { id: 'split-h', labelKey: 'toolbarLayoutSplit',    icon: 'layoutSplit' },
  { id: 'split-v', labelKey: 'toolbarLayoutVertical', icon: 'layoutVertical' },
];

interface ToolbarProps {
  fileName: string;
  themeKey: ThemeKey;
  setThemeKey: (k: ThemeKey) => void;
  layout: LayoutMode;
  setLayout: (l: LayoutMode) => void;
  hunkIdx: number;
  totalHunks: number;
  hunkTargetLabel?: string;
  onPrev: () => void;
  onNext: () => void;
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  collapseCtx: boolean;
  setCollapseCtx: React.Dispatch<React.SetStateAction<boolean>>;
  showWhitespace: boolean;
  setShowWhitespace: React.Dispatch<React.SetStateAction<boolean>>;
  showHiddenColumns: boolean;
  setShowHiddenColumns: React.Dispatch<React.SetStateAction<boolean>>;
  workbookCompareMode: WorkbookCompareMode;
  setWorkbookCompareMode: React.Dispatch<React.SetStateAction<WorkbookCompareMode>>;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  onGoto: () => void;
  onHelp: () => void;
  isElectron: boolean;
  isWorkbookMode: boolean;
}

function Icon({ name, size = 12 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { flexShrink: 0 },
  };

  switch (name) {
    case 'layoutUnified':
      return (
        <svg {...common}>
          <path d="M3 4.5h10" />
          <path d="M3 8h10" />
          <path d="M3 11.5h10" />
        </svg>
      );
    case 'layoutSplit':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="2" />
          <path d="M8 3.5v9" />
        </svg>
      );
    case 'layoutVertical':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="2" />
          <path d="M6 3.5v9" />
          <path d="M10 3.5v9" />
        </svg>
      );
    case 'prev':
      return (
        <svg {...common}>
          <path d="M8 3.5 4.5 7 8 10.5" />
          <path d="M11.5 3.5 8 7l3.5 3.5" />
        </svg>
      );
    case 'next':
      return (
        <svg {...common}>
          <path d="m8 3.5 3.5 3.5L8 10.5" />
          <path d="M4.5 3.5 8 7l-3.5 3.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="3.5" />
          <path d="m10 10 3 3" />
        </svg>
      );
    case 'goto':
      return (
        <svg {...common}>
          <path d="M3 4h6.5" />
          <path d="m7 2 2.5 2L7 6" />
          <path d="M3 12h10" />
          <path d="m10 10 2.5 2-2.5 2" />
        </svg>
      );
    case 'collapse':
      return (
        <svg {...common}>
          <path d="M3 4h10" />
          <path d="M3 8h10" />
          <path d="M3 12h10" />
          <path d="m8 6.5-2 2 2 2" />
        </svg>
      );
    case 'expand':
      return (
        <svg {...common}>
          <path d="M3 4h10" />
          <path d="M3 8h10" />
          <path d="M3 12h10" />
          <path d="m6.5 8 2 2 2-2" />
        </svg>
      );
    case 'whitespace':
      return (
        <svg {...common}>
          <path d="M4 5.5v5" />
          <path d="M4 10.5c0-1.6 1.2-2.6 2.7-2.6S9.5 9 9.5 10.5V12" />
          <path d="M12 4v8" />
          <path d="M10.5 4h3" />
        </svg>
      );
    case 'hiddenColumns':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="3" height="10" rx="1" />
          <rect x="10.5" y="3" width="3" height="10" rx="1" />
          <path d="M7.5 3.5v9" strokeDasharray="1.5 1.5" />
        </svg>
      );
    case 'language':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M2.8 8h10.4" />
          <path d="M8 2.5c1.8 1.6 2.8 3.4 2.8 5.5S9.8 11.9 8 13.5" />
          <path d="M8 2.5C6.2 4.1 5.2 5.9 5.2 8S6.2 11.9 8 13.5" />
        </svg>
      );
    case 'file':
      return (
        <svg {...common}>
          <path d="M5 2.5h4l2.5 2.5v6A2 2 0 0 1 9.5 13h-4A2 2 0 0 1 3.5 11V4.5A2 2 0 0 1 5.5 2.5Z" />
          <path d="M9 2.5v3h3" />
        </svg>
      );
    case 'help':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M6.5 6a1.7 1.7 0 0 1 3 1c0 1.2-1.5 1.5-1.5 2.7" />
          <path d="M8 11.5h.01" />
        </svg>
      );
    case 'brand':
      return (
        <svg {...common} viewBox="0 0 20 20">
          <rect x="2.5" y="2.5" width="15" height="15" rx="5" fill="currentColor" stroke="none" />
          <path d="M6.5 12.5h7" stroke="#fff" />
          <path d="M6.5 8h4.5" stroke="#fff" />
          <path d="m11.5 6.5 2 2-2 2" stroke="#fff" />
        </svg>
      );
    case 'chevronDown':
      return (
        <svg {...common}>
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      );
    case 'windowMinimize':
      return (
        <svg {...common}>
          <path d="M4 8h8" />
        </svg>
      );
    case 'windowMaximize':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="8" height="8" rx="1.5" />
        </svg>
      );
    case 'windowClose':
      return (
        <svg {...common}>
          <path d="m4.5 4.5 7 7" />
          <path d="m11.5 4.5-7 7" />
        </svg>
      );
    default:
      return null;
  }
}

const Toolbar = memo((props: ToolbarProps) => {
  const {
    fileName,
    themeKey, setThemeKey, layout, setLayout,
    hunkIdx, totalHunks, hunkTargetLabel = '', onPrev, onNext,
    showSearch, setShowSearch, collapseCtx, setCollapseCtx,
    showWhitespace, setShowWhitespace, showHiddenColumns, setShowHiddenColumns,
    workbookCompareMode, setWorkbookCompareMode,
    fontSize, setFontSize,
    onGoto, onHelp, isElectron, isWorkbookMode,
  } = props;

  const T = useTheme();
  const { getThemeLabel, locale, setLocale, t } = useI18n();
  const nextLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
  const noDragStyle = isElectron ? { WebkitAppRegion: 'no-drag' as const } : undefined;
  const noDragAnchorStyle = noDragStyle as CSSProperties | undefined;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(1600);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setToolbarWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (themeMenuRef.current?.contains(target ?? null)) return;
      setThemeMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setThemeMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [themeMenuOpen]);

  const responsiveMode = useMemo(() => {
    if (toolbarWidth < 1024) return 'tight';
    if (toolbarWidth < 1180) return 'compact';
    if (toolbarWidth < 1440) return 'condensed';
    return 'regular';
  }, [toolbarWidth]);
  const showLayoutText = responsiveMode === 'regular';
  const showActionText = responsiveMode === 'regular';
  const showWhitespaceText = responsiveMode === 'regular' || responsiveMode === 'condensed';
  const showCompareModeText = responsiveMode !== 'tight';
  const showCompareModeStatusText = responsiveMode === 'regular' || responsiveMode === 'condensed';
  const showFileMeta = responsiveMode === 'regular';
  const showFileChip = responsiveMode !== 'tight';
  const showThemeLabel = responsiveMode === 'regular' || responsiveMode === 'condensed';
  const showLanguageText = responsiveMode !== 'tight';
  const compactFileMaxWidth = responsiveMode === 'compact' ? 148 : responsiveMode === 'condensed' ? 180 : 220;
  const groupGap = responsiveMode === 'tight' ? 2 : 3;
  const groupPadding = responsiveMode === 'tight' ? 1 : 2;

  const Btn = ({
    active = false, onClick, children, tooltip = '', compact = false, disabled = false,
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tooltip?: string;
    compact?: boolean;
    disabled?: boolean;
  }) => {
    const button = (
      <button onClick={onClick} disabled={disabled} aria-label={tooltip || undefined} style={{
      background: active ? `${T.acc}22` : 'transparent',
      border: `1px solid ${active ? `${T.acc}66` : 'transparent'}`,
      color: active ? T.acc : T.t0,
      padding: compact
        ? (responsiveMode === 'tight' ? '0 6px' : '0 8px')
        : (responsiveMode === 'tight' ? '0 8px' : '0 10px'),
      borderRadius: 8,
      fontSize: FONT_SIZE.sm,
      fontFamily: FONT_UI,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
      height: 28,
      minWidth: compact ? 28 : 'auto',
      lineHeight: 1,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...noDragStyle,
    }}>
      {children}
    </button>
    );
    return tooltip ? <Tooltip content={tooltip} anchorStyle={noDragAnchorStyle}>{button}</Tooltip> : button;
  };

  const Group = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: groupGap,
      padding: groupPadding,
      background: T.bg2,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      flexShrink: 0,
      ...noDragStyle,
    }}>
      {children}
    </div>
  );

  const windowButtonStyle = {
    background: 'transparent',
    border: 'none',
    color: T.t1,
    width: 28,
    height: 28,
    cursor: 'pointer',
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...noDragStyle,
  } as const;

  const ThemeMenu = () => (
    <div
      ref={themeMenuRef}
      style={{
        position: 'relative',
        ...noDragStyle,
      }}>
      <Tooltip content={getThemeLabel(themeKey)} anchorStyle={noDragAnchorStyle}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={themeMenuOpen}
          onClick={() => setThemeMenuOpen((open) => !open)}
          style={{
            height: 32,
            padding: showThemeLabel ? '0 10px 0 12px' : '0 10px',
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            color: T.t0,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box',
          }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: themeKey === 'dark' ? T.t0 : themeKey === 'light' ? T.acc : T.acc2,
              boxShadow: `0 0 0 3px ${T.bg1}`,
              flexShrink: 0,
            }}
          />
          {showThemeLabel && <span>{getThemeLabel(themeKey)}</span>}
          <Icon name="chevronDown" size={12} />
        </button>
      </Tooltip>
      {themeMenuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 176,
            padding: 6,
            borderRadius: 14,
            border: `1px solid ${T.border}`,
            background: T.bg1,
            boxShadow: `0 16px 40px -24px ${T.border2}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            zIndex: 80,
          }}>
          {(Object.keys(THEMES) as ThemeKey[]).map((k) => {
            const active = themeKey === k;
            return (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setThemeKey(k);
                  setThemeMenuOpen(false);
                }}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: `1px solid ${active ? `${T.acc}44` : 'transparent'}`,
                  background: active ? `${T.acc}16` : 'transparent',
                  color: active ? T.acc : T.t0,
                  fontFamily: FONT_UI,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: active ? 700 : 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}>
                <span>{getThemeLabel(k)}</span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: k === 'dark' ? T.t0 : k === 'light' ? T.acc : T.acc2,
                    opacity: active ? 1 : 0.55,
                    flexShrink: 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
      borderBottom: `1px solid ${T.border}`,
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 8,
      padding: '6px 8px',
      minHeight: 44,
      flexShrink: 0,
      minWidth: 0,
      overflow: 'visible',
      position: 'relative',
      zIndex: 20,
      ...(isElectron ? { WebkitAppRegion: 'drag' as const } : {}),
    }} ref={rootRef}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        alignContent: 'center',
        flexWrap: 'nowrap',
        gap: 6,
        minWidth: 0,
        flex: '1 1 auto',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginRight: 2,
          flexShrink: 0,
          padding: '2px 4px 2px 0',
          ...noDragStyle,
        }}>
          <div style={{
            width: 28,
            height: 28,
            background: T.acc,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            <Icon name="brand" size={14} />
          </div>
          <span style={{ fontWeight: 700, fontSize: FONT_SIZE.md, letterSpacing: -0.1, color: T.t0, whiteSpace: 'nowrap', fontFamily: FONT_UI }}>
            SvnDiffTool
          </span>
        </div>

        {showFileChip && fileName && (
          <Tooltip content={fileName} maxWidth={320} anchorStyle={noDragAnchorStyle}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                maxWidth: compactFileMaxWidth,
                padding: '0 8px',
                height: 28,
                borderRadius: 999,
                background: T.bg2,
                border: `1px solid ${T.border}`,
                color: T.t0,
                flexShrink: 1,
                flexBasis: 220,
                ...noDragStyle,
              }}>
              <span style={{ color: T.acc2, display: 'inline-flex', alignItems: 'center' }}>
                <Icon name="file" />
              </span>
              {showFileMeta && (
                <span style={{ fontSize: FONT_SIZE.xs, color: T.t2, whiteSpace: 'nowrap', fontFamily: FONT_UI }}>
                  {t('toolbarFileLabel')}
                </span>
              )}
              <span style={{
                fontSize: FONT_SIZE.sm,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: FONT_UI,
              }}>
                {fileName}
              </span>
            </div>
          </Tooltip>
        )}

        <Group>
          {LAYOUT_OPTIONS.map(l => (
            <Btn key={l.id} active={layout === l.id} onClick={() => setLayout(l.id)} tooltip={t(l.labelKey)}>
              <Icon name={l.icon} />
              {showLayoutText && <span>{t(l.labelKey)}</span>}
            </Btn>
          ))}
        </Group>

        <Group>
          <Btn onClick={onPrev} tooltip={t('toolbarPrevHunkTitle')} compact>
            <Icon name="prev" />
          </Btn>
          <span style={{ fontSize: FONT_SIZE.sm, color: T.t1, fontFamily: FONT_CODE, minWidth: 42, textAlign: 'center', lineHeight: 1, ...noDragStyle }}>
            {totalHunks > 0 ? `${hunkIdx + 1}/${totalHunks}` : '–/–'}
          </span>
          {hunkTargetLabel && (
            <Tooltip content={hunkTargetLabel} anchorStyle={noDragAnchorStyle}>
              <span
                style={{
                  maxWidth: responsiveMode === 'tight' ? 88 : 136,
                  height: 24,
                  padding: '0 8px',
                  borderRadius: 999,
                  border: `1px solid ${T.border}`,
                  background: `${T.acc2}10`,
                  color: T.acc2,
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 700,
                  fontFamily: FONT_CODE,
                  display: 'inline-flex',
                  alignItems: 'center',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  ...noDragStyle,
                }}>
                {hunkTargetLabel}
              </span>
            </Tooltip>
          )}
          <Btn onClick={onNext} tooltip={t('toolbarNextHunkTitle')} compact>
            <Icon name="next" />
          </Btn>
        </Group>

        <Group>
          <Btn active={showSearch} onClick={() => setShowSearch(v => !v)} tooltip={t('toolbarSearchTitle')}>
            <Icon name="search" />
            {showActionText && <span>{t('toolbarSearchLabel')}</span>}
          </Btn>
          <Btn onClick={onGoto} tooltip={t('toolbarGotoTitle')}>
            <Icon name="goto" />
            {showActionText && <span>{t('toolbarGotoLabel')}</span>}
          </Btn>
          <Btn active={collapseCtx} onClick={() => setCollapseCtx(v => !v)} tooltip={t('toolbarCollapseTitle')}>
            <Icon name={collapseCtx ? 'expand' : 'collapse'} />
            {showActionText && <span>{collapseCtx ? t('toolbarExpandAllLabel') : t('toolbarCollapseLabel')}</span>}
          </Btn>
          <Btn active={showWhitespace} onClick={() => setShowWhitespace(v => !v)} tooltip={t('toolbarWhitespaceTitle')}>
            <Icon name="whitespace" />
            {showWhitespaceText && <span>{t('toolbarWhitespaceLabel')}</span>}
          </Btn>
          <Btn
            active={showHiddenColumns}
            onClick={() => setShowHiddenColumns(v => !v)}
            tooltip={t('toolbarHiddenColumnsTitle')}
            disabled={!isWorkbookMode}>
            <Icon name="hiddenColumns" />
            {showWhitespaceText && <span>{t('toolbarHiddenColumnsLabel')}</span>}
          </Btn>
        </Group>

        {isWorkbookMode && (
          <Group>
            <Btn
              active={workbookCompareMode === 'content'}
              onClick={() => setWorkbookCompareMode('content')}
              tooltip={t('toolbarCompareModeContentTitle')}
              compact={!showCompareModeText}>
              <span>{showCompareModeText ? t('toolbarCompareModeContent') : t('toolbarCompareModeContentShort')}</span>
            </Btn>
            <Btn
              active={workbookCompareMode === 'strict'}
              onClick={() => setWorkbookCompareMode('strict')}
              tooltip={t('toolbarCompareModeStrictTitle')}
              compact={!showCompareModeText}>
              <span>{showCompareModeText ? t('toolbarCompareModeStrict') : t('toolbarCompareModeStrictShort')}</span>
            </Btn>
            <Tooltip
              content={workbookCompareMode === 'strict'
                ? t('toolbarCompareModeStatusStrictHint')
                : t('toolbarCompareModeStatusContentHint')}
              anchorStyle={noDragAnchorStyle}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 24,
                  padding: showCompareModeStatusText ? '0 8px' : '0 6px',
                  borderRadius: 999,
                  border: `1px solid ${workbookCompareMode === 'strict' ? `${T.acc2}44` : `${T.border2}`}`,
                  background: workbookCompareMode === 'strict' ? `${T.acc2}12` : T.bg1,
                  color: workbookCompareMode === 'strict' ? T.acc2 : T.t1,
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 700,
                  fontFamily: FONT_UI,
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  ...noDragStyle,
                }}>
                {showCompareModeStatusText
                  ? (workbookCompareMode === 'strict'
                    ? t('toolbarCompareModeStatusStrict')
                    : t('toolbarCompareModeStatusContent'))
                  : (workbookCompareMode === 'strict'
                    ? t('toolbarCompareModeStrictShort')
                    : t('toolbarCompareModeContentShort'))}
              </span>
            </Tooltip>
          </Group>
        )}

        <Group>
          <Btn onClick={() => setFontSize(s => Math.max(10, s - 1))} tooltip={t('toolbarDecreaseFontTitle')} compact>
            A-
          </Btn>
          <span style={{ fontSize: FONT_SIZE.sm, color: T.t1, minWidth: 22, textAlign: 'center', fontFamily: FONT_CODE, lineHeight: 1, ...noDragStyle }}>{fontSize}</span>
          <Btn onClick={() => setFontSize(s => Math.min(20, s + 1))} tooltip={t('toolbarIncreaseFontTitle')} compact>
            A+
          </Btn>
        </Group>

      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        alignContent: 'center',
        flexWrap: 'nowrap',
        gap: 6,
        flex: '0 0 auto',
        marginLeft: 8,
        ...noDragStyle,
      }}>
        <Group>
          <Btn onClick={() => setLocale(nextLocale)} tooltip={t('toolbarLanguageTitle')}>
            <Icon name="language" />
            {showLanguageText && (
              <span>{locale === 'zh-CN' ? t('toolbarLanguageEn') : t('toolbarLanguageZh')}</span>
            )}
          </Btn>
        </Group>

        <ThemeMenu />

        <Group>
          <Btn onClick={onHelp} tooltip={t('toolbarShortcutsTitle')} compact>
            <Icon name="help" />
          </Btn>
        </Group>

        {isElectron && (
          <Group>
            <Tooltip content={t('toolbarWindowMinimizeTitle')} anchorStyle={noDragAnchorStyle}>
              <button
                onClick={() => window.svnDiff!.windowMinimize()}
                aria-label={t('toolbarWindowMinimizeTitle')}
                style={windowButtonStyle}>
                <Icon name="windowMinimize" />
              </button>
            </Tooltip>
            <Tooltip content={t('toolbarWindowMaximizeTitle')} anchorStyle={noDragAnchorStyle}>
              <button
                onClick={() => window.svnDiff!.windowMaximize()}
                aria-label={t('toolbarWindowMaximizeTitle')}
                style={windowButtonStyle}>
                <Icon name="windowMaximize" />
              </button>
            </Tooltip>
            <Tooltip content={t('toolbarWindowCloseTitle')} anchorStyle={noDragAnchorStyle}>
              <button
                onClick={() => window.svnDiff!.windowClose()}
                aria-label={t('toolbarWindowCloseTitle')}
                onMouseEnter={e => (e.currentTarget.style.background = '#c42b1c')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={windowButtonStyle}>
                <Icon name="windowClose" />
              </button>
            </Tooltip>
          </Group>
        )}
      </div>
    </div>
  );
});

export default Toolbar;
