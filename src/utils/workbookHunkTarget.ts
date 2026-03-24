import type { Hunk, SplitRow, WorkbookCompareMode, WorkbookSelectedCell } from '../types';
import type { WorkbookSection } from './workbookSections';
import type { IndexedWorkbookSectionRows } from './workbookSheetIndex';
import { buildWorkbookSplitRowCompareState } from './workbookCompare';
import {
  buildWorkbookRowEntry,
  buildWorkbookSelectedCell,
} from './workbookNavigation';

function rowTouchesHunk(row: SplitRow, hunk: Hunk): boolean {
  return row.lineIdxs.some(idx => idx >= hunk.startIdx && idx <= hunk.endIdx);
}

export function findWorkbookHunkTargetCell(
  hunk: Hunk,
  workbookSections: WorkbookSection[],
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>,
  baseVersionLabel: string,
  mineVersionLabel: string,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookSelectedCell | null {
  for (const section of workbookSections) {
    if (hunk.endIdx < section.startLineIdx || hunk.startIdx > section.endLineIdx) continue;
    const rows = workbookSectionRowIndex.get(section.name)?.rows ?? [];

    for (const row of rows) {
      if (!rowTouchesHunk(row, hunk)) continue;

      const changedColumns = buildWorkbookSplitRowCompareState(
        row,
        undefined,
        compareMode,
      ).changedColumns;
      if (changedColumns.length === 0) continue;

      const targetColumn = changedColumns[0] ?? 0;
      const baseEntry = buildWorkbookRowEntry(row, 'base', section.name, baseVersionLabel);
      const mineEntry = buildWorkbookRowEntry(row, 'mine', section.name, mineVersionLabel);

      if (row.right?.type === 'add' && mineEntry) {
        return buildWorkbookSelectedCell(mineEntry, targetColumn);
      }
      if (row.left?.type === 'delete' && baseEntry) {
        return buildWorkbookSelectedCell(baseEntry, targetColumn);
      }
      if (mineEntry) {
        return buildWorkbookSelectedCell(mineEntry, targetColumn);
      }
      if (baseEntry) {
        return buildWorkbookSelectedCell(baseEntry, targetColumn);
      }
    }
  }

  return null;
}
