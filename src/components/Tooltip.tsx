import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useTheme } from '../context/theme';
import type { Theme } from '../types';

export type TooltipPlacement = 'top' | 'bottom';

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
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function getTooltipSurfaceBackground(T: Theme): string {
  return `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`;
}

interface TooltipArrowProps {
  actualPlacement: TooltipPlacement;
  left: number;
  width?: number;
  height?: number;
  borderColor: string;
  fillColor: string;
}

export function TooltipArrow({
  actualPlacement,
  left,
  width = 16,
  height = 9,
  borderColor,
  fillColor,
}: TooltipArrowProps) {
  const clipPath = actualPlacement === 'top'
    ? 'polygon(50% 100%, 0 0, 100% 0)'
    : 'polygon(0 100%, 50% 0, 100% 100%)';
  const outerPlacement: CSSProperties = actualPlacement === 'top'
    ? { top: 'calc(100% - 1px)' }
    : { bottom: 'calc(100% - 1px)' };
  const innerPlacement: CSSProperties = actualPlacement === 'top'
    ? { left: 1, right: 1, top: 0, bottom: 1 }
    : { left: 1, right: 1, top: 1, bottom: 0 };

  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left,
        width,
        height,
        transform: 'translateX(-50%)',
        background: borderColor,
        clipPath,
        ...outerPlacement,
      }}>
      <span
        style={{
          position: 'absolute',
          background: fillColor,
          clipPath,
          ...innerPlacement,
        }}
      />
    </span>
  );
}

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

  useIsomorphicLayoutEffect(() => {
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
  const surfaceBackground = getTooltipSurfaceBackground(T);

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
            background: surfaceBackground,
            color: T.t0,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.35,
            fontFamily: FONT_UI,
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.12)',
            textAlign: 'center',
            whiteSpace: 'normal',
          }}>
          {resolvedContent}
          <TooltipArrow
            actualPlacement={layout.actualPlacement}
            left={layout.arrowOffset}
            borderColor={T.border}
            fillColor={layout.actualPlacement === 'top' ? T.bg1 : T.bg2}
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
