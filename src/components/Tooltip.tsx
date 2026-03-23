import { memo, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useTheme } from '../context/theme';

type TooltipPlacement = 'top' | 'bottom';

interface TooltipProps {
  content?: React.ReactNode | (() => React.ReactNode);
  children: React.ReactNode;
  placement?: TooltipPlacement;
  maxWidth?: number;
  disabled?: boolean;
  anchorStyle?: CSSProperties | undefined;
}

const Tooltip = memo(({
  content,
  children,
  placement = 'top',
  maxWidth = 260,
  disabled = false,
  anchorStyle,
}: TooltipProps) => {
  const T = useTheme();
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updateRect = () => {
    const nextRect = anchorRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
  };

  const resolvedPlacement: TooltipPlacement = (() => {
    if (!rect || typeof window === 'undefined') return placement;
    if (placement === 'bottom') return 'bottom';

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove < 52 && spaceBelow > spaceAbove) return 'bottom';
    return 'top';
  })();

  const anchorX = (() => {
    if (!rect || typeof window === 'undefined') return 0;
    const halfWidth = maxWidth / 2;
    return Math.min(
      Math.max(rect.left + rect.width / 2, halfWidth + 12),
      window.innerWidth - halfWidth - 12,
    );
  })();

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onFrame = () => updateRect();
    window.addEventListener('resize', onFrame);
    window.addEventListener('scroll', onFrame, true);
    return () => {
      window.removeEventListener('resize', onFrame);
      window.removeEventListener('scroll', onFrame, true);
    };
  }, [open]);

  const resolvedContent: React.ReactNode = (() => {
    if (typeof content === 'function') {
      return open ? content() : null;
    }
    return content ?? null;
  })();

  const tooltip = !disabled && resolvedContent ? (
    open &&
    rect &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        id={id}
        role="tooltip"
        style={{
          position: 'fixed',
          left: anchorX,
          top: resolvedPlacement === 'top' ? rect.top - 8 : rect.bottom + 8,
          transform: resolvedPlacement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: 1,
        }}>
        <div
          style={{
            position: 'relative',
            maxWidth,
            padding: '8px 10px',
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
            color: T.t0,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.35,
            fontFamily: FONT_UI,
            boxShadow: '0 14px 28px rgba(0, 0, 0, 0.12)',
            textAlign: 'center',
            whiteSpace: 'normal',
          }}>
          {resolvedContent}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              width: 8,
              height: 8,
              background: T.bg1,
              borderLeft: `1px solid ${T.border}`,
              borderTop: `1px solid ${T.border}`,
              borderTopLeftRadius: 3,
              transform: resolvedPlacement === 'top'
                ? 'translateX(-50%) rotate(225deg)'
                : 'translateX(-50%) rotate(45deg)',
              top: resolvedPlacement === 'top' ? 'calc(100% - 1px)' : -4,
            }}
          />
        </div>
      </div>,
      document.body,
    )
  ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ display: 'inline-flex', flexShrink: 0, ...anchorStyle }}>
        {children}
      </span>
      {tooltip}
    </>
  );
});

export default Tooltip;
