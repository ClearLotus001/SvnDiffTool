import { useMemo } from 'react';

import type { SplitRow, WorkbookSelectedCell } from '@/types';
import type { WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import {
  buildWorkbookNavigationRows,
  type WorkbookRowEntryMaps,
  projectWorkbookNavigationRowsFromEntryMapParts,
} from '@/utils/workbook/workbookPanelHelpers';
import type { WorkbookHorizontalRenderItem } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { collectWorkbookRenderBodyRows } from '@/utils/workbook/workbookRenderBodyRows';

interface UseWorkbookHorizontalNavigationRowsParams {
  activeSheetName: string | null;
  selectedCell: WorkbookSelectedCell | null;
  frozenRows: SplitRow[];
  items: WorkbookHorizontalRenderItem[];
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
  rowEntryByRowNumber?: WorkbookRowEntryMaps | null;
}

export function useWorkbookHorizontalNavigationRows({
  activeSheetName,
  selectedCell,
  frozenRows,
  items,
  baseVersion,
  mineVersion,
  visibleColumns,
  rowEntryByRowNumber = null,
}: UseWorkbookHorizontalNavigationRowsParams): WorkbookRowEntry[] {
  const hasSelection = selectedCell != null;
  const bodyRows = useMemo(() => {
    if (!activeSheetName || !hasSelection) return [];
    return collectWorkbookRenderBodyRows(
      items,
      'horizontal:navigation-body-rows:v1',
      (item) => (item.kind === 'split-line' ? item.row : null),
    );
  }, [activeSheetName, hasSelection, items]);

  return useMemo(() => {
    if (activeSheetName && hasSelection && rowEntryByRowNumber) {
      return projectWorkbookNavigationRowsFromEntryMapParts(
        [frozenRows, bodyRows],
        rowEntryByRowNumber,
      );
    }
    return buildWorkbookNavigationRows(
      activeSheetName,
      hasSelection,
      frozenRows,
      bodyRows,
      baseVersion,
      mineVersion,
      visibleColumns,
    );
  }, [activeSheetName, baseVersion, bodyRows, frozenRows, hasSelection, mineVersion, rowEntryByRowNumber, visibleColumns]);
}
