import type { SplitRow, WorkbookMoveDirection, WorkbookSelectedCell } from '../types';
import type { WorkbookCellDisplay, WorkbookRowDisplayLine } from './workbookDisplay';
import { parseWorkbookDisplayLine } from './workbookDisplay';
import type { WorkbookSection } from './workbookSections';

export interface WorkbookRowEntry {
  sheetName: string;
  side: 'base' | 'mine';
  versionLabel: string;
  rowNumber: number;
  cells: WorkbookCellDisplay[];
  visibleColumns: number[];
  lineIdxs: number[];
}

function normalizeRowCells(cells: WorkbookCellDisplay[]): WorkbookCellDisplay[] {
  return cells.length > 0 ? cells : [{ value: '', formula: '' }];
}

function parseWorkbookRow(line: string | null): WorkbookRowDisplayLine | null {
  if (!line) return null;
  const parsed = parseWorkbookDisplayLine(line);
  return parsed?.kind === 'row' ? parsed : null;
}

export function buildWorkbookRowEntry(
  row: SplitRow,
  side: 'base' | 'mine',
  sheetName: string,
  versionLabel: string,
  visibleColumns: number[] = [],
): WorkbookRowEntry | null {
  const parsed = side === 'base'
    ? parseWorkbookRow(row.left?.base ?? null)
    : parseWorkbookRow(row.right?.mine ?? null);

  if (!parsed) return null;

  return {
    sheetName,
    side,
    versionLabel,
    rowNumber: parsed.rowNumber,
    cells: normalizeRowCells(parsed.cells),
    visibleColumns,
    lineIdxs: row.lineIdxs,
  };
}

export function buildWorkbookSelectedCell(
  entry: WorkbookRowEntry,
  requestedColIndex: number,
): WorkbookSelectedCell {
  const fallbackColumns = entry.cells.map((_, index) => index);
  const visibleColumns = entry.visibleColumns.length > 0 ? entry.visibleColumns : fallbackColumns;
  const clampedColumn = visibleColumns.includes(requestedColIndex)
    ? requestedColIndex
    : visibleColumns[0] ?? 0;
  const colIndex = Math.max(0, clampedColumn);
  const cell = entry.cells[colIndex] ?? { value: '', formula: '' };
  const colLabel = getWorkbookColumnLabel(colIndex);

  return {
    kind: 'cell',
    sheetName: entry.sheetName,
    side: entry.side,
    versionLabel: entry.versionLabel,
    rowNumber: entry.rowNumber,
    colIndex,
    colLabel,
    address: `${colLabel}${entry.rowNumber}`,
    value: cell.value,
    formula: cell.formula,
  };
}

export function moveWorkbookSelection(
  entries: WorkbookRowEntry[],
  selection: WorkbookSelectedCell | null,
  direction: WorkbookMoveDirection,
): WorkbookSelectedCell | null {
  if (!selection || selection.kind !== 'cell') return null;

  const scopedEntries = entries.filter(entry => (
    entry.sheetName === selection.sheetName
    && entry.side === selection.side
  ));

  if (scopedEntries.length === 0) return null;

  const currentIndex = scopedEntries.findIndex(entry => entry.rowNumber === selection.rowNumber);
  if (currentIndex < 0) return null;

  if (direction === 'left' || direction === 'right') {
    const currentEntry = scopedEntries[currentIndex]!;
    const visibleColumns = currentEntry.visibleColumns.length > 0
      ? currentEntry.visibleColumns
      : currentEntry.cells.map((_, index) => index);
    const currentVisibleIndex = Math.max(
      0,
      visibleColumns.findIndex(column => column === selection.colIndex),
    );
    const nextVisibleIndex = direction === 'left'
      ? Math.max(0, currentVisibleIndex - 1)
      : Math.min(visibleColumns.length - 1, currentVisibleIndex + 1);
    return buildWorkbookSelectedCell(currentEntry, visibleColumns[nextVisibleIndex] ?? selection.colIndex);
  }

  const nextIndex = direction === 'up'
    ? Math.max(0, currentIndex - 1)
    : Math.min(scopedEntries.length - 1, currentIndex + 1);

  return buildWorkbookSelectedCell(scopedEntries[nextIndex]!, selection.colIndex);
}

export function findWorkbookSectionIndexByName(
  sections: WorkbookSection[],
  sheetName: string,
): number {
  const foundIndex = sections.findIndex(section => section.name === sheetName);
  return foundIndex >= 0 ? foundIndex : 0;
}

function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}
