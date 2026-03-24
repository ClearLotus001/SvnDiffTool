import type { WorkbookCompareMode } from '../types';
import type { WorkbookCellDisplay } from './workbookDisplay';

export function hasWorkbookCellRawContent(cell: WorkbookCellDisplay): boolean {
  return cell.value !== '' || cell.formula !== '';
}

export function normalizeWorkbookCellValueForMode(
  value: string,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  if (compareMode === 'content' && value.trim() === '') {
    return '';
  }
  return value;
}

export function hasWorkbookCellContent(
  cell: WorkbookCellDisplay,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return normalizeWorkbookCellValueForMode(cell.value, compareMode) !== '' || cell.formula !== '';
}

export function serializeWorkbookCellForMode(
  cell: WorkbookCellDisplay,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  return `${normalizeWorkbookCellValueForMode(cell.value, compareMode)}\u001F${cell.formula}`;
}

export function workbookCellsDiffer(
  leftCell: WorkbookCellDisplay,
  rightCell: WorkbookCellDisplay,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return (
    normalizeWorkbookCellValueForMode(leftCell.value, compareMode)
    !== normalizeWorkbookCellValueForMode(rightCell.value, compareMode)
  ) || leftCell.formula !== rightCell.formula;
}

export function getWorkbookCellChangeKind(
  leftCell: WorkbookCellDisplay,
  rightCell: WorkbookCellDisplay,
  compareMode: WorkbookCompareMode = 'strict',
): 'equal' | 'add' | 'delete' | 'mixed' {
  if (!workbookCellsDiffer(leftCell, rightCell, compareMode)) return 'equal';

  const leftHasContent = hasWorkbookCellContent(leftCell, compareMode);
  const rightHasContent = hasWorkbookCellContent(rightCell, compareMode);
  if (leftHasContent !== rightHasContent) {
    return rightHasContent ? 'add' : 'delete';
  }

  return 'mixed';
}

export function isWorkbookStrictOnlyDifference(
  leftCell: WorkbookCellDisplay,
  rightCell: WorkbookCellDisplay,
): boolean {
  return workbookCellsDiffer(leftCell, rightCell, 'strict')
    && !workbookCellsDiffer(leftCell, rightCell, 'content');
}
