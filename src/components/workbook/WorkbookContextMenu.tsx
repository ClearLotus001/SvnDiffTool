import { memo, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useTheme } from '@/context/theme';
import type { WorkbookContextMenuPoint } from '@/types';

export interface WorkbookContextMenuAction {
  id: string;
  label: string;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

export interface WorkbookContextMenuSection {
  title?: string;
  items: WorkbookContextMenuAction[];
}

interface WorkbookContextMenuProps {
  anchorPoint: WorkbookContextMenuPoint | null;
  sections: WorkbookContextMenuSection[];
  onClose: () => void;
}

const MENU_WIDTH = 248;
const VIEWPORT_PADDING = 12;

const WorkbookContextMenu = memo(({
  anchorPoint,
  sections,
  onClose,
}: WorkbookContextMenuProps) => {
  const T = useTheme();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!anchorPoint) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target ?? null)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorPoint, onClose]);

  const layout = useMemo(() => {
    if (!anchorPoint || typeof window === 'undefined') return null;
    return {
      left: Math.min(
        Math.max(anchorPoint.x, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING),
      ),
      top: Math.min(
        Math.max(anchorPoint.y, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - 240),
      ),
    };
  }, [anchorPoint]);

  if (!anchorPoint || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        top: layout.top,
        left: layout.left,
        width: MENU_WIDTH,
        padding: 8,
        borderRadius: 16,
        border: `1px solid ${T.border}`,
        background: T.bg1,
        boxShadow: `0 18px 44px -26px ${T.border2}`,
        display: 'grid',
        gap: 8,
        zIndex: 160,
      }}>
      {sections.map((section, sectionIndex) => (
        <div
          key={section.title ?? sectionIndex}
          style={{
            display: 'grid',
            gap: 6,
            paddingTop: sectionIndex === 0 ? 0 : 4,
            borderTop: sectionIndex === 0 ? 'none' : `1px solid ${T.border}`,
          }}>
          {section.title && (
            <div
              style={{
                padding: '2px 8px 0',
                color: T.t2,
                fontFamily: FONT_UI,
                fontSize: FONT_SIZE.xs,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
              {section.title}
            </div>
          )}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onClose();
              }}
              style={{
                minHeight: 34,
                padding: '0 12px',
                borderRadius: 10,
                border: 'none',
                background: item.disabled ? 'transparent' : T.bg0,
                color: item.disabled
                  ? T.t2
                  : item.tone === 'danger'
                  ? T.delTx
                  : T.t0,
                fontFamily: FONT_UI,
                fontSize: FONT_SIZE.sm,
                fontWeight: 700,
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: item.disabled ? 0.5 : 1,
              }}>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
});

export default WorkbookContextMenu;
