import { memo, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cssVar } from '@/theme/cssUtils';
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
  anchorPoint, sections, onClose,
}: WorkbookContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!anchorPoint) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target ?? null)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
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
      left: Math.min(Math.max(anchorPoint.x, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING)),
      top: Math.min(Math.max(anchorPoint.y, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - 240)),
    };
  }, [anchorPoint]);

  if (!anchorPoint || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="motion-floating-panel fixed p-2 rounded-2xl border border-border-default bg-bg-surface-solid grid gap-2 z-[160]"
      style={{
        top: layout.top,
        left: layout.left,
        width: MENU_WIDTH,
        boxShadow: `0 18px 44px -26px ${cssVar('border2')}`,
      }}>
      {sections.map((section, sectionIndex) => (
        <div
          key={section.title ?? sectionIndex}
          className="grid gap-1.5"
          style={{
            paddingTop: sectionIndex === 0 ? 0 : 4,
            borderTop: sectionIndex === 0 ? 'none' : `1px solid var(--border-color)`,
          }}>
          {section.title && (
            <div className="py-0.5 px-2 text-text-secondary font-ui text-[11px] font-extrabold tracking-wider uppercase">
              {section.title}
            </div>
          )}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { if (!item.disabled) { item.onSelect(); onClose(); } }}
              className={`
                min-h-[34px] px-3 rounded-[10px] border-none
                font-ui text-[13px] font-bold text-left
                transition-all duration-150
                ${item.disabled
                  ? 'bg-transparent text-text-secondary opacity-50 cursor-not-allowed'
                  : 'bg-bg-base cursor-pointer hover:bg-bg-surface-hover active:scale-[0.97]'
                }
              `}
              style={{
                color: !item.disabled && item.tone === 'danger' ? cssVar('delTx') : undefined,
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
