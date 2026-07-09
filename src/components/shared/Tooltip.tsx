import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content?: React.ReactNode | (() => React.ReactNode);
  children: React.ReactNode;
  placement?: TooltipPlacement;
  maxWidth?: number;
  disabled?: boolean;
  surface?: 'default' | 'bare';
  anchorStyle?: CSSProperties | undefined;
  sideBoundaryRef?: React.RefObject<HTMLElement | null> | undefined;
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
export const TOOLTIP_PORTAL_Z_INDEX = 10000;
export const TOOLTIP_GLASS_BORDER_COLOR = 'var(--liquid-glass-border, var(--border-color))';
export const TOOLTIP_GLASS_FILL_COLOR = 'var(--liquid-glass-bg-strong, var(--bg-surface-solid))';
export const TOOLTIP_GLASS_BACKDROP_FILTER = 'var(--glass-blur)';
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  const isSidePlacement = actualPlacement === 'left' || actualPlacement === 'right';
  const resolvedWidth = isSidePlacement ? height : width;
  const resolvedHeight = isSidePlacement ? width : height;
  const clipPath = actualPlacement === 'top'
    ? 'polygon(50% 100%, 0 0, 100% 0)'
    : actualPlacement === 'bottom'
      ? 'polygon(0 100%, 50% 0, 100% 100%)'
      : actualPlacement === 'left'
        ? 'polygon(0 0, 100% 50%, 0 100%)'
        : 'polygon(100% 0, 0 50%, 100% 100%)';
  const outerPlacement: CSSProperties = actualPlacement === 'top'
    ? { top: 'calc(100% - 1px)' }
    : actualPlacement === 'bottom'
      ? { bottom: 'calc(100% - 1px)' }
      : actualPlacement === 'left'
        ? { left: 'calc(100% - 1px)' }
        : { right: 'calc(100% - 1px)' };
  const innerPlacement: CSSProperties = actualPlacement === 'top'
    ? { left: 1, right: 1, top: 0, bottom: 1 }
    : actualPlacement === 'bottom'
      ? { left: 1, right: 1, top: 1, bottom: 0 }
      : actualPlacement === 'left'
        ? { left: 0, right: 1, top: 1, bottom: 1 }
        : { left: 1, right: 0, top: 1, bottom: 1 };

  return (
    <span
      aria-hidden
      className={`absolute ${isSidePlacement ? '-translate-y-1/2' : '-translate-x-1/2'}`}
      style={{
        ...(isSidePlacement ? { top: left } : { left }),
        width: resolvedWidth,
        height: resolvedHeight,
        background: borderColor,
        clipPath,
        ...outerPlacement,
      }}>
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
  sideBoundaryRect?: DOMRect | null,
): TooltipLayout {
  const sideRect = sideBoundaryRect ?? rect;
  const canPlaceTop = rect.top >= bubbleHeight + TOOLTIP_GAP + VIEWPORT_PADDING;
  const canPlaceBottom = viewportHeight - rect.bottom >= bubbleHeight + TOOLTIP_GAP + VIEWPORT_PADDING;
  const canPlaceLeft = sideRect.left >= bubbleWidth + TOOLTIP_GAP + VIEWPORT_PADDING;
  const canPlaceRight = viewportWidth - sideRect.right >= bubbleWidth + TOOLTIP_GAP + VIEWPORT_PADDING;
  let actualPlacement: TooltipPlacement;
  if (preferredPlacement === 'left' || preferredPlacement === 'right') {
    const canPlacePreferred = preferredPlacement === 'left' ? canPlaceLeft : canPlaceRight;
    const oppositePlacement = preferredPlacement === 'left' ? 'right' : 'left';
    const canPlaceOpposite = oppositePlacement === 'left' ? canPlaceLeft : canPlaceRight;
    actualPlacement = canPlacePreferred
      ? preferredPlacement
      : canPlaceOpposite
        ? oppositePlacement
        : canPlaceBottom
          ? 'bottom'
          : canPlaceTop
            ? 'top'
            : preferredPlacement;
  } else {
    actualPlacement = preferredPlacement === 'bottom'
      ? (canPlaceBottom || !canPlaceTop ? 'bottom' : 'top')
      : (canPlaceTop || !canPlaceBottom ? 'top' : 'bottom');
  }
  const anchorCenter = rect.left + (rect.width / 2);
  const anchorMiddle = rect.top + (rect.height / 2);
  if (actualPlacement === 'left' || actualPlacement === 'right') {
    const clampedTop = Math.min(
      Math.max(anchorMiddle - (bubbleHeight / 2), VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, viewportHeight - bubbleHeight - VIEWPORT_PADDING),
    );
    const sideLeft = actualPlacement === 'left'
      ? sideRect.left - TOOLTIP_GAP - bubbleWidth
      : sideRect.right + TOOLTIP_GAP;
    const clampedLeft = Math.min(
      Math.max(sideLeft, VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, viewportWidth - bubbleWidth - VIEWPORT_PADDING),
    );
    const arrowOffset = Math.min(
      Math.max(anchorMiddle - clampedTop, ARROW_SAFE_PADDING),
      Math.max(ARROW_SAFE_PADDING, bubbleHeight - ARROW_SAFE_PADDING),
    );
    return { left: clampedLeft, top: clampedTop, actualPlacement, arrowOffset };
  }
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
  content, children, placement = 'top', maxWidth = 260, disabled = false, surface = 'default', anchorStyle, sideBoundaryRef,
}: TooltipProps) => {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [sideBoundaryRect, setSideBoundaryRect] = useState<DOMRect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: maxWidth, height: 40 });

  const updateRect = useCallback(() => {
    const nextRect = anchorRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
    setSideBoundaryRect(sideBoundaryRef?.current?.getBoundingClientRect() ?? null);
  }, [sideBoundaryRef]);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const handleViewportChange = () => {
      setOpen(false);
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateRect]);

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
    return computeTooltipLayout(rect, window.innerWidth, window.innerHeight, bubbleSize.width, bubbleSize.height, placement, sideBoundaryRect);
  }, [bubbleSize.height, bubbleSize.width, placement, rect, sideBoundaryRect]);
  const tooltip = !disabled && resolvedContent ? (
    open && layout && typeof document !== 'undefined' &&
    createPortal(
      <div
        id={id}
        role="tooltip"
        className="fixed pointer-events-none opacity-100"
        style={{ left: layout.left, top: layout.top, zIndex: TOOLTIP_PORTAL_Z_INDEX }}>
        <div
          ref={bubbleRef}
          className={surface === 'bare'
            ? 'relative'
            : 'svn-tooltip-surface relative p-[8px_10px] rounded-xl border border-border-default text-text-title text-[13px] leading-tight font-ui text-center whitespace-normal shadow-[0_14px_30px_rgba(0,0,0,0.12)] glass'}
          style={{
            maxWidth,
            background: surface === 'bare'
              ? 'transparent'
              : `
                radial-gradient(ellipse at 12% 0%, color-mix(in srgb, var(--liquid-glass-specular, white) 22%, transparent) 0%, transparent 42%),
                linear-gradient(180deg, color-mix(in srgb, var(--liquid-glass-rim, white) 24%, transparent) 0%, transparent 58%),
                ${TOOLTIP_GLASS_FILL_COLOR}
              `,
            backdropFilter: surface === 'bare' ? undefined : TOOLTIP_GLASS_BACKDROP_FILTER,
            WebkitBackdropFilter: surface === 'bare' ? undefined : TOOLTIP_GLASS_BACKDROP_FILTER,
          }}>
          {resolvedContent}
          {surface !== 'bare' && (
            <TooltipArrow
              actualPlacement={layout.actualPlacement}
              left={layout.arrowOffset}
              borderColor={TOOLTIP_GLASS_BORDER_COLOR}
              fillColor={TOOLTIP_GLASS_FILL_COLOR}
            />
          )}
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
