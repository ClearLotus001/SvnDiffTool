import type { SplitRow } from '../types';
import { parseWorkbookDisplayLine } from './workbookDisplay';

export function shouldRenderSingleMineStackedRow(row: SplitRow): boolean {
  return row.left == null && row.right?.type === 'add';
}

export function shouldRenderSingleBaseStackedRow(row: SplitRow): boolean {
  return row.right == null && row.left?.type === 'delete';
}

export function shouldRenderSingleEqualStackedRow(row: SplitRow): boolean {
  if (!row.left || !row.right) return false;
  if (row.left.type !== 'equal' || row.right.type !== 'equal') return false;
  if (row.left.base == null || row.right.mine == null) return false;
  if (row.left.base !== row.right.mine) return false;

  const leftParsed = parseWorkbookDisplayLine(row.left.base);
  const rightParsed = parseWorkbookDisplayLine(row.right.mine);
  return leftParsed?.kind === 'row'
    && rightParsed?.kind === 'row'
    && leftParsed.rowNumber === rightParsed.rowNumber;
}

export function getStackedWorkbookRowRenderHeight(row: SplitRow, defaultHeight: number, compactHeight: number): number {
  return shouldRenderSingleMineStackedRow(row)
    || shouldRenderSingleBaseStackedRow(row)
    || shouldRenderSingleEqualStackedRow(row)
    ? compactHeight
    : defaultHeight;
}
