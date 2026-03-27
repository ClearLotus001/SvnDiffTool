import type { WorkbookCompareMode } from '@/types';
import type { WorkbookRowDeltaTone } from '@/types';
import { getWorkbookCellChangeKind } from '@/utils/workbook/workbookCellContract';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';

export type WorkbookCompareTone = WorkbookRowDeltaTone;

export function getWorkbookCompareCellTone(
  cell: WorkbookCompareCellState,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCompareTone {
  if (!cell.changed) return 'equal';
  const kind = cell.kind ?? (
    getWorkbookCellChangeKind(cell.baseCell, cell.mineCell, compareMode) === 'mixed'
      ? 'modify'
      : getWorkbookCellChangeKind(cell.baseCell, cell.mineCell, compareMode)
  );
  if (kind === 'modify') return 'mixed';
  return kind;
}

export function getWorkbookCompareCellsTone(
  cells: Iterable<WorkbookCompareCellState>,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCompareTone {
  let sawAdd = false;
  let sawDelete = false;
  let sawMixed = false;

  for (const cell of cells) {
    const tone = getWorkbookCompareCellTone(cell, compareMode);
    if (tone === 'equal') continue;
    if (tone === 'mixed') sawMixed = true;
    else if (tone === 'add') sawAdd = true;
    else if (tone === 'delete') sawDelete = true;
  }

  if (!sawAdd && !sawDelete && !sawMixed) return 'equal';
  if (sawMixed || (sawAdd && sawDelete)) return 'mixed';
  if (sawAdd) return 'add';
  return 'delete';
}
