import type { WorkbookCompareMode } from '@/types';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { resolveWorkbookCompareCellKind } from '@/utils/workbook/workbookCompareVisuals';
import { getWorkbookRowDeltaEntries } from '@/utils/workbook/workbookDelta';
import type { WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';

export interface WorkbookCellChangeSummary {
  added: number;
  removed: number;
  modified: number;
  strictOnly: number;
}

const EMPTY_WORKBOOK_CELL_CHANGE_SUMMARY: WorkbookCellChangeSummary = {
  added: 0,
  removed: 0,
  modified: 0,
  strictOnly: 0,
};

export function summarizeWorkbookCellChanges(
  sheetName: string | null,
  sectionRowIndex: WorkbookSectionRowIndex,
  compareMode: WorkbookCompareMode,
): WorkbookCellChangeSummary {
  if (!sheetName) return EMPTY_WORKBOOK_CELL_CHANGE_SUMMARY;

  const rows = sectionRowIndex.get(sheetName)?.rows;
  if (!rows?.length) return EMPTY_WORKBOOK_CELL_CHANGE_SUMMARY;

  const summary: WorkbookCellChangeSummary = {
    added: 0,
    removed: 0,
    modified: 0,
    strictOnly: 0,
  };

  rows.forEach((row) => {
    const rowDelta = buildWorkbookSplitRowCompareState(row, undefined, compareMode);
    getWorkbookRowDeltaEntries(rowDelta).forEach((cellDelta) => {
      if (!cellDelta.changed) return;
      const kind = resolveWorkbookCompareCellKind(cellDelta, compareMode);
      if (kind === 'add') summary.added += 1;
      else if (kind === 'delete') summary.removed += 1;
      else if (kind === 'strict-only') summary.strictOnly += 1;
      else if (kind === 'modify') summary.modified += 1;
    });
  });

  return summary;
}
