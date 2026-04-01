import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FONT_UI, getWorkbookFontScale } from '@/constants/typography';
import Tooltip from '@/components/shared/Tooltip';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';

interface WorkbookSheetTabsProps {
  sections: WorkbookSection[];
  activeIndex: number;
  onSelect: (index: number) => void;
  fontSize: number;
}

const WorkbookSheetTabs = memo(({
  sections,
  activeIndex,
  onSelect,
  fontSize,
}: WorkbookSheetTabsProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSections = sections.length > 0;

  const getSectionTone = (section: WorkbookSection) => {
    switch (section.changeType) {
      case 'add':
        return {
          accent: T.addTx,
          border: T.addBrd,
          background: T.addBg,
        };
      case 'delete':
        return {
          accent: T.delTx,
          border: T.delBrd,
          background: T.delBg,
        };
      case 'rename':
        return {
          accent: T.chgTx,
          border: `${T.chgTx}66`,
          background: T.chgBg,
        };
      default:
        return {
          accent: T.acc2,
          border: `${T.acc2}66`,
          background: `${T.acc2}16`,
        };
    }
  };

  const getSectionBadge = (section: WorkbookSection) => {
    switch (section.changeType) {
      case 'add':
        return '+';
      case 'delete':
        return '−';
      case 'rename':
        return section.renameRole === 'target' ? '↤' : '↦';
      default:
        return '';
    }
  };

  const getSectionLabel = (section: WorkbookSection) => {
    switch (section.changeType) {
      case 'add':
        return t('workbookSheetTabAddedLabel', { name: section.name });
      case 'delete':
        return t('workbookSheetTabDeletedLabel', { name: section.name });
      case 'rename':
        return section.renameRole === 'target'
          ? t('workbookSheetTabRenameTargetLabel', { name: section.name })
          : t('workbookSheetTabRenameSourceLabel', { name: section.name });
      default:
        return section.displayName;
    }
  };

  const renderSectionTooltip = (section: WorkbookSection) => {
    if (section.changeType === 'rename' && section.renamePeerName) {
      const previousName = section.renameRole === 'target'
        ? section.renamePeerName
        : section.name;
      const currentName = section.renameRole === 'target'
        ? section.name
        : section.renamePeerName;
      const title = section.renameRole === 'target'
        ? t('workbookSheetTabTooltipRenameTargetTitle')
        : t('workbookSheetTabTooltipRenameSourceTitle');
      const hint = section.renameRole === 'target'
        ? t('workbookSheetTabTooltipRenameTargetHint')
        : t('workbookSheetTabTooltipRenameSourceHint');
      return (
        <div style={{ display: 'grid', gap: 4, textAlign: 'left' }}>
          <strong>{title}</strong>
          <span style={{ color: T.t1 }}>{hint}</span>
          <span>{t('workbookSheetTabTooltipPreviousName', { name: previousName })}</span>
          <span>{t('workbookSheetTabTooltipCurrentName', { name: currentName })}</span>
        </div>
      );
    }

    const title = section.changeType === 'add'
      ? t('workbookSheetTabTooltipAddedTitle')
      : section.changeType === 'delete'
        ? t('workbookSheetTabTooltipDeletedTitle')
        : t('workbookSheetTabTooltipSheetTitle');
    const hint = section.changeType === 'add'
      ? t('workbookSheetTabTooltipAddedHint')
      : section.changeType === 'delete'
        ? t('workbookSheetTabTooltipDeletedHint')
        : t('workbookSheetTabTooltipSheetHint');

    return (
      <div style={{ display: 'grid', gap: 4, textAlign: 'left' }}>
        <strong>{title}</strong>
        <span style={{ color: T.t1 }}>{hint}</span>
        <span>{t('workbookSheetTabTooltipName', { name: section.name })}</span>
      </div>
    );
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target ?? null)) return;
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  if (!hasSections) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '6px 10px 0',
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        borderTop: `1px solid ${T.border}`,
        flexShrink: 0,
        position: 'relative',
        zIndex: 16,
        boxShadow: `0 -1px 0 ${T.border}, 0 -10px 22px -24px ${T.border2}`,
      }}>
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMenuOpen(open => !open)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            color: T.t1,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 10px 18px -18px ${T.border2}`,
          }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              display: 'grid',
              placeItems: 'center',
              lineHeight: 1,
            }}>
            <span style={{ fontSize: 16, transform: 'translateY(-1px)' }}>≡</span>
          </span>
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 'calc(100% + 8px)',
              minWidth: 220,
              maxHeight: 320,
              overflowY: 'auto',
              padding: 6,
              borderRadius: 14,
              border: `1px solid ${T.border}`,
              background: T.bg1,
              boxShadow: `0 16px 40px -24px ${T.border2}`,
              display: 'grid',
              gap: 4,
            }}>
            {sections.map((section, index) => {
              const active = index === activeIndex;
              const tone = getSectionTone(section);
              const badge = getSectionBadge(section);
              const label = getSectionLabel(section);
              return (
                <Tooltip
                  key={`menu-${section.name}-${section.startLineIdx}`}
                  content={renderSectionTooltip(section)}
                  maxWidth={320}
                  anchorStyle={{ display: 'block', width: '100%', flexShrink: 1 }}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(index);
                      setMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: `1px solid ${active ? tone.border : 'transparent'}`,
                      background: active ? tone.background : 'transparent',
                      color: active ? tone.accent : T.t0,
                      cursor: 'pointer',
                      fontFamily: FONT_UI,
                      fontSize: sizes.ui,
                      fontWeight: active ? 700 : 600,
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                    {badge && (
                      <span
                        aria-hidden="true"
                        style={{
                          minWidth: 14,
                          color: tone.accent,
                          fontWeight: 800,
                        }}>
                        {badge}
                      </span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                    </span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="workbook-sheet-tabs-scroll"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          overflowX: 'auto',
          overflowY: 'hidden',
          flex: 1,
          minWidth: 0,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
        {sections.map((section, index) => {
          const active = index === activeIndex;
          const tone = getSectionTone(section);
          const badge = getSectionBadge(section);
          const label = getSectionLabel(section);
          return (
            <Tooltip
              key={`${section.name}-${section.startLineIdx}`}
              content={renderSectionTooltip(section)}
              maxWidth={320}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                style={{
                  height: 32,
                  padding: '0 14px',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottom: 'none',
                  borderLeft: `1px solid ${active ? tone.border : T.border}`,
                  borderRight: `1px solid ${active ? tone.border : T.border}`,
                  borderTop: `2px solid ${active ? tone.accent : 'transparent'}`,
                  background: active ? T.bg1 : T.bg2,
                  color: active ? T.t0 : T.t1,
                  cursor: 'pointer',
                  fontFamily: FONT_UI,
                  fontSize: sizes.ui,
                  fontWeight: active ? 700 : 600,
                  whiteSpace: 'nowrap',
                  boxShadow: active ? `0 -6px 14px -10px ${T.border2}` : 'none',
                  transform: active ? 'translateY(1px)' : 'none',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  maxWidth: 240,
                }}>
                {badge && (
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: 14,
                      color: tone.accent,
                      fontWeight: 800,
                    }}>
                    {badge}
                  </span>
                )}
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {label}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      <style>{`
        .workbook-sheet-tabs-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
});

export default WorkbookSheetTabs;
