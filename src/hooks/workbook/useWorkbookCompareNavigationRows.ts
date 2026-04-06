import { useMemo } from 'react';

import type { SplitRow, WorkbookSelectedCell } from '@/types';
import type { WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import {
  buildWorkbookNavigationRows,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookCompareRenderItem } from '@/hooks/workbook/useWorkbookCompareDerivedState';

interface UseWorkbookCompareNavigationRowsParams {
  activeSheetName: string | null;
  selectedCell: WorkbookSelectedCell | null;
  frozenRows: SplitRow[];
  items: WorkbookCompareRenderItem[];
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
}

export function useWorkbookCompareNavigationRows({
  activeSheetName,
  selectedCell,
  frozenRows,
  items,
  baseVersion,
  mineVersion,
  visibleColumns,
}: UseWorkbookCompareNavigationRowsParams): WorkbookRowEntry[] {
  return useMemo(() => buildWorkbookNavigationRows(
    activeSheetName,
    selectedCell,
    frozenRows,
    items.flatMap((item) => item.kind === 'row' ? [item.row] : []),
    baseVersion,
    mineVersion,
    visibleColumns,
  ), [activeSheetName, baseVersion, frozenRows, items, mineVersion, selectedCell, visibleColumns]);
}
