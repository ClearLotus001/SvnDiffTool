import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeTooltipLayout, TooltipArrow } from '@/components/shared/Tooltip';

export interface WorkbookAnchorTooltipState {
  key: string;
  text: string;
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
}

interface WorkbookAnchorTooltipProps {
  hover: WorkbookAnchorTooltipState | null;
}

const WorkbookAnchorTooltip = memo(({ hover }: WorkbookAnchorTooltipProps) => {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 180, height: 36 });

  useLayoutEffect(() => {
    if (!hover) return;
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const nextWidth = Math.ceil(bubble.offsetWidth);
    const nextHeight = Math.ceil(bubble.offsetHeight);
    setBubbleSize((prev) => (
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    ));
  }, [hover]);

  const layout = useMemo(() => {
    if (!hover || typeof window === 'undefined') return null;
    return computeTooltipLayout(
      hover.anchorRect as DOMRect,
      window.innerWidth,
      window.innerHeight,
      bubbleSize.width,
      bubbleSize.height,
      'top',
    );
  }, [bubbleSize.height, bubbleSize.width, hover]);

  if (!hover || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: layout.left, top: layout.top }}>
      <div
        ref={bubbleRef}
        className="relative max-w-[280px] px-2.5 py-1.5 rounded-[10px] font-ui text-app-xs leading-[1.35] whitespace-nowrap shadow-[0_14px_30px_rgba(0,0,0,0.12)] border border-border-default text-text-title"
        style={{
          background: `linear-gradient(180deg, var(--bg-surface-hover) 0%, var(--bg-surface-solid) 100%)`,
        }}>
        {hover.text}
        <TooltipArrow
          actualPlacement={layout.actualPlacement}
          left={layout.arrowOffset}
          width={14}
          height={8}
          borderColor="var(--border-color)"
          fillColor={layout.actualPlacement === 'top' ? 'var(--bg-surface-solid)' : 'var(--bg-surface-hover)'}
        />
      </div>
    </div>,
    document.body,
  );
});

export default WorkbookAnchorTooltip;
