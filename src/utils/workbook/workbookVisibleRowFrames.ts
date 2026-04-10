import type { SplitRow } from '@/types';
import { getWorkbookRowKey } from '@/utils/workbook/workbookPanelHelpers';

export interface WorkbookRowFrame {
  top: number;
  height: number;
}

export interface WorkbookVisibleRowFrameSource {
  framesByKey: ReadonlyMap<string, WorkbookRowFrame>;
  topOffset: number;
}

export function buildWorkbookSectionRowIndexByKey(
  sectionRows: readonly SplitRow[],
): Map<string, number> {
  return new Map(sectionRows.map((row, index) => [getWorkbookRowKey(row), index]));
}

export function collectWorkbookRowFramesByKey<TItem>(
  items: readonly TItem[],
  options: {
    getRowKey: (item: TItem) => string;
    getItemHeight: (item: TItem) => number;
    initialTop?: number;
  },
): Map<string, WorkbookRowFrame> {
  const next = new Map<string, WorkbookRowFrame>();
  let cursorTop = options.initialTop ?? 0;

  items.forEach((item) => {
    const height = options.getItemHeight(item);
    next.set(options.getRowKey(item), {
      top: cursorTop,
      height,
    });
    cursorTop += height;
  });

  return next;
}

export function projectWorkbookVisibleRowFrames(
  sectionRowIndexByKey: ReadonlyMap<string, number>,
  sources: readonly WorkbookVisibleRowFrameSource[],
): Map<number, WorkbookRowFrame> {
  const next = new Map<number, WorkbookRowFrame>();

  sources.forEach(({ framesByKey, topOffset }) => {
    framesByKey.forEach((frame, rowKey) => {
      const rowIndex = sectionRowIndexByKey.get(rowKey);
      if (rowIndex == null) return;
      next.set(rowIndex, {
        top: topOffset + frame.top,
        height: frame.height,
      });
    });
  });

  return next;
}
