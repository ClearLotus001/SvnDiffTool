import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import { splitWorkbookCanvasTextLines } from '@/utils/workbook/workbookCanvasText';
import WorkbookCompareTooltip from '@/components/workbook/WorkbookCompareTooltip';
import { computeTooltipLayout, TooltipArrow } from '@/components/shared/Tooltip';

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

  if (!hover || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: layout.left, top: layout.top }}>
      <div
        ref={bubbleRef}
        className="relative max-w-[360px] px-2.5 py-2 rounded-xl font-ui text-app-xs leading-[1.35] shadow-[0_14px_30px_rgba(0,0,0,0.12)] border border-border-default text-text-title"
        style={{
          background: `linear-gradient(180deg, var(--bg-surface-hover) 0%, var(--bg-surface-solid) 100%)`,
        }}>
        {(hover.address || hover.displayValue) && (
          <div className="grid gap-1 mb-2 pb-2 border-b border-border-default">
            {hover.address && (
              <div
                className="font-bold font-ui text-app-2xs text-text-secondary">
                {hover.address}
              </div>
            )}
            {normalizedDisplayValue && (
              <div
                className="whitespace-pre-wrap break-words font-ui text-app-xs leading-[1.4] text-text-title">
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
          borderColor="var(--border-color)"
          fillColor={layout.actualPlacement === 'top' ? 'var(--bg-surface-solid)' : 'var(--bg-surface-hover)'}
        />
      </div>
    </div>,
    document.body,
  );
});

export default WorkbookCanvasHoverTooltip;
