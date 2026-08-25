import type { SplitRow, WorkbookCompareMode } from '@/types';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { getWorkbookSideRowNumber, getWorkbookSplitRowNumber } from '@/utils/workbook/workbookNavigation';
import type { WorkbookRenderPolicy } from '@/utils/workbook/workbookVisibilityModel';

export interface WorkbookMaskedRegionModel {
  regionByCellKey: ReadonlyMap<string, string>;
  regionCount: number;
}

interface BuildWorkbookMaskedRegionModelOptions {
  rows: readonly SplitRow[];
  visibleColumns: readonly number[];
  compareMode: WorkbookCompareMode;
  renderPolicy: WorkbookRenderPolicy;
  sheetName: string;
  headerRowNumber: number;
}

const EMPTY_WORKBOOK_MASKED_REGION_MODEL: WorkbookMaskedRegionModel = {
  regionByCellKey: new Map(),
  regionCount: 0,
};

function buildCellKey(side: 'base' | 'mine', rowNumber: number, column: number): string {
  return `${side}\u0000${rowNumber}\u0000${column}`;
}

const cache = new WeakMap<readonly SplitRow[], Map<string, WorkbookMaskedRegionModel>>();

export function buildWorkbookMaskedRegionModel({
  rows,
  visibleColumns,
  compareMode,
  renderPolicy,
  sheetName,
  headerRowNumber,
}: BuildWorkbookMaskedRegionModelOptions): WorkbookMaskedRegionModel {
  if (!renderPolicy.maskIrrelevantCells || rows.length === 0 || visibleColumns.length === 0) {
    return EMPTY_WORKBOOK_MASKED_REGION_MODEL;
  }

  const cacheKey = [
    sheetName,
    headerRowNumber,
    compareMode,
    visibleColumns.join(','),
  ].join('::');
  let rowCache = cache.get(rows);
  if (!rowCache) {
    rowCache = new Map();
    cache.set(rows, rowCache);
  }
  const cached = rowCache.get(cacheKey);
  if (cached) return cached;

  const visibleRows = rows.flatMap((row) => {
    const rowNumber = getWorkbookSplitRowNumber(row);
    if (rowNumber == null || rowNumber === headerRowNumber) return [];
    const delta = buildWorkbookSplitRowCompareState(row, visibleColumns as number[], compareMode);
    if (!delta.hasChanges && !delta.structuralChange) return [];
    const changedColumns = new Set(delta.changedColumns);
    const structuralAllChanged = Boolean(delta.structuralChange && changedColumns.size === 0);
    return [{
      row,
      baseRowNumber: getWorkbookSideRowNumber(row, 'base'),
      mineRowNumber: getWorkbookSideRowNumber(row, 'mine'),
      irrelevantColumns: visibleColumns.map((column) => (
        !structuralAllChanged && !changedColumns.has(column)
      )),
    }];
  });

  const visited = visibleRows.map(() => visibleColumns.map(() => false));
  const regionByCellKey = new Map<string, string>();
  let regionCount = 0;

  visibleRows.forEach((rowInfo, rowIndex) => {
    visibleColumns.forEach((_, columnIndex) => {
      if (visited[rowIndex]?.[columnIndex] || !rowInfo.irrelevantColumns[columnIndex]) return;
      const regionId = `${sheetName}:masked:${regionCount}`;
      regionCount += 1;
      const queue: Array<[number, number]> = [[rowIndex, columnIndex]];
      visited[rowIndex]![columnIndex] = true;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentRowIndex, currentColumnIndex] = queue[cursor]!;
        const currentRow = visibleRows[currentRowIndex]!;
        const column = visibleColumns[currentColumnIndex]!;
        if (currentRow.baseRowNumber != null) {
          regionByCellKey.set(buildCellKey('base', currentRow.baseRowNumber, column), regionId);
        }
        if (currentRow.mineRowNumber != null) {
          regionByCellKey.set(buildCellKey('mine', currentRow.mineRowNumber, column), regionId);
        }

        const neighbors: Array<[number, number]> = [
          [currentRowIndex - 1, currentColumnIndex],
          [currentRowIndex + 1, currentColumnIndex],
          [currentRowIndex, currentColumnIndex - 1],
          [currentRowIndex, currentColumnIndex + 1],
        ];
        neighbors.forEach(([nextRowIndex, nextColumnIndex]) => {
          if (
            nextRowIndex < 0
            || nextRowIndex >= visibleRows.length
            || nextColumnIndex < 0
            || nextColumnIndex >= visibleColumns.length
            || visited[nextRowIndex]?.[nextColumnIndex]
            || !visibleRows[nextRowIndex]?.irrelevantColumns[nextColumnIndex]
          ) return;
          visited[nextRowIndex]![nextColumnIndex] = true;
          queue.push([nextRowIndex, nextColumnIndex]);
        });
      }
    });
  });

  const model = { regionByCellKey, regionCount };
  rowCache.set(cacheKey, model);
  return model;
}

export function getWorkbookMaskedRegionId(
  model: WorkbookMaskedRegionModel,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
): string | null {
  return model.regionByCellKey.get(buildCellKey(side, rowNumber, column)) ?? null;
}
