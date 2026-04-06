import { useMemo } from 'react';

import type { SplitRow, WorkbookSelectedCell } from '@/types';
import type { WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import {
  buildWorkbookNavigationRows,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookHorizontalRenderItem } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';

interface UseWorkbookHorizontalNavigationRowsParams {
  activeSheetName: string | null;
  selectedCell: WorkbookSelectedCell | null;
  frozenRows: SplitRow[];
  items: WorkbookHorizontalRenderItem[];
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
}

export function useWorkbookHorizontalNavigationRows({
  activeSheetName,
  selectedCell,
  frozenRows,
  items,
  baseVersion,
  mineVersion,
  visibleColumns,
}: UseWorkbookHorizontalNavigationRowsParams): WorkbookRowEntry[] {
  return useMemo(() => buildWorkbookNavigationRows(
    activeSheetName,
    selectedCell,
    frozenRows,
    items.flatMap((item) => item.kind === 'split-line' ? [item.row] : []),
    baseVersion,
    mineVersion,
    visibleColumns,
  ), [activeSheetName, baseVersion, frozenRows, items, mineVersion, selectedCell, visibleColumns]);
}
