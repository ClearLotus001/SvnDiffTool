import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import { splitWorkbookCanvasTextLines } from '@/utils/workbook/workbookCanvasText';
import WorkbookCompareTooltip from '@/components/workbook/WorkbookCompareTooltip';
import {
  computeTooltipLayout,
  TooltipArrow,
  TOOLTIP_GLASS_BACKDROP_FILTER,
  TOOLTIP_GLASS_BORDER_COLOR,
  TOOLTIP_GLASS_BOX_SHADOW,
  TOOLTIP_GLASS_FILL_COLOR,
  TOOLTIP_PORTAL_Z_INDEX,
} from '@/components/shared/Tooltip';

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
  compareCell: WorkbookCompareCellState | null | undefined;
  maskedRegionId?: string;
  maskedRegionRowNumber?: number;
  maskedRegionColumn?: number;
  wrapText?: boolean;
  isTextTruncated?: boolean;
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
      role="tooltip"
      className="fixed pointer-events-none"
      style={{ left: layout.left, top: layout.top, zIndex: TOOLTIP_PORTAL_Z_INDEX }}>
      <div
        ref={bubbleRef}
        className="svn-tooltip-surface relative max-w-[360px] px-2.5 py-2 rounded-xl font-ui text-app-xs leading-[1.35] border border-border-default text-text-title glass"
        style={{
          background: TOOLTIP_GLASS_FILL_COLOR,
          backdropFilter: TOOLTIP_GLASS_BACKDROP_FILTER,
          WebkitBackdropFilter: TOOLTIP_GLASS_BACKDROP_FILTER,
          boxShadow: TOOLTIP_GLASS_BOX_SHADOW,
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
        {hover.compareCell && (
          <WorkbookCompareTooltip
            compareCell={hover.compareCell}
            baseTitle={baseTitle}
            mineTitle={mineTitle}
          />
        )}
        <TooltipArrow
          actualPlacement={layout.actualPlacement}
          left={layout.arrowOffset}
          borderColor={TOOLTIP_GLASS_BORDER_COLOR}
          fillColor={TOOLTIP_GLASS_FILL_COLOR}
        />
      </div>
    </div>,
    document.body,
  );
});

export default WorkbookCanvasHoverTooltip;
