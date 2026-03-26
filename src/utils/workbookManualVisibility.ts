import type {
  WorkbookHiddenColumnSegment,
  WorkbookHiddenStateBySheet,
  WorkbookSelectedCell,
  WorkbookSelectionState,
  WorkbookSheetHiddenState,
} from '../types';

export interface WorkbookRowVisibilitySegment<RowT extends { lineIdx: number }> {
  kind: 'visible' | 'hidden';
  rows: RowT[];
  rowNumbers: number[];
}

function createEmptySheetHiddenState(): WorkbookSheetHiddenState {
  return {
    hiddenRows: [],
    hiddenColumns: [],
  };
}

function buildSortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function getWorkbookSheetHiddenState(
  hiddenStateBySheet: WorkbookHiddenStateBySheet,
  sheetName: string,
): WorkbookSheetHiddenState {
  return hiddenStateBySheet[sheetName] ?? createEmptySheetHiddenState();
}

function patchWorkbookSheetHiddenState(
  current: WorkbookHiddenStateBySheet,
  sheetName: string,
  updater: (state: WorkbookSheetHiddenState) => WorkbookSheetHiddenState,
): WorkbookHiddenStateBySheet {
  const previous = getWorkbookSheetHiddenState(current, sheetName);
  const next = updater(previous);
  if (
    previous.hiddenRows.length === next.hiddenRows.length
    && previous.hiddenColumns.length === next.hiddenColumns.length
    && previous.hiddenRows.every((value, index) => value === next.hiddenRows[index])
    && previous.hiddenColumns.every((value, index) => value === next.hiddenColumns[index])
  ) {
    return current;
  }

  if (next.hiddenRows.length === 0 && next.hiddenColumns.length === 0) {
    if (!(sheetName in current)) return current;
    const clone = { ...current };
    delete clone[sheetName];
    return clone;
  }

  return {
    ...current,
    [sheetName]: next,
  };
}

export function hideWorkbookRows(
  current: WorkbookHiddenStateBySheet,
  sheetName: string,
  rowNumbers: number[],
): WorkbookHiddenStateBySheet {
  const nextRowNumbers = buildSortedUnique(rowNumbers.filter(rowNumber => rowNumber > 0));
  if (nextRowNumbers.length === 0) return current;

  return patchWorkbookSheetHiddenState(current, sheetName, (sheetState) => ({
    ...sheetState,
    hiddenRows: buildSortedUnique([...sheetState.hiddenRows, ...nextRowNumbers]),
  }));
}

export function hideWorkbookColumns(
  current: WorkbookHiddenStateBySheet,
  sheetName: string,
  columns: number[],
): WorkbookHiddenStateBySheet {
  const nextColumns = buildSortedUnique(columns.filter(column => column >= 0));
  if (nextColumns.length === 0) return current;

  return patchWorkbookSheetHiddenState(current, sheetName, (sheetState) => ({
    ...sheetState,
    hiddenColumns: buildSortedUnique([...sheetState.hiddenColumns, ...nextColumns]),
  }));
}

export function revealWorkbookRows(
  current: WorkbookHiddenStateBySheet,
  sheetName: string,
  rowNumbers: number[],
): WorkbookHiddenStateBySheet {
  if (rowNumbers.length === 0) return current;
  const rowNumberSet = new Set(rowNumbers);
  return patchWorkbookSheetHiddenState(current, sheetName, (sheetState) => ({
    ...sheetState,
    hiddenRows: sheetState.hiddenRows.filter(rowNumber => !rowNumberSet.has(rowNumber)),
  }));
}

export function revealWorkbookColumns(
  current: WorkbookHiddenStateBySheet,
  sheetName: string,
  columns: number[],
): WorkbookHiddenStateBySheet {
  if (columns.length === 0) return current;
  const columnSet = new Set(columns);
  return patchWorkbookSheetHiddenState(current, sheetName, (sheetState) => ({
    ...sheetState,
    hiddenColumns: sheetState.hiddenColumns.filter(column => !columnSet.has(column)),
  }));
}

export function revealWorkbookSelection(
  current: WorkbookHiddenStateBySheet,
  selection: WorkbookSelectedCell | null,
): WorkbookHiddenStateBySheet {
  if (!selection) return current;
  let next = current;

  if (selection.kind !== 'column' && selection.rowNumber > 0) {
    next = revealWorkbookRows(next, selection.sheetName, [selection.rowNumber]);
  }
  if (selection.kind !== 'row' && selection.colIndex >= 0) {
    next = revealWorkbookColumns(next, selection.sheetName, [selection.colIndex]);
  }

  return next;
}

export function splitWorkbookRowsByVisibility<RowT extends { lineIdx: number }>(
  rows: RowT[],
  hiddenRowNumbers: Set<number>,
  getRowNumber: (row: RowT) => number | null,
): Array<WorkbookRowVisibilitySegment<RowT>> {
  const segments: Array<WorkbookRowVisibilitySegment<RowT>> = [];
  let currentKind: WorkbookRowVisibilitySegment<RowT>['kind'] | null = null;
  let currentRows: RowT[] = [];
  let currentRowNumbers: number[] = [];

  const flush = () => {
    if (currentKind == null || currentRows.length === 0) return;
    segments.push({
      kind: currentKind,
      rows: currentRows,
      rowNumbers: currentRowNumbers,
    });
    currentKind = null;
    currentRows = [];
    currentRowNumbers = [];
  };

  rows.forEach((row) => {
    const rowNumber = getRowNumber(row);
    const nextKind: WorkbookRowVisibilitySegment<RowT>['kind'] = (
      rowNumber != null && hiddenRowNumbers.has(rowNumber)
    ) ? 'hidden' : 'visible';

    if (currentKind !== nextKind) flush();
    currentKind = nextKind;
    currentRows.push(row);
    if (rowNumber != null) currentRowNumbers.push(rowNumber);
  });

  flush();
  return segments;
}

export function buildWorkbookHiddenColumnSegments(
  allColumns: number[],
  hiddenColumns: number[],
): WorkbookHiddenColumnSegment[] {
  const hiddenColumnSet = new Set(hiddenColumns);
  if (hiddenColumnSet.size === 0 || allColumns.length === 0) return [];

  const segments: WorkbookHiddenColumnSegment[] = [];
  let startCol: number | null = null;
  let previousCol: number | null = null;
  let segmentColumns: number[] = [];

  allColumns.forEach((column, index) => {
    if (!hiddenColumnSet.has(column)) {
      if (startCol != null && previousCol != null) {
        const beforeColumn = allColumns
          .slice(0, index)
          .reverse()
          .find(value => !hiddenColumnSet.has(value)) ?? null;
        const afterColumn = column;
        segments.push({
          startCol,
          endCol: previousCol,
          columns: segmentColumns,
          count: segmentColumns.length,
          beforeColumn,
          afterColumn,
        });
      }
      startCol = null;
      previousCol = null;
      segmentColumns = [];
      return;
    }

    if (startCol == null) startCol = column;
    previousCol = column;
    segmentColumns.push(column);
  });

  if (startCol != null && previousCol != null) {
    const resolvedStartCol = startCol;
    const beforeColumn = [...allColumns]
      .reverse()
      .find(value => value < resolvedStartCol && !hiddenColumnSet.has(value)) ?? null;
    segments.push({
      startCol: resolvedStartCol,
      endCol: previousCol,
      columns: segmentColumns,
      count: segmentColumns.length,
      beforeColumn,
      afterColumn: null,
    });
  }

  return segments;
}

export function overlayHiddenWorkbookRowsOnItems<TItem, RowT extends { lineIdx: number }>(
  items: TItem[],
  hiddenRowNumbers: Set<number>,
  getRowFromItem: (item: TItem) => RowT | null,
  getRowNumber: (row: RowT) => number | null,
  buildHiddenItem: (rows: RowT[], rowNumbers: number[]) => TItem,
): TItem[] {
  if (hiddenRowNumbers.size === 0 || items.length === 0) return items;

  const value: TItem[] = [];
  let hiddenRowsBuffer: RowT[] = [];
  let hiddenRowNumbersBuffer: number[] = [];

  const flushHiddenRows = () => {
    if (hiddenRowsBuffer.length === 0) return;
    value.push(buildHiddenItem(hiddenRowsBuffer, hiddenRowNumbersBuffer));
    hiddenRowsBuffer = [];
    hiddenRowNumbersBuffer = [];
  };

  items.forEach((item) => {
    const row = getRowFromItem(item);
    if (!row) {
      flushHiddenRows();
      value.push(item);
      return;
    }

    const rowNumber = getRowNumber(row);
    if (rowNumber != null && hiddenRowNumbers.has(rowNumber)) {
      hiddenRowsBuffer.push(row);
      hiddenRowNumbersBuffer.push(rowNumber);
      return;
    }

    flushHiddenRows();
    value.push(item);
  });

  flushHiddenRows();
  return value;
}

export function getSelectedWorkbookRows(selection: WorkbookSelectionState): number[] {
  return buildSortedUnique(
    selection.items
      .filter(item => item.kind === 'row')
      .map(item => item.rowNumber)
      .filter(rowNumber => rowNumber > 0),
  );
}

export function getSelectedWorkbookColumns(selection: WorkbookSelectionState): number[] {
  return buildSortedUnique(
    selection.items
      .filter(item => item.kind === 'column')
      .map(item => item.colIndex)
      .filter(column => column >= 0),
  );
}
