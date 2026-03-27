import type { SplitRow, WorkbookMoveDirection, WorkbookSelectedCell } from '@/types';
import type { WorkbookCellDisplay, WorkbookRowDisplayLine } from '@/utils/workbook/workbookDisplay';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import { findWorkbookMergeRange } from '@/utils/workbook/workbookMergeLayout';

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

interface CachedSplitRowParse {
  base?: WorkbookRowDisplayLine | null;
  mine?: WorkbookRowDisplayLine | null;
  rowNumber?: number | null;
}

const splitRowParseCache = new WeakMap<SplitRow, CachedSplitRowParse>();

function getCachedSplitRowParse(row: SplitRow): CachedSplitRowParse {
  let cached = splitRowParseCache.get(row);
  if (!cached) {
    cached = {};
    splitRowParseCache.set(row, cached);
  }
  return cached;
}

function parseWorkbookSplitRowSide(
  row: SplitRow,
  side: 'base' | 'mine',
): WorkbookRowDisplayLine | null {
  const cached = getCachedSplitRowParse(row);
  const cachedParsed = side === 'base' ? cached.base : cached.mine;
  if (cachedParsed !== undefined) return cachedParsed;

  const parsed = side === 'base'
    ? parseWorkbookRow(row.left?.base ?? null)
    : parseWorkbookRow(row.right?.mine ?? null);

  if (side === 'base') {
    cached.base = parsed;
  } else {
    cached.mine = parsed;
  }
  return parsed;
}

export function getWorkbookSplitRowNumber(row: SplitRow): number | null {
  const cached = getCachedSplitRowParse(row);
  if (cached.rowNumber !== undefined) return cached.rowNumber;

  const leftParsed = parseWorkbookRow(row.left?.base ?? row.left?.mine ?? null);
  if (leftParsed) {
    cached.rowNumber = leftParsed.rowNumber;
    return leftParsed.rowNumber;
  }

  const rightParsed = parseWorkbookRow(row.right?.mine ?? row.right?.base ?? null);
  cached.rowNumber = rightParsed?.rowNumber ?? null;
  return cached.rowNumber;
}

export function getWorkbookSideRowNumber(
  row: SplitRow,
  side: 'base' | 'mine',
): number | null {
  return parseWorkbookSplitRowSide(row, side)?.rowNumber ?? null;
}

export function buildWorkbookRowEntry(
  row: SplitRow,
  side: 'base' | 'mine',
  sheetName: string,
  versionLabel: string,
  visibleColumns: number[] = [],
): WorkbookRowEntry | null {
  const parsed = parseWorkbookSplitRowSide(row, side);

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
  mergeRanges: WorkbookMergeRange[] = [],
): WorkbookSelectedCell {
  const fallbackColumns = entry.cells.map((_, index) => index);
  const visibleColumns = entry.visibleColumns.length > 0 ? entry.visibleColumns : fallbackColumns;
  const mergeRange = findWorkbookMergeRange(mergeRanges, entry.rowNumber, requestedColIndex);
  const normalizedColumn = mergeRange?.startCol ?? requestedColIndex;
  const clampedColumn = visibleColumns.includes(normalizedColumn)
    ? normalizedColumn
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
  mergeRangesBySide: Partial<Record<'base' | 'mine', WorkbookMergeRange[]>> = {},
): WorkbookSelectedCell | null {
  if (!selection || selection.kind !== 'cell') return null;

  const scopedEntries = entries.filter(entry => (
    entry.sheetName === selection.sheetName
    && entry.side === selection.side
  ));

  if (scopedEntries.length === 0) return null;

  const currentIndex = scopedEntries.findIndex(entry => entry.rowNumber === selection.rowNumber);
  if (currentIndex < 0) return null;

  const sideMergeRanges = mergeRangesBySide[selection.side] ?? [];

  if (direction === 'left' || direction === 'right') {
    const currentEntry = scopedEntries[currentIndex]!;
    const visibleColumns = currentEntry.visibleColumns.length > 0
      ? currentEntry.visibleColumns
      : currentEntry.cells.map((_, index) => index);
    const currentRange = findWorkbookMergeRange(sideMergeRanges, selection.rowNumber, selection.colIndex);
    const currentStartColumn = currentRange?.startCol ?? selection.colIndex;
    const currentEndColumn = currentRange?.endCol ?? selection.colIndex;
    const startVisibleIndex = Math.max(
      0,
      visibleColumns.findIndex(column => column === currentStartColumn),
    );
    const endVisibleIndex = Math.max(
      startVisibleIndex,
      visibleColumns.findIndex(column => column === currentEndColumn),
    );
    const nextVisibleIndex = direction === 'left'
      ? Math.max(0, startVisibleIndex - 1)
      : Math.min(visibleColumns.length - 1, endVisibleIndex + 1);
    return buildWorkbookSelectedCell(
      currentEntry,
      visibleColumns[nextVisibleIndex] ?? selection.colIndex,
      sideMergeRanges,
    );
  }

  const nextIndex = direction === 'up'
    ? Math.max(0, currentIndex - 1)
    : Math.min(scopedEntries.length - 1, currentIndex + 1);

  return buildWorkbookSelectedCell(scopedEntries[nextIndex]!, selection.colIndex, sideMergeRanges);
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
