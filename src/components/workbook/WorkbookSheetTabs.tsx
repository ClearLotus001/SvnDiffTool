import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { getWorkbookFontScale } from '@/constants/typography';
import Tooltip from '@/components/shared/Tooltip';
import { useI18n } from '@/context/i18n';
import { cssVar } from '@/theme/cssUtils';
import {
  type DiffIndicatorTone,
  resolveDiffIndicatorCssPalette,
  resolveWorkbookSectionIndicatorTone,
} from '@/utils/diff/diffIndicatorVisuals';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';

interface WorkbookSheetTabsProps {
  sections: WorkbookSection[];
  activeIndex: number;
  onSelect: (index: number) => void;
  fontSize: number;
  modifiedSheetNames?: ReadonlySet<string>;
}

const EMPTY_MODIFIED_SHEET_NAMES = new Set<string>();

const WorkbookSheetTabs = memo(({
  sections,
  activeIndex,
  onSelect,
  fontSize,
  modifiedSheetNames = EMPTY_MODIFIED_SHEET_NAMES,
}: WorkbookSheetTabsProps) => {
  const { t } = useI18n();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isModifiedSection = (section: WorkbookSection) => (
    section.changeType === 'equal' && modifiedSheetNames.has(section.name)
  );

  const resolveSectionTone = (section: WorkbookSection): DiffIndicatorTone => (
    isModifiedSection(section)
      ? 'modify'
      : resolveWorkbookSectionIndicatorTone(section.changeType)
  );

  const getSectionBadge = (section: WorkbookSection) => {
    switch (section.changeType) {
      case 'add': return '+';
      case 'delete': return '−';
      case 'rename': return section.renameRole === 'target' ? '↤' : '↦';
      default: return '';
    }
  };

  const getSectionLabel = (section: WorkbookSection) => {
    switch (section.changeType) {
      case 'add': return t('workbookSheetTabAddedLabel', { name: section.name });
      case 'delete': return t('workbookSheetTabDeletedLabel', { name: section.name });
      case 'rename': return section.renameRole === 'target'
        ? t('workbookSheetTabRenameTargetLabel', { name: section.name })
        : t('workbookSheetTabRenameSourceLabel', { name: section.name });
      default: return section.displayName;
    }
  };

  const renderSectionTooltip = (section: WorkbookSection) => {
    if (section.changeType === 'rename' && section.renamePeerName) {
      const previousName = section.renameRole === 'target' ? section.renamePeerName : section.name;
      const currentName = section.renameRole === 'target' ? section.name : section.renamePeerName;
      const titleText = section.renameRole === 'target'
        ? t('workbookSheetTabTooltipRenameTargetTitle')
        : t('workbookSheetTabTooltipRenameSourceTitle');
      const hint = section.renameRole === 'target'
        ? t('workbookSheetTabTooltipRenameTargetHint')
        : t('workbookSheetTabTooltipRenameSourceHint');
      return (
        <div className="grid gap-1 text-left">
          <strong>{titleText}</strong>
          <span className="text-text-primary">{hint}</span>
          <span>{t('workbookSheetTabTooltipPreviousName', { name: previousName })}</span>
          <span>{t('workbookSheetTabTooltipCurrentName', { name: currentName })}</span>
        </div>
      );
    }

    const titleText = section.changeType === 'add'
      ? t('workbookSheetTabTooltipAddedTitle')
      : section.changeType === 'delete'
        ? t('workbookSheetTabTooltipDeletedTitle')
        : isModifiedSection(section)
          ? t('workbookSheetTabTooltipChangedTitle')
          : t('workbookSheetTabTooltipSheetTitle');
    const hint = section.changeType === 'add'
      ? t('workbookSheetTabTooltipAddedHint')
      : section.changeType === 'delete'
        ? t('workbookSheetTabTooltipDeletedHint')
        : isModifiedSection(section)
          ? t('workbookSheetTabTooltipChangedHint')
          : t('workbookSheetTabTooltipSheetHint');

    return (
      <div className="grid gap-1 text-left">
        <strong>{titleText}</strong>
        <span className="text-text-primary">{hint}</span>
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
      if (menuRef.current?.contains(event.target as Node | null)) return;
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  if (sections.length === 0) return null;

  return (
    <div
      className="flex items-end gap-2 pt-1.5 px-2.5 shrink-0 relative z-[16] border-t border-border-default"
      style={{
        background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
        boxShadow: `0 -1px 0 ${cssVar('border')}, 0 -10px 22px -24px ${cssVar('border2')}`,
      }}>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="size-8 rounded-[10px] border border-border-default bg-bg-surface-hover text-text-primary cursor-pointer inline-flex items-center justify-center hover:text-accent hover:border-accent active:scale-95 transition-all duration-150"
          style={{ boxShadow: `0 10px 18px -18px ${cssVar('border2')}` }}>
          <Menu size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute left-0 bottom-[calc(100%+8px)] min-w-[220px] max-h-80 overflow-y-auto p-1.5 rounded-[14px] border border-border-default bg-bg-surface-solid grid gap-1 z-20"
            style={{ boxShadow: `0 16px 40px -24px ${cssVar('border2')}` }}>
            {sections.map((section, index) => {
              const active = index === activeIndex;
              const modified = isModifiedSection(section);
              const indicatorTone = resolveSectionTone(section);
              const palette = resolveDiffIndicatorCssPalette(indicatorTone);
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
                    className="w-full h-[34px] px-3 rounded-[10px] cursor-pointer font-ui text-left whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2 transition-all duration-150 hover:brightness-110"
                    style={{
                      fontSize: sizes.ui,
                      border: `1px solid ${active ? palette.border : modified ? palette.softBackground : 'transparent'}`,
                      background: active
                        ? palette.background
                        : modified
                          ? `linear-gradient(90deg, ${palette.softBackground} 0%, transparent 92%)`
                          : 'transparent',
                      color: active ? palette.text : cssVar('t0'),
                      fontWeight: active ? 700 : 600,
                      boxShadow: modified ? `inset 2px 0 0 ${palette.accent}` : 'none',
                    }}>
                    {badge && (
                      <span
                        aria-hidden="true"
                        className="min-w-3.5 font-extrabold"
                        style={{ color: palette.accent }}>
                        {badge}
                      </span>
                    )}
                    {!badge && modified && (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full shrink-0"
                        style={{
                          background: palette.accent,
                          boxShadow: `0 0 0 4px ${palette.softBackground}`,
                        }}
                      />
                    )}
                    <span className="overflow-hidden text-ellipsis">{label}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex items-end gap-1 overflow-x-auto overflow-y-hidden flex-1 min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section, index) => {
          const active = index === activeIndex;
          const modified = isModifiedSection(section);
          const indicatorTone = resolveSectionTone(section);
          const palette = resolveDiffIndicatorCssPalette(indicatorTone);
          const badge = getSectionBadge(section);
          const label = getSectionLabel(section);
          const activeTextColor = indicatorTone === 'neutral' ? cssVar('t0') : palette.text;
          return (
            <Tooltip key={`${section.name}-${section.startLineIdx}`} content={renderSectionTooltip(section)} maxWidth={320}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="h-8 px-3.5 rounded-t-[10px] border-b-0 cursor-pointer font-ui whitespace-nowrap shrink-0 inline-flex items-center gap-2 max-w-[240px] transition-all duration-150"
                style={{
                  borderLeft: `1px solid ${active || modified ? palette.border : cssVar('border')}`,
                  borderRight: `1px solid ${active || modified ? palette.border : cssVar('border')}`,
                  borderTop: `2px solid ${active ? palette.accent : modified ? palette.border : 'transparent'}`,
                  background: active
                    ? `linear-gradient(180deg, ${palette.softBackground} 0%, ${cssVar('bg1')} 65%)`
                    : modified
                      ? `linear-gradient(180deg, ${palette.softBackground} 0%, ${cssVar('bg2')} 82%)`
                      : cssVar('bg2'),
                  color: active ? activeTextColor : modified ? cssVar('t0') : cssVar('t1'),
                  fontSize: sizes.ui,
                  fontWeight: active ? 700 : 600,
                  boxShadow: active
                    ? `0 -6px 14px -10px ${palette.shadow}`
                    : modified
                      ? `0 -6px 14px -12px ${palette.shadow}`
                      : 'none',
                  transform: active ? 'translateY(1px)' : 'none',
                }}>
                {badge && (
                  <span
                    aria-hidden="true"
                    className="min-w-3.5 font-extrabold"
                    style={{ color: palette.accent }}>
                    {badge}
                  </span>
                )}
                {!badge && modified && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full shrink-0"
                    style={{
                      background: palette.accent,
                      boxShadow: `0 0 0 4px ${palette.softBackground}`,
                    }}
                  />
                )}
                <span className="overflow-hidden text-ellipsis">{label}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default WorkbookSheetTabs;
