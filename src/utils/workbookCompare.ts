import type { DiffLine, WorkbookCellDelta, WorkbookCompareMode, WorkbookRowDelta } from '../types';
import {
  buildWorkbookRowDelta,
  buildWorkbookSplitRowDelta,
  parseWorkbookRowLine,
} from './workbookDelta';

export type WorkbookCompareCellState = WorkbookCellDelta;
export type WorkbookCompareRowState = WorkbookRowDelta;
export { parseWorkbookRowLine };

export function getWorkbookMaskedColumns(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  compareMode: WorkbookCompareMode = 'strict',
): number[] {
  return Array.from(buildWorkbookCompareCells(leftLine, rightLine, undefined, compareMode).values())
    .filter((cell) => cell.masked)
    .map((cell) => cell.column);
}

export function getWorkbookChangedColumns(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  compareMode: WorkbookCompareMode = 'strict',
): number[] {
  return buildWorkbookCompareRowState(leftLine, rightLine, undefined, compareMode).changedColumns;
}

export function buildWorkbookCompareRowState(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  columns?: number[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCompareRowState {
  return buildWorkbookRowDelta(leftLine, rightLine, columns, compareMode);
}

export function buildWorkbookSplitRowCompareState(
  row: { left: DiffLine | null; right: DiffLine | null; workbookRowDelta?: WorkbookRowDelta },
  columns?: number[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCompareRowState {
  return buildWorkbookSplitRowDelta(row, columns, compareMode);
}

export function buildWorkbookCompareCells(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  columns?: number[],
  compareMode: WorkbookCompareMode = 'strict',
): Map<number, WorkbookCompareCellState> {
  return buildWorkbookCompareRowState(leftLine, rightLine, columns, compareMode).cellDeltas;
}
