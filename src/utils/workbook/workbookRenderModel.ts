import type {
  SplitRow,
  WorkbookCompareMode,
} from '@/types';
import {
  buildWorkbookCompareCellsMaps,
  buildWorkbookCompareStateByRow,
  buildWorkbookRowEntryMaps,
  type WorkbookCompareCellsMaps,
  type WorkbookCompareStateByRow,
  type WorkbookRowEntryMaps,
} from '@/utils/workbook/workbookPanelHelpers';
import {
  buildWorkbookRenderItemIndexes,
  type WorkbookRenderItemIndexes,
} from '@/utils/workbook/workbookRenderItemIndexes';

export interface WorkbookRenderModel {
  rowEntryByRowNumber: WorkbookRowEntryMaps;
  compareStateByRow: WorkbookCompareStateByRow;
  compareCellsByRowNumber: WorkbookCompareCellsMaps;
  renderItemIndexes: WorkbookRenderItemIndexes;
}

export interface BuildWorkbookRenderModelParams<TItem> {
  sectionRows: SplitRow[];
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
  compareMode: WorkbookCompareMode;
  items: readonly TItem[];
  renderItemIndexesCacheKey: string;
  getRow: (item: TItem) => SplitRow | null;
  getHiddenRows?: ((item: TItem) => SplitRow[] | null) | undefined;
  getHiddenRowNumbers?: ((item: TItem) => number[] | null) | undefined;
}

export function buildWorkbookRenderModel<TItem>({
  sectionRows,
  sheetName,
  baseVersion,
  mineVersion,
  visibleColumns,
  compareMode,
  items,
  renderItemIndexesCacheKey,
  getRow,
  getHiddenRows,
  getHiddenRowNumbers,
}: BuildWorkbookRenderModelParams<TItem>): WorkbookRenderModel {
  const compareStateByRow = buildWorkbookCompareStateByRow(
    sectionRows,
    visibleColumns,
    compareMode,
  );

  return {
    rowEntryByRowNumber: buildWorkbookRowEntryMaps(
      sectionRows,
      sheetName,
      baseVersion,
      mineVersion,
      visibleColumns,
    ),
    compareStateByRow,
    compareCellsByRowNumber: buildWorkbookCompareCellsMaps(
      sectionRows,
      visibleColumns,
      compareMode,
    ),
    renderItemIndexes: buildWorkbookRenderItemIndexes(items, {
      cacheKey: renderItemIndexesCacheKey,
      getRow,
      getHiddenRows,
      getHiddenRowNumbers,
    }),
  };
}
