import { useMemo } from 'react';

import type { SplitRow, WorkbookSelectedCell } from '@/types';
import type { WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import { buildWorkbookNavigationRows } from '@/utils/workbook/workbookPanelHelpers';

interface SplitNavigationItem {
  kind: 'split-line' | 'split-collapse';
  row?: SplitRow;
}

interface UseSplitPanelWorkbookNavigationRowsParams {
  activeSheetName: string | null;
  selectedCell: WorkbookSelectedCell | null;
  frozenRow: SplitRow | null;
  items: SplitNavigationItem[];
  baseVersion: string;
  mineVersion: string;
}

export function useSplitPanelWorkbookNavigationRows({
  activeSheetName,
  selectedCell,
  frozenRow,
  items,
  baseVersion,
  mineVersion,
}: UseSplitPanelWorkbookNavigationRowsParams): WorkbookRowEntry[] {
  return useMemo(() => buildWorkbookNavigationRows(
    activeSheetName,
    selectedCell,
    frozenRow ? [frozenRow] : [],
    items.flatMap((item) => item.kind === 'split-line' && item.row ? [item.row] : []),
    baseVersion,
    mineVersion,
    [],
  ), [activeSheetName, baseVersion, frozenRow, items, mineVersion, selectedCell]);
}
