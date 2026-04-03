import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/theme/tokens';

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

export function getTooltipSurfaceBackground(_T?: ThemeTokens): string {
  return `linear-gradient(180deg, var(--bg-surface-hover) 0%, var(--bg-surface-solid) 100%)`;
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
  actualPlacement, left, width = 16, height = 9, borderColor, fillColor,
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
      className="absolute -translate-x-1/2"
      style={{ left, width, height, background: borderColor, clipPath, ...outerPlacement }}>
      <span className="absolute" style={{ background: fillColor, clipPath, ...innerPlacement }} />
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
  const actualPlacement = preferredPlacement === 'bottom' ? 'bottom' : canPlaceTop || !canPlaceBottom ? 'top' : 'bottom';
  const anchorCenter = rect.left + (rect.width / 2);
  const clampedLeft = Math.min(
    Math.max(anchorCenter - (bubbleWidth / 2), VIEWPORT_PADDING),
    Math.max(VIEWPORT_PADDING, viewportWidth - bubbleWidth - VIEWPORT_PADDING),
  );
  const top = actualPlacement === 'top' ? rect.top - TOOLTIP_GAP - bubbleHeight : rect.bottom + TOOLTIP_GAP;
  const arrowOffset = Math.min(
    Math.max(anchorCenter - clampedLeft, ARROW_SAFE_PADDING),
    Math.max(ARROW_SAFE_PADDING, bubbleWidth - ARROW_SAFE_PADDING),
  );
  return { left: clampedLeft, top, actualPlacement, arrowOffset };
}

const Tooltip = memo(({
  content, children, placement = 'top', maxWidth = 260, disabled = false, anchorStyle,
}: TooltipProps) => {
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
    setBubbleSize((prev) => (prev.width === nextWidth && prev.height === nextHeight ? prev : { width: nextWidth, height: nextHeight }));
  }, [maxWidth, open, rect, content]);

  const resolvedContent: React.ReactNode = typeof content === 'function' ? (open ? content() : null) : (content ?? null);

  const layout = useMemo(() => {
    if (!rect || typeof window === 'undefined') return null;
    return computeTooltipLayout(rect, window.innerWidth, window.innerHeight, bubbleSize.width, bubbleSize.height, placement);
  }, [bubbleSize.height, bubbleSize.width, placement, rect]);
  const tooltip = !disabled && resolvedContent ? (
    open && layout && typeof document !== 'undefined' &&
    createPortal(
      <div
        id={id}
        role="tooltip"
        className="fixed z-[9999] pointer-events-none opacity-100"
        style={{ left: layout.left, top: layout.top }}>
        <div
          ref={bubbleRef}
          className="relative p-[8px_10px] rounded-xl border border-border-default text-text-title text-[13px] leading-tight font-ui text-center whitespace-normal shadow-[0_14px_30px_rgba(0,0,0,0.12)]"
          style={{
            maxWidth,
            background: `linear-gradient(180deg, var(--bg-surface-hover) 0%, var(--bg-surface-solid) 100%)`,
          }}>
          {resolvedContent}
          <TooltipArrow
            actualPlacement={layout.actualPlacement}
            left={layout.arrowOffset}
            borderColor="var(--border-color)"
            fillColor={layout.actualPlacement === 'top' ? 'var(--bg-surface-solid)' : 'var(--bg-surface-hover)'}
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
        className="inline-flex shrink-0"
        style={anchorStyle}>
        {children}
      </span>
      {tooltip}
    </>
  );
});

export default Tooltip;
