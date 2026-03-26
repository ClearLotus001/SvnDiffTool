import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSections = sections.length > 0;

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
              return (
                <button
                  key={`menu-${section.name}-${section.startLineIdx}`}
                  type="button"
                  onClick={() => {
                    onSelect(index);
                    setMenuOpen(false);
                  }}
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: `1px solid ${active ? `${T.acc2}55` : 'transparent'}`,
                    background: active ? `${T.acc2}16` : 'transparent',
                    color: active ? T.acc2 : T.t0,
                    cursor: 'pointer',
                    fontFamily: FONT_UI,
                    fontSize: sizes.ui,
                    fontWeight: active ? 700 : 600,
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {section.name}
                </button>
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
                flexShrink: 0,
              }}>
              {section.name}
            </button>
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
