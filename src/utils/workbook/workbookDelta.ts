import type {
  DiffLine,
  WorkbookCellDelta,
  WorkbookCellDeltaKind,
  WorkbookCompareMode,
  WorkbookRowDelta,
  WorkbookRowDeltaPayload,
  WorkbookRowDeltaTone,
} from '@/types';
import type { WorkbookCellDisplay, WorkbookRowDisplayLine } from '@/utils/workbook/workbookDisplay';
import {
  hasWorkbookCellContent,
  isWorkbookStrictOnlyDifference,
  workbookCellsDiffer,
} from '@/utils/workbook/workbookCellContract';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';

const EMPTY_CELL: WorkbookCellDisplay = { value: '', formula: '' };
const NULL_LINE_CACHE_KEY: object = {};
const rowDeltaCache = new WeakMap<object, WeakMap<object, Map<string, WorkbookRowDelta>>>();

export function parseWorkbookRowLine(line: DiffLine | null): WorkbookRowDisplayLine | null {
  if (!line) return null;
  const parsed = parseWorkbookDisplayLine(line.base ?? line.mine ?? '');
  return parsed?.kind === 'row' ? parsed : null;
}

function resolveWorkbookCellDeltaKind(
  leftCell: WorkbookCellDisplay,
  rightCell: WorkbookCellDisplay,
  compareMode: WorkbookCompareMode,
): WorkbookCellDeltaKind {
  if (!workbookCellsDiffer(leftCell, rightCell, compareMode)) return 'equal';

  const hasBaseContent = hasWorkbookCellContent(leftCell, compareMode);
  const hasMineContent = hasWorkbookCellContent(rightCell, compareMode);
  if (hasBaseContent !== hasMineContent) {
    return hasMineContent ? 'add' : 'delete';
  }

  return 'modify';
}

function resolveWorkbookRowDeltaTone(
  cellDeltas: Iterable<WorkbookCellDelta>,
): WorkbookRowDeltaTone {
  let sawAdd = false;
  let sawDelete = false;
  let sawModify = false;

  for (const delta of cellDeltas) {
    if (!delta.changed) continue;
    if (delta.kind === 'modify') sawModify = true;
    else if (delta.kind === 'add') sawAdd = true;
    else if (delta.kind === 'delete') sawDelete = true;
  }

  if (!sawAdd && !sawDelete && !sawModify) return 'equal';
  if (sawModify || (sawAdd && sawDelete)) return 'mixed';
  if (sawAdd) return 'add';
  return 'delete';
}

export function buildWorkbookRowDelta(
  leftLine: DiffLine | null,
  rightLine: DiffLine | null,
  columns?: number[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookRowDelta {
  const columnsKey = `${compareMode}::${columns && columns.length > 0 ? columns.join(',') : '*'}`;
  const leftKey = (leftLine ?? NULL_LINE_CACHE_KEY) as object;
  const rightKey = (rightLine ?? NULL_LINE_CACHE_KEY) as object;

  let rightCache = rowDeltaCache.get(leftKey);
  if (!rightCache) {
    rightCache = new WeakMap<object, Map<string, WorkbookRowDelta>>();
    rowDeltaCache.set(leftKey, rightCache);
  }

  let columnsCache = rightCache.get(rightKey);
  if (!columnsCache) {
    columnsCache = new Map<string, WorkbookRowDelta>();
    rightCache.set(rightKey, columnsCache);
  }

  const cached = columnsCache.get(columnsKey);
  if (cached) return cached;

  const leftRow = parseWorkbookRowLine(leftLine);
  const rightRow = parseWorkbookRowLine(rightLine);
  const cellDeltas = new Map<number, WorkbookCellDelta>();

  if (!leftRow && !rightRow) {
    const empty: WorkbookRowDelta = {
      cellDeltas,
      changedColumns: [],
      strictOnlyColumns: [],
      changedCount: 0,
      hasChanges: false,
      tone: 'equal',
    };
    columnsCache.set(columnsKey, empty);
    return empty;
  }

  const columnSet = columns && columns.length > 0
    ? columns
    : Array.from(
        { length: Math.max(leftRow?.cells.length ?? 0, rightRow?.cells.length ?? 0) },
        (_, index) => index,
      );

  if (!leftRow || !rightRow) {
    const existingSide = leftRow ? 'base' : 'mine';
    const existingRow = leftRow ?? rightRow;

    if (existingRow) {
      columnSet.forEach((column) => {
        const existingCell = existingRow.cells[column] ?? EMPTY_CELL;
        const hasContent = hasWorkbookCellContent(existingCell, compareMode);
        if (!hasContent) return;

        cellDeltas.set(column, {
          column,
          baseCell: existingSide === 'base' ? existingCell : EMPTY_CELL,
          mineCell: existingSide === 'mine' ? existingCell : EMPTY_CELL,
          changed: true,
          masked: false,
          strictOnly: false,
          kind: existingSide === 'base' ? 'delete' : 'add',
          hasBaseContent: existingSide === 'base' ? hasContent : false,
          hasMineContent: existingSide === 'mine' ? hasContent : false,
          hasContent: true,
        });
      });
    }
  } else {
    columnSet.forEach((column) => {
      const leftCell = leftRow.cells[column] ?? EMPTY_CELL;
      const rightCell = rightRow.cells[column] ?? EMPTY_CELL;
      const hasBaseContent = hasWorkbookCellContent(leftCell, compareMode);
      const hasMineContent = hasWorkbookCellContent(rightCell, compareMode);
      const hasContent = hasBaseContent || hasMineContent;
      const changed = workbookCellsDiffer(leftCell, rightCell, compareMode);

      if (!changed && !hasContent) return;

      cellDeltas.set(column, {
        column,
        baseCell: leftCell,
        mineCell: rightCell,
        changed,
        masked: !changed,
        strictOnly: changed && isWorkbookStrictOnlyDifference(leftCell, rightCell),
        kind: resolveWorkbookCellDeltaKind(leftCell, rightCell, compareMode),
        hasBaseContent,
        hasMineContent,
        hasContent,
      });
    });
  }

  const deltas = [...cellDeltas.values()];
  const rowDelta: WorkbookRowDelta = {
    cellDeltas,
    changedColumns: deltas.filter((delta) => delta.changed).map((delta) => delta.column),
    strictOnlyColumns: deltas.filter((delta) => delta.strictOnly).map((delta) => delta.column),
    changedCount: deltas.filter((delta) => delta.changed).length,
    hasChanges: deltas.some((delta) => delta.changed),
    tone: resolveWorkbookRowDeltaTone(deltas),
  };

  columnsCache.set(columnsKey, rowDelta);
  return rowDelta;
}

export function hydrateWorkbookRowDelta(payload: WorkbookRowDeltaPayload): WorkbookRowDelta {
  const cellDeltas = new Map<number, WorkbookCellDelta>(
    payload.cellDeltas.map((delta) => [delta.column, delta]),
  );
  return {
    cellDeltas,
    changedColumns: payload.changedColumns,
    strictOnlyColumns: payload.strictOnlyColumns,
    changedCount: payload.changedCount,
    hasChanges: payload.hasChanges,
    tone: payload.tone,
  };
}

export function buildWorkbookSplitRowDelta(
  row: { left: DiffLine | null; right: DiffLine | null; workbookRowDelta?: WorkbookRowDelta },
  columns?: number[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookRowDelta {
  const precomputed = row.workbookRowDelta;
  if (!precomputed || compareMode !== 'strict') {
    return buildWorkbookRowDelta(row.left, row.right, columns, compareMode);
  }
  if (!columns || columns.length === 0) return precomputed;

  const nextCellDeltas = new Map<number, WorkbookCellDelta>();
  columns.forEach((column) => {
    const delta = precomputed.cellDeltas.get(column);
    if (delta) nextCellDeltas.set(column, delta);
  });
  const deltas = [...nextCellDeltas.values()];
  return {
    cellDeltas: nextCellDeltas,
    changedColumns: deltas.filter((delta) => delta.changed).map((delta) => delta.column),
    strictOnlyColumns: deltas.filter((delta) => delta.strictOnly).map((delta) => delta.column),
    changedCount: deltas.filter((delta) => delta.changed).length,
    hasChanges: deltas.some((delta) => delta.changed),
    tone: resolveWorkbookRowDeltaTone(deltas),
  };
}
