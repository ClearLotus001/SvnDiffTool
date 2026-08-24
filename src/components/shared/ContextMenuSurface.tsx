import { memo, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cssAlpha, cssVar } from '@/theme/cssUtils';

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

export interface ContextMenuSection {
  title?: string;
  items: ContextMenuAction[];
}

interface ContextMenuSurfaceProps {
  anchorPoint: ContextMenuPoint | null;
  sections: ContextMenuSection[];
  onClose: () => void;
  ariaLabel: string;
  zIndex?: number;
}

const MENU_WIDTH = 242;
const COMPACT_MENU_WIDTH = 176;
const VIEWPORT_PADDING = 12;

const ContextMenuSurface = memo(({
  anchorPoint,
  sections,
  onClose,
  ariaLabel,
  zIndex = 160,
}: ContextMenuSurfaceProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const flattenedItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const isCompactSingleAction = sections.length === 1
    && !sections[0]?.title
    && flattenedItems.length === 1;

  useEffect(() => {
    if (!anchorPoint) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target ?? null)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!menuRef.current) return;
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      const enabledItems = Array.from(
        menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
      );
      if (enabledItems.length === 0) return;

      const currentIndex = enabledItems.findIndex((item) => item === document.activeElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        enabledItems[(currentIndex + 1 + enabledItems.length) % enabledItems.length]?.focus();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        enabledItems[(currentIndex - 1 + enabledItems.length) % enabledItems.length]?.focus();
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        enabledItems[0]?.focus();
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        enabledItems[enabledItems.length - 1]?.focus();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        enabledItems[(currentIndex + delta + enabledItems.length) % enabledItems.length]?.focus();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorPoint, onClose]);

  useEffect(() => {
    if (!anchorPoint) return;
    const frameId = requestAnimationFrame(() => {
      const firstEnabledItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      firstEnabledItem?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [anchorPoint, sections]);

  const layout = useMemo(() => {
    const width = isCompactSingleAction ? COMPACT_MENU_WIDTH : MENU_WIDTH;
    if (!anchorPoint || typeof window === 'undefined') return null;
    return {
      width,
      left: Math.min(
        Math.max(anchorPoint.x, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING),
      ),
      top: Math.min(
        Math.max(anchorPoint.y, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - 260),
      ),
    };
  }, [anchorPoint, isCompactSingleAction]);

  if (!anchorPoint || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className="motion-floating-panel fixed overflow-hidden border"
      style={{
        top: layout.top,
        left: layout.left,
        width: layout.width,
        zIndex,
        padding: isCompactSingleAction ? 4 : 6,
        borderRadius: 8,
        borderColor: cssAlpha('border2', 'b8'),
        background: `color-mix(in srgb, ${cssVar('bg2')} 94%, ${cssVar('bg4')} 6%)`,
        boxShadow: `0 10px 28px -10px ${cssAlpha('bg4', 'd0')}, 0 0 0 1px ${cssAlpha('border2', '44')}`,
      }}>
      {sections.map((section, sectionIndex) => (
        <div
          key={section.title ?? sectionIndex}
          style={{
            paddingTop: sectionIndex === 0 ? 0 : 5,
            marginTop: sectionIndex === 0 ? 0 : 5,
            borderTop: sectionIndex === 0 ? 'none' : `1px solid ${cssAlpha('border2', '58')}`,
          }}>
          {section.title && !isCompactSingleAction && (
            <div
              className="font-ui select-none"
              style={{
                padding: '2px 8px 6px',
                color: cssVar('t2'),
                fontSize: 10.5,
                lineHeight: 1.2,
                fontWeight: 500,
              }}>
              {section.title}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gap: isCompactSingleAction ? 0 : 1,
            }}>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-disabled={item.disabled ? 'true' : 'false'}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  onClose();
                }}
                className={`
                  group flex w-full items-center justify-between border-none bg-transparent text-left
                  transition-colors duration-100
                  focus-visible:outline-none
                  ${item.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}
                `}
                style={{
                  minHeight: isCompactSingleAction ? 24 : 26,
                  padding: isCompactSingleAction ? '0 9px' : '0 8px',
                  borderRadius: 4,
                  color: item.tone === 'danger' ? cssVar('delTx') : cssVar('t1'),
                  fontSize: isCompactSingleAction ? 11.5 : 12,
                  fontWeight: 400,
                }}
                onMouseEnter={(event) => {
                  if (item.disabled) return;
                  event.currentTarget.focus();
                }}
                onFocus={(event) => {
                  if (item.disabled) return;
                  event.currentTarget.style.background = `color-mix(in srgb, ${cssVar('acc2')} 24%, ${cssVar('bg4')} 76%)`;
                  event.currentTarget.style.color = cssVar('t0');
                }}
                onBlur={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.color = item.tone === 'danger' ? cssVar('delTx') : cssVar('t1');
                }}>
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: item.shortcut ? 12 : 0,
                  }}>
                  {item.label}
                </span>
                {item.shortcut && (
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      color: cssVar('t2'),
                      fontSize: 10.5,
                      fontWeight: 400,
                      whiteSpace: 'nowrap',
                    }}>
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
});

export default ContextMenuSurface;
