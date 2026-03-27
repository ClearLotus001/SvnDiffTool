import type { SplitRow, WorkbookFreezeState } from '@/types';
import type { CollapseExpansionState, CollapseRevealRange } from '@/utils/collapse/collapseState';
import type { CollapsedRowBlockDescriptor } from '@/utils/collapse/collapsibleRows';
import { getWorkbookSplitRowNumber } from '@/utils/workbook/workbookNavigation';

export interface WorkbookFreezeDefaults {
  rowNumber: number;
  colCount: number;
}

export interface WorkbookFreezePatch {
  rowNumber?: number | null;
  colCount?: number | null;
}

function normalizeFreezeValue(
  value: number | null | undefined,
  defaultValue: number,
): number | undefined {
  if (value == null || value <= defaultValue) return undefined;
  return value;
}

export function getResolvedWorkbookFreezeRowNumber(
  freezeState: WorkbookFreezeState | null | undefined,
  defaults: WorkbookFreezeDefaults,
): number {
  return Math.max(defaults.rowNumber, freezeState?.rowNumber ?? 0);
}

export function getResolvedWorkbookFreezeColCount(
  freezeState: WorkbookFreezeState | null | undefined,
  defaults: WorkbookFreezeDefaults,
): number {
  return Math.max(defaults.colCount, freezeState?.colCount ?? 0);
}

export function normalizeWorkbookFreezeState(
  freezeState: WorkbookFreezeState | null | undefined,
  defaults: WorkbookFreezeDefaults,
): WorkbookFreezeState | null {
  if (!freezeState) return null;

  const rowNumber = normalizeFreezeValue(freezeState.rowNumber, defaults.rowNumber);
  const colCount = normalizeFreezeValue(freezeState.colCount, defaults.colCount);

  if (rowNumber == null && colCount == null) return null;
  return {
    ...(rowNumber != null ? { rowNumber } : {}),
    ...(colCount != null ? { colCount } : {}),
  };
}

export function applyWorkbookFreezePatch(
  freezeState: WorkbookFreezeState | null | undefined,
  patch: WorkbookFreezePatch | null,
  defaults: WorkbookFreezeDefaults,
): WorkbookFreezeState | null {
  if (patch == null) return null;

  const nextFreezeState: WorkbookFreezeState = { ...(freezeState ?? {}) };

  if ('rowNumber' in patch) {
    if (patch.rowNumber == null) {
      delete nextFreezeState.rowNumber;
    } else {
      nextFreezeState.rowNumber = patch.rowNumber;
    }
  }

  if ('colCount' in patch) {
    if (patch.colCount == null) {
      delete nextFreezeState.colCount;
    } else {
      nextFreezeState.colCount = patch.colCount;
    }
  }

  return normalizeWorkbookFreezeState(nextFreezeState, defaults);
}

export function areWorkbookFreezeStatesEqual(
  left: WorkbookFreezeState | null | undefined,
  right: WorkbookFreezeState | null | undefined,
): boolean {
  return (left?.rowNumber ?? undefined) === (right?.rowNumber ?? undefined)
    && (left?.colCount ?? undefined) === (right?.colCount ?? undefined);
}

export function buildWorkbookCollapseRowKey(row: SplitRow): string {
  return row.lineIdxs.length > 0 ? row.lineIdxs.join(':') : String(row.lineIdx);
}

function buildContiguousRevealRanges(indexes: number[]): CollapseRevealRange[] {
  if (indexes.length === 0) return [];

  const ranges: CollapseRevealRange[] = [];
  let start = indexes[0]!;
  let previous = start;

  for (let index = 1; index < indexes.length; index += 1) {
    const current = indexes[index]!;
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push({ start, end: previous });
    start = current;
    previous = current;
  }

  ranges.push({ start, end: previous });
  return ranges;
}

export function applyWorkbookFreezeToExpandedBlocks<RowT extends { lineIdx: number }>(
  expandedBlocks: CollapseExpansionState,
  descriptors: ReadonlyArray<CollapsedRowBlockDescriptor<RowT>>,
  freezeRowNumber: number,
  getRowNumber: (row: RowT) => number | null,
): CollapseExpansionState {
  let nextState: CollapseExpansionState | null = null;

  descriptors.forEach((descriptor) => {
    const forcedIndexes: number[] = [];
    descriptor.hiddenRows.forEach((row, index) => {
      const rowNumber = getRowNumber(row);
      if (rowNumber != null && rowNumber <= freezeRowNumber) {
        forcedIndexes.push(index);
      }
    });
    if (forcedIndexes.length === 0) return;

    const state = nextState ?? expandedBlocks;
    nextState = {
      ...state,
      [descriptor.blockId]: [
        ...(state[descriptor.blockId] ?? []),
        ...buildContiguousRevealRanges(forcedIndexes),
      ],
    };
  });

  return nextState ?? expandedBlocks;
}

export function filterWorkbookRowsForFreeze(
  rows: SplitRow[],
  hiddenLineIdxSet: ReadonlySet<number>,
  freezeRowNumber: number,
): SplitRow[] {
  return rows.filter((row) => {
    if (row.lineIdxs.some((lineIdx) => hiddenLineIdxSet.has(lineIdx))) return false;
    const rowNumber = getWorkbookSplitRowNumber(row);
    return rowNumber == null || rowNumber > freezeRowNumber;
  });
}
