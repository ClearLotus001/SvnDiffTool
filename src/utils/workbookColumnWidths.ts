import { FONT_UI } from '../constants/typography';
import type { SplitRow } from '../types';
import { parseWorkbookRowLine } from './workbookCompare';
import { WORKBOOK_CELL_WIDTH } from './workbookDisplay';
import { getWorkbookColumnLabel } from './workbookSections';

export type WorkbookColumnWidthBySheet = Record<string, Record<number, number>>;

export const MIN_WORKBOOK_COLUMN_WIDTH = 72;
export const MAX_WORKBOOK_COLUMN_WIDTH = 420;
const AUTO_FIT_HORIZONTAL_PADDING = 24;

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

export function clampWorkbookColumnWidth(value: number): number {
  if (!Number.isFinite(value)) return WORKBOOK_CELL_WIDTH;
  return Math.max(MIN_WORKBOOK_COLUMN_WIDTH, Math.min(MAX_WORKBOOK_COLUMN_WIDTH, Math.round(value)));
}

export function getWorkbookColumnWidth(
  columnWidthBySheet: WorkbookColumnWidthBySheet,
  sheetName: string,
  column: number,
): number {
  return clampWorkbookColumnWidth(
    columnWidthBySheet[sheetName]?.[column] ?? WORKBOOK_CELL_WIDTH,
  );
}

function approximateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  return text.length * Math.max(6, fontSize * 0.62);
}

function measureTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  if (typeof document === 'undefined') {
    return approximateTextWidth(text, fontSize);
  }

  sharedMeasureCanvas ??= document.createElement('canvas');
  const ctx = sharedMeasureCanvas.getContext('2d');
  if (!ctx) return approximateTextWidth(text, fontSize);
  ctx.font = `${fontSize}px ${FONT_UI}`;
  return ctx.measureText(text).width;
}

function normalizeCellDisplayText(value: string): string {
  return value
    .replace(/\u001F/g, ' ')
    .replace(/\r\n/g, ' / ')
    .replace(/\r/g, ' / ')
    .replace(/\n/g, ' / ');
}

export function measureWorkbookAutoFitColumnWidth(
  rows: SplitRow[],
  column: number,
  fontSize: number,
): number {
  let maxWidth = measureTextWidth(getWorkbookColumnLabel(column), fontSize);

  rows.forEach((row) => {
    const baseRow = parseWorkbookRowLine(row.left);
    const mineRow = parseWorkbookRowLine(row.right);
    const values = [
      baseRow?.cells[column]?.value ?? '',
      mineRow?.cells[column]?.value ?? '',
    ];

    values.forEach((value) => {
      const normalized = normalizeCellDisplayText(value);
      const measured = measureTextWidth(normalized, fontSize);
      if (measured > maxWidth) maxWidth = measured;
    });
  });

  return clampWorkbookColumnWidth(maxWidth + AUTO_FIT_HORIZONTAL_PADDING);
}
