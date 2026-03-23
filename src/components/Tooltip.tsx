import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

interface TooltipLayout {
  left: number;
  top: number;
  actualPlacement: TooltipPlacement;
  arrowOffset: number;
}

const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 8;
const ARROW_SAFE_PADDING = 18;

export function computeTooltipLayout(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  bubbleWidth: number,
  bubbleHeight: number,
  preferredPlacement: TooltipPlacement,
): TooltipLayout {
  const canPlaceTop = rect.top >= bubbleHeight + TOOLTIP_GAP + VIEWPORT_PADDING;
  const canPlaceBottom = viewportHeight - rect.bottom >= bubbleHeight + TOOLTIP_GAP + VIEWPORT_PADDING;
  const actualPlacement = preferredPlacement === 'bottom'
    ? 'bottom'
    : canPlaceTop || !canPlaceBottom
    ? 'top'
    : 'bottom';

  const anchorCenter = rect.left + (rect.width / 2);
  const clampedLeft = Math.min(
    Math.max(anchorCenter - (bubbleWidth / 2), VIEWPORT_PADDING),
    Math.max(VIEWPORT_PADDING, viewportWidth - bubbleWidth - VIEWPORT_PADDING),
  );
  const top = actualPlacement === 'top'
    ? rect.top - TOOLTIP_GAP - bubbleHeight
    : rect.bottom + TOOLTIP_GAP;
  const arrowOffset = Math.min(
    Math.max(anchorCenter - clampedLeft, ARROW_SAFE_PADDING),
    Math.max(ARROW_SAFE_PADDING, bubbleWidth - ARROW_SAFE_PADDING),
  );

  return {
    left: clampedLeft,
    top,
    actualPlacement,
    arrowOffset,
  };
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
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: maxWidth, height: 40 });

  const updateRect = () => {
    const nextRect = anchorRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
  };

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

  useLayoutEffect(() => {
    if (!open) return;
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const nextWidth = Math.ceil(bubble.offsetWidth);
    const nextHeight = Math.ceil(bubble.offsetHeight);
    setBubbleSize((prev) => (
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    ));
  }, [maxWidth, open, rect, content]);

  const resolvedContent: React.ReactNode = (() => {
    if (typeof content === 'function') {
      return open ? content() : null;
    }
    return content ?? null;
  })();

  const layout = useMemo(() => {
    if (!rect || typeof window === 'undefined') return null;
    return computeTooltipLayout(
      rect,
      window.innerWidth,
      window.innerHeight,
      bubbleSize.width,
      bubbleSize.height,
      placement,
    );
  }, [bubbleSize.height, bubbleSize.width, placement, rect]);

  const tooltip = !disabled && resolvedContent ? (
    open &&
    layout &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        id={id}
        role="tooltip"
        style={{
          position: 'fixed',
          left: layout.left,
          top: layout.top,
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: 1,
        }}>
        <div
          ref={bubbleRef}
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
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.12)',
            textAlign: 'center',
            whiteSpace: 'normal',
          }}>
          {resolvedContent}
          <span
            style={{
              position: 'absolute',
              left: layout.arrowOffset,
              width: 12,
              height: 12,
              background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
              borderLeft: `1px solid ${T.border}`,
              borderTop: `1px solid ${T.border}`,
              borderTopLeftRadius: 4,
              transform: layout.actualPlacement === 'top'
                ? 'translateX(-50%) rotate(225deg)'
                : 'translateX(-50%) rotate(45deg)',
              top: layout.actualPlacement === 'top' ? 'calc(100% - 5px)' : -5,
              boxShadow: layout.actualPlacement === 'top'
                ? '4px 4px 10px rgba(0, 0, 0, 0.06)'
                : '-4px -4px 10px rgba(0, 0, 0, 0.06)',
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
