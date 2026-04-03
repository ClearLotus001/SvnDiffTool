import type {
  Hunk,
  SplitRow,
  WorkbookCellDelta,
  WorkbookCompareMode,
  WorkbookSelectedCell,
} from '@/types';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import type { WorkbookMiniMapTone } from '@/components/workbook/WorkbookMiniMap';
import {
  buildWorkbookRowEntry,
  getWorkbookSideRowNumber,
  type WorkbookRowEntry,
} from '@/utils/workbook/workbookNavigation';

export const WORKBOOK_CONTEXT_LINES = 3;

export interface WorkbookRowEntryMaps {
  base: Map<number, WorkbookRowEntry>;
  mine: Map<number, WorkbookRowEntry>;
}

export interface WorkbookCompareCellsMaps {
  base: Map<number, Map<number, WorkbookCellDelta>>;
  mine: Map<number, Map<number, WorkbookCellDelta>>;
}

const workbookRowEntryMapsCache = new WeakMap<SplitRow[], Map<string, WorkbookRowEntryMaps>>();
const workbookCompareCellsMapsCache = new WeakMap<SplitRow[], Map<string, WorkbookCompareCellsMaps>>();

export function workbookRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

export function workbookRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

export function isEqualWorkbookRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

export function rowTouchesGuidedHunk(row: SplitRow, guidedHunkRange: Hunk | null): boolean {
  if (!guidedHunkRange) return false;
  return row.lineIdxs.some(idx => idx >= guidedHunkRange.startIdx && idx <= guidedHunkRange.endIdx);
}

export function getWorkbookRowKey(row: SplitRow): string {
  return row.lineIdxs.length > 0 ? row.lineIdxs.join(':') : String(row.lineIdx);
}

export function buildSelectionAutoScrollKey(
  sheetName: string,
  selection: WorkbookSelectedCell | null,
): string {
  if (!selection) return '';
  return [
    sheetName,
    selection.kind,
    selection.side,
    selection.rowNumber,
    selection.colIndex,
  ].join(':');
}

export function getWorkbookMiniMapTone(
  row: SplitRow,
  visibleColumns: number[],
  compareMode: WorkbookCompareMode,
): WorkbookMiniMapTone {
  return buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode).tone;
}

export function buildWorkbookRowEntryMaps(
  rows: SplitRow[],
  sheetName: string,
  baseVersion: string,
  mineVersion: string,
  visibleColumns: number[],
): WorkbookRowEntryMaps {
  let cacheByRows = workbookRowEntryMapsCache.get(rows);
  if (!cacheByRows) {
    cacheByRows = new Map();
    workbookRowEntryMapsCache.set(rows, cacheByRows);
  }

  const cacheKey = [
    sheetName,
    baseVersion,
    mineVersion,
    visibleColumns.join(','),
  ].join('::');
  const cached = cacheByRows.get(cacheKey);
  if (cached) return cached;

  const next: WorkbookRowEntryMaps = {
    base: new Map<number, WorkbookRowEntry>(),
    mine: new Map<number, WorkbookRowEntry>(),
  };

  rows.forEach((row) => {
    const baseEntry = buildWorkbookRowEntry(row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(row, 'mine', sheetName, mineVersion, visibleColumns);
    if (baseEntry) next.base.set(baseEntry.rowNumber, baseEntry);
    if (mineEntry) next.mine.set(mineEntry.rowNumber, mineEntry);
  });

  cacheByRows.set(cacheKey, next);
  return next;
}

export function buildWorkbookCompareCellsMaps(
  rows: SplitRow[],
  visibleColumns: number[],
  compareMode: WorkbookCompareMode,
): WorkbookCompareCellsMaps {
  let cacheByRows = workbookCompareCellsMapsCache.get(rows);
  if (!cacheByRows) {
    cacheByRows = new Map();
    workbookCompareCellsMapsCache.set(rows, cacheByRows);
  }

  const cacheKey = `${compareMode}::${visibleColumns.join(',')}`;
  const cached = cacheByRows.get(cacheKey);
  if (cached) return cached;

  const next: WorkbookCompareCellsMaps = {
    base: new Map<number, Map<number, WorkbookCellDelta>>(),
    mine: new Map<number, Map<number, WorkbookCellDelta>>(),
  };

  rows.forEach((row) => {
    const rowDelta = buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode);
    const baseRowNumber = getWorkbookSideRowNumber(row, 'base');
    if (baseRowNumber != null) next.base.set(baseRowNumber, rowDelta.cellDeltas);

    const mineRowNumber = getWorkbookSideRowNumber(row, 'mine');
    if (mineRowNumber != null) next.mine.set(mineRowNumber, rowDelta.cellDeltas);
  });

  cacheByRows.set(cacheKey, next);
  return next;
}

export interface SelectionAutoScrollLock {
  sheetName: string;
  hunkIdx: number;
  rowKey: string;
  cellKey: string;
}
