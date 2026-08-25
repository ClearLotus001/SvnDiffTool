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
import {
  buildWorkbookMaskedRegionModel,
  type WorkbookMaskedRegionModel,
} from '@/utils/workbook/workbookMaskedRegionModel';
import type { WorkbookRenderPolicy } from '@/utils/workbook/workbookVisibilityModel';

export interface WorkbookRenderModel {
  rowEntryByRowNumber: WorkbookRowEntryMaps;
  compareStateByRow: WorkbookCompareStateByRow;
  compareCellsByRowNumber: WorkbookCompareCellsMaps;
  maskedRegions: WorkbookMaskedRegionModel;
  renderItemIndexes: WorkbookRenderItemIndexes;
}

export interface BuildWorkbookRenderModelParams<TItem> {
  sectionRows: SplitRow[];
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
  compareMode: WorkbookCompareMode;
  renderPolicy: WorkbookRenderPolicy;
  headerRowNumber: number;
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
  renderPolicy,
  headerRowNumber,
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
    maskedRegions: buildWorkbookMaskedRegionModel({
      rows: sectionRows,
      visibleColumns,
      compareMode,
      renderPolicy,
      sheetName,
      headerRowNumber,
    }),
    renderItemIndexes: buildWorkbookRenderItemIndexes(items, {
      cacheKey: renderItemIndexesCacheKey,
      getRow,
      getHiddenRows,
      getHiddenRowNumbers,
    }),
  };
}
