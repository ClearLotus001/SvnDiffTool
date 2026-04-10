import { useMemo } from 'react';

import type { SplitRow, WorkbookSelectedCell } from '@/types';
import type { WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import {
  buildWorkbookNavigationRows,
  type WorkbookRowEntryMaps,
  projectWorkbookNavigationRowsFromEntryMapParts,
} from '@/utils/workbook/workbookPanelHelpers';
import { collectWorkbookRenderBodyRows } from '@/utils/workbook/workbookRenderBodyRows';

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
  rowEntryByRowNumber?: WorkbookRowEntryMaps | null;
}

export function useSplitPanelWorkbookNavigationRows({
  activeSheetName,
  selectedCell,
  frozenRow,
  items,
  baseVersion,
  mineVersion,
  rowEntryByRowNumber = null,
}: UseSplitPanelWorkbookNavigationRowsParams): WorkbookRowEntry[] {
  const hasSelection = selectedCell != null;
  const bodyRows = useMemo(() => {
    if (!activeSheetName || !hasSelection) return [];
    return collectWorkbookRenderBodyRows(
      items,
      'split-panel:navigation-body-rows:v1',
      (item) => (item.kind === 'split-line' && item.row ? item.row : null),
    );
  }, [activeSheetName, hasSelection, items]);

  return useMemo(() => {
    if (activeSheetName && hasSelection && rowEntryByRowNumber) {
      return projectWorkbookNavigationRowsFromEntryMapParts(
        [frozenRow ? [frozenRow] : [], bodyRows],
        rowEntryByRowNumber,
      );
    }

    return buildWorkbookNavigationRows(
      activeSheetName,
      hasSelection,
      frozenRow ? [frozenRow] : [],
      bodyRows,
      baseVersion,
      mineVersion,
      [],
    );
  }, [activeSheetName, baseVersion, bodyRows, frozenRow, hasSelection, mineVersion, rowEntryByRowNumber]);
}
