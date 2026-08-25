import type { WorkbookCompareMode, WorkbookSearchTarget } from '@/types';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { getWorkbookSideRowNumber } from '@/utils/workbook/workbookNavigation';
import type { WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';

export interface WorkbookRenderPolicy {
  mode: 'full' | 'differences-only';
  maskIrrelevantCells: boolean;
}

export interface WorkbookVisibilityModel {
  policy: WorkbookRenderPolicy;
  modifiedSheetNames: ReadonlySet<string>;
  visibleSheetNames: ReadonlySet<string>;
  visibleLineIndexesBySheet: ReadonlyMap<string, ReadonlySet<number>>;
  searchableCellKeys: ReadonlySet<string>;
}

interface BuildWorkbookVisibilityModelOptions {
  showOnlyDifferences: boolean;
  sections: readonly WorkbookSection[];
  sectionRowIndex: WorkbookSectionRowIndex;
  modifiedSheetNames: ReadonlySet<string>;
  compareMode: WorkbookCompareMode;
}

function buildCellKey(
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
): string {
  return `${sheetName}\u0000${side}\u0000${rowNumber}\u0000${column}`;
}

export function buildWorkbookVisibilityModel({
  showOnlyDifferences,
  sections,
  sectionRowIndex,
  modifiedSheetNames,
  compareMode,
}: BuildWorkbookVisibilityModelOptions): WorkbookVisibilityModel {
  const policy: WorkbookRenderPolicy = showOnlyDifferences
    ? { mode: 'differences-only', maskIrrelevantCells: true }
    : { mode: 'full', maskIrrelevantCells: false };
  const effectiveModifiedSheetNames = new Set(modifiedSheetNames);
  sections.forEach((section) => {
    if (section.changeType !== 'equal') effectiveModifiedSheetNames.add(section.name);
  });
  const visibleSheetNames = showOnlyDifferences
    ? new Set(effectiveModifiedSheetNames)
    : new Set(sections.map((section) => section.name));
  const visibleLineIndexesBySheet = new Map<string, Set<number>>();
  const searchableCellKeys = new Set<string>();

  if (!showOnlyDifferences) {
    return {
      policy,
      modifiedSheetNames: effectiveModifiedSheetNames,
      visibleSheetNames,
      visibleLineIndexesBySheet,
      searchableCellKeys,
    };
  }

  sections.forEach((section) => {
    if (!visibleSheetNames.has(section.name)) return;
    const rows = sectionRowIndex.get(section.name)?.rows ?? [];
    rows.forEach((row) => {
      const delta = buildWorkbookSplitRowCompareState(row, undefined, compareMode);
      if (!delta.hasChanges && !delta.structuralChange) return;

      const lineIndexes = visibleLineIndexesBySheet.get(section.name) ?? new Set<number>();
      row.lineIdxs.forEach((lineIdx) => lineIndexes.add(lineIdx));
      visibleLineIndexesBySheet.set(section.name, lineIndexes);

      const changedColumns = delta.changedColumns.length > 0
        ? delta.changedColumns
        : delta.structuralChange
          ? Array.from({ length: section.maxColumns }, (_, column) => column)
          : [];
      const baseRowNumber = getWorkbookSideRowNumber(row, 'base');
      const mineRowNumber = getWorkbookSideRowNumber(row, 'mine');
      changedColumns.forEach((column) => {
        if (baseRowNumber != null) {
          searchableCellKeys.add(buildCellKey(section.name, 'base', baseRowNumber, column));
        }
        if (mineRowNumber != null) {
          searchableCellKeys.add(buildCellKey(section.name, 'mine', mineRowNumber, column));
        }
      });
    });
  });

  return {
    policy,
    modifiedSheetNames: effectiveModifiedSheetNames,
    visibleSheetNames,
    visibleLineIndexesBySheet,
    searchableCellKeys,
  };
}

export function isWorkbookSearchTargetVisible(
  model: WorkbookVisibilityModel,
  target: WorkbookSearchTarget | null | undefined,
): boolean {
  if (model.policy.mode === 'full') return true;
  return Boolean(
    target?.sheetName
    && target.side
    && target.rowNumber != null
    && target.colIndex != null
    && model.searchableCellKeys.has(buildCellKey(
      target.sheetName,
      target.side,
      target.rowNumber,
      target.colIndex,
    )),
  );
}

export function filterWorkbookSectionsByVisibility(
  model: WorkbookVisibilityModel,
  sections: readonly WorkbookSection[],
): WorkbookSection[] {
  if (model.policy.mode === 'full') return [...sections];
  return sections.filter((section) => model.visibleSheetNames.has(section.name));
}
