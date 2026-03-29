import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/context/theme';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { createPortal } from 'react-dom';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import { splitWorkbookCanvasTextLines } from '@/utils/workbook/workbookCanvasText';
import WorkbookCompareTooltip from '@/components/workbook/WorkbookCompareTooltip';
import { computeTooltipLayout, getTooltipSurfaceBackground, TooltipArrow } from '@/components/shared/Tooltip';

export interface WorkbookCanvasHoverCell {
  key: string;
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
  address?: string;
  displayValue?: string;
  compareCell: WorkbookCompareCellState;
}

interface WorkbookCanvasHoverTooltipProps {
  hover: WorkbookCanvasHoverCell | null;
  baseTitle?: string | undefined;
  mineTitle?: string | undefined;
}

const WorkbookCanvasHoverTooltip = memo(({
  hover,
  baseTitle,
  mineTitle,
}: WorkbookCanvasHoverTooltipProps) => {
  const T = useTheme();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 96 });
  const normalizedDisplayValue = useMemo(() => {
    if (!hover?.displayValue) return '';
    const logicalLines = splitWorkbookCanvasTextLines(hover.displayValue);
    return logicalLines.length > 0 ? logicalLines.join('\n') : hover.displayValue;
  }, [hover?.displayValue]);

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
          maxWidth: 360,
          padding: '8px 10px',
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          background: surfaceBackground,
          color: T.t0,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1.35,
          fontFamily: FONT_UI,
          boxShadow: '0 14px 30px rgba(0, 0, 0, 0.12)',
        }}>
        {(hover.address || hover.displayValue) && (
          <div
            style={{
              display: 'grid',
              gap: 4,
              marginBottom: 8,
              paddingBottom: 8,
              borderBottom: `1px solid ${T.border}`,
            }}>
            {hover.address && (
              <div
                style={{
                  color: T.t2,
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 700,
                  fontFamily: FONT_UI,
                }}>
                {hover.address}
              </div>
            )}
            {normalizedDisplayValue && (
              <div
                style={{
                  color: T.t0,
                  fontSize: FONT_SIZE.sm,
                  lineHeight: 1.4,
                  fontFamily: FONT_UI,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                {normalizedDisplayValue}
              </div>
            )}
          </div>
        )}
        <WorkbookCompareTooltip
          compareCell={hover.compareCell}
          baseTitle={baseTitle}
          mineTitle={mineTitle}
        />
        <TooltipArrow
          actualPlacement={layout.actualPlacement}
          left={layout.arrowOffset}
          borderColor={T.border}
          fillColor={layout.actualPlacement === 'top' ? T.bg1 : T.bg2}
        />
      </div>
    </div>,
    document.body,
  );
});

export default WorkbookCanvasHoverTooltip;
