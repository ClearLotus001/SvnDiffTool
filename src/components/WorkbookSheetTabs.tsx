import { memo, useMemo } from 'react';
import { FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { useTheme } from '../context/theme';
import type { WorkbookSection } from '../utils/workbookSections';

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
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);

  if (sections.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        padding: '6px 10px 0',
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        borderTop: `1px solid ${T.border}`,
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        position: 'relative',
        zIndex: 16,
        boxShadow: `0 -1px 0 ${T.border}, 0 -10px 22px -24px ${T.border2}`,
      }}>
      {sections.map((section, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={`${section.name}-${section.startLineIdx}`}
            type="button"
            onClick={() => onSelect(index)}
            style={{
              height: 32,
              padding: '0 14px',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottom: 'none',
              borderLeft: `1px solid ${active ? `${T.acc2}66` : T.border}`,
              borderRight: `1px solid ${active ? `${T.acc2}66` : T.border}`,
              borderTop: `2px solid ${active ? T.acc2 : 'transparent'}`,
              background: active ? T.bg1 : T.bg2,
              color: active ? T.t0 : T.t1,
              cursor: 'pointer',
              fontFamily: FONT_UI,
              fontSize: sizes.ui,
              fontWeight: active ? 700 : 600,
              whiteSpace: 'nowrap',
              boxShadow: active ? `0 -6px 14px -10px ${T.border2}` : 'none',
              transform: active ? 'translateY(1px)' : 'none',
            }}>
            {section.name}
          </button>
        );
      })}
    </div>
  );
});

export default WorkbookSheetTabs;
