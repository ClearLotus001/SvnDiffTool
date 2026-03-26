import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useTheme } from '../context/theme';
import { computeTooltipLayout, getTooltipSurfaceBackground, TooltipArrow } from './Tooltip';

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
  const T = useTheme();
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
  const surfaceBackground = getTooltipSurfaceBackground(T);

  if (!hover || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: layout.left,
        top: layout.top,
        zIndex: 9999,
        pointerEvents: 'none',
      }}>
      <div
        ref={bubbleRef}
        style={{
          position: 'relative',
          maxWidth: 280,
          padding: '6px 10px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: surfaceBackground,
          color: T.t0,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1.35,
          fontFamily: FONT_UI,
          boxShadow: '0 14px 30px rgba(0, 0, 0, 0.12)',
          whiteSpace: 'nowrap',
        }}>
        {hover.text}
        <TooltipArrow
          actualPlacement={layout.actualPlacement}
          left={layout.arrowOffset}
          width={14}
          height={8}
          borderColor={T.border}
          fillColor={layout.actualPlacement === 'top' ? T.bg1 : T.bg2}
        />
      </div>
    </div>,
    document.body,
  );
});

export default WorkbookAnchorTooltip;
