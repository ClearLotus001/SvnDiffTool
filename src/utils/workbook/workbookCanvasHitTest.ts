import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { getWorkbookCanvasCellViewportRect } from '@/utils/workbook/workbookMergeLayout';

export interface WorkbookCanvasXFrame {
  left: number;
  right: number;
}

export interface WorkbookCanvasYFrame {
  top: number;
  bottom: number;
}

export interface WorkbookCanvasHitColumnFrame extends WorkbookCanvasXFrame {
  entry: HorizontalVirtualColumnEntry;
  drawLeft: number;
  frozen: boolean;
}

export function findWorkbookCanvasHitXFrame<TFrame extends WorkbookCanvasXFrame>(
  frames: readonly TFrame[],
  x: number,
): TFrame | null {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = frames[mid]!;
    if (x < frame.left) {
      high = mid - 1;
    } else if (x >= frame.right) {
      low = mid + 1;
    } else {
      return frame;
    }
  }
  return null;
}

export function findWorkbookCanvasHitYFrame<TFrame extends WorkbookCanvasYFrame>(
  frames: readonly TFrame[],
  y: number,
): TFrame | null {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = frames[mid]!;
    if (y < frame.top) {
      high = mid - 1;
    } else if (y >= frame.bottom) {
      low = mid + 1;
    } else {
      return frame;
    }
  }
  return null;
}

export function buildWorkbookCanvasHitColumnFrames(params: {
  frozenEntries: readonly HorizontalVirtualColumnEntry[];
  floatingEntries: readonly HorizontalVirtualColumnEntry[];
  contentLeft: number;
  frozenWidth: number;
  scrollLeft: number;
  getDrawWidth?: (entry: HorizontalVirtualColumnEntry) => number;
}): WorkbookCanvasHitColumnFrame[] {
  const {
    contentLeft,
    floatingEntries,
    frozenEntries,
    frozenWidth,
    getDrawWidth,
    scrollLeft,
  } = params;
  const frames: WorkbookCanvasHitColumnFrame[] = [];

  const addFrame = (
    entry: HorizontalVirtualColumnEntry,
    drawLeft: number,
    frozen: boolean,
  ) => {
    const drawWidth = getDrawWidth?.(entry) ?? entry.width;
    const viewportRect = getWorkbookCanvasCellViewportRect({
      drawLeft,
      drawWidth,
      contentLeft,
      frozenWidth,
      frozen,
    });
    if (!viewportRect) return;
    frames.push({
      entry,
      drawLeft,
      left: viewportRect.left,
      right: viewportRect.left + viewportRect.width,
      frozen,
    });
  };

  frozenEntries.forEach((entry) => {
    addFrame(entry, contentLeft + entry.offset, true);
  });
  floatingEntries.forEach((entry) => {
    addFrame(entry, contentLeft + entry.offset - scrollLeft, false);
  });

  frames.sort((left, right) => left.left - right.left || left.right - right.right);
  return frames;
}
