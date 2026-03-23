import type { DiffLine } from '../types';
import type { WorkbookCellDisplay, WorkbookRowDisplayLine } from './workbookDisplay';
import { parseWorkbookDisplayLine } from './workbookDisplay';

export interface WorkbookCompareCellState {
  column: number;
  baseCell: WorkbookCellDisplay;
  mineCell: WorkbookCellDisplay;
  changed: boolean;
  masked: boolean;
}

const EMPTY_CELL: WorkbookCellDisplay = { value: '', formula: '' };
const NULL_LINE_CACHE_KEY: object = {};
const compareCellCache = new WeakMap<object, WeakMap<object, Map<string, Map<number, WorkbookCompareCellState>>>>();

export function parseWorkbookRowLine(line: DiffLine | null): WorkbookRowDisplayLine | null {
  if (!line) return null;
  const parsed = parseWorkbookDisplayLine(line.base ?? line.mine ?? '');
  return parsed?.kind === 'row' ? parsed : null;
}

export function getWorkbookMaskedColumns(leftLine: DiffLine | null, rightLine: DiffLine | null): number[] {
  return Array.from(buildWorkbookCompareCells(leftLine, rightLine).values())
    .filter((cell) => cell.masked)
    .map((cell) => cell.column);
}

export function getWorkbookChangedColumns(leftLine: DiffLine | null, rightLine: DiffLine | null): number[] {
  return Array.from(buildWorkbookCompareCells(leftLine, rightLine).values())
    .filter((cell) => cell.changed)
    .map((cell) => cell.column);
}

export function buildWorkbookCompareCells(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  columns?: number[],
): Map<number, WorkbookCompareCellState> {
  const columnsKey = columns && columns.length > 0 ? columns.join(',') : '*';
  const leftKey = (leftLine ?? NULL_LINE_CACHE_KEY) as object;
  const rightKey = (rightLine ?? NULL_LINE_CACHE_KEY) as object;
  let rightCache = compareCellCache.get(leftKey);
  if (!rightCache) {
    rightCache = new WeakMap<object, Map<string, Map<number, WorkbookCompareCellState>>>();
    compareCellCache.set(leftKey, rightCache);
  }
  let columnsCache = rightCache.get(rightKey);
  if (!columnsCache) {
    columnsCache = new Map<string, Map<number, WorkbookCompareCellState>>();
    rightCache.set(rightKey, columnsCache);
  }
  const cached = columnsCache.get(columnsKey);
  if (cached) return cached;

  const leftRow = parseWorkbookRowLine(leftLine);
  const rightRow = parseWorkbookRowLine(rightLine);
  const result = new Map<number, WorkbookCompareCellState>();

  if (!leftRow && !rightRow) {
    columnsCache.set(columnsKey, result);
    return result;
  }

  const columnSet = columns && columns.length > 0
    ? columns
    : Array.from({ length: Math.max(leftRow?.cells.length ?? 0, rightRow?.cells.length ?? 0) }, (_, index) => index);

  if (!leftRow || !rightRow) {
    const existingSide = leftRow ? 'base' : 'mine';
    const existingRow = leftRow ?? rightRow;
    if (!existingRow) return result;

    columnSet.forEach((column) => {
      const existingCell = existingRow.cells[column] ?? EMPTY_CELL;
      const hasVisibleContent = Boolean(existingCell.value.trim() || existingCell.formula.trim());
      if (!hasVisibleContent) return;
      result.set(column, {
        column,
        baseCell: existingSide === 'base' ? existingCell : EMPTY_CELL,
        mineCell: existingSide === 'mine' ? existingCell : EMPTY_CELL,
        changed: true,
        masked: false,
      });
    });

    columnsCache.set(columnsKey, result);
    return result;
  }

  columnSet.forEach((column) => {
    const leftCell = leftRow.cells[column] ?? EMPTY_CELL;
    const rightCell = rightRow.cells[column] ?? EMPTY_CELL;
    const changed = leftCell.value !== rightCell.value || leftCell.formula !== rightCell.formula;
    const hasVisibleContent = Boolean(
      leftCell.value.trim()
      || leftCell.formula.trim()
      || rightCell.value.trim()
      || rightCell.formula.trim(),
    );

    if (!hasVisibleContent) return;

    result.set(column, {
      column,
      baseCell: leftCell,
      mineCell: rightCell,
      changed,
      masked: !changed,
    });
  });

  columnsCache.set(columnsKey, result);
  return result;
}
