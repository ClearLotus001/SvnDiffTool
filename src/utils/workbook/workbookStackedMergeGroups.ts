import type { SplitRow, WorkbookMergeRange } from '@/types';
import {
  buildWorkbookRowEntry,
  type WorkbookRowEntry,
} from '@/utils/workbook/workbookNavigation';
import type { WorkbookCompactRenderMode } from '@/utils/workbook/workbookRowBehavior';

export interface WorkbookStackedLayoutRowInput {
  row: SplitRow;
  renderMode: WorkbookCompactRenderMode;
  height: number;
}

export interface WorkbookStackedLayoutRow {
  key: string;
  row: SplitRow;
  renderMode: WorkbookCompactRenderMode;
  height: number;
  baseEntry: WorkbookRowEntry | null;
  mineEntry: WorkbookRowEntry | null;
  baseRowNumber: number | null;
  mineRowNumber: number | null;
}

export interface WorkbookStackedMergeCoverageWindow {
  key: string;
  side: 'base' | 'mine';
  range: WorkbookMergeRange;
  startIndex: number;
  endIndex: number;
}

export interface WorkbookStackedMergedCoverageWindow {
  key: string;
  startIndex: number;
  endIndex: number;
  windows: WorkbookStackedMergeCoverageWindow[];
}

export interface WorkbookStackedTrackItem {
  sourceRowIndex: number;
  renderMode: WorkbookCompactRenderMode;
  entry: WorkbookRowEntry;
}

export interface WorkbookStackedVisualGroup {
  key: string;
  startIndex: number;
  endIndex: number;
  reason: 'plain' | 'merge';
  rows: WorkbookStackedLayoutRow[];
  baseTrack: WorkbookStackedTrackItem[];
  mineTrack: WorkbookStackedTrackItem[];
  mergeWindows: WorkbookStackedMergeCoverageWindow[];
}

function buildMergeWindowKey(
  side: 'base' | 'mine',
  range: WorkbookMergeRange,
): string {
  return `${side}:${range.startRow}:${range.endRow}:${range.startCol}:${range.endCol}`;
}

function isVerticalMerge(range: WorkbookMergeRange): boolean {
  return range.endRow > range.startRow;
}

function collectCoverageIndexes(
  rows: WorkbookStackedLayoutRow[],
  side: 'base' | 'mine',
  range: WorkbookMergeRange,
): number[] {
  return rows.flatMap((row, index) => {
    const rowNumber = side === 'base' ? row.baseRowNumber : row.mineRowNumber;
    return rowNumber != null && rowNumber >= range.startRow && rowNumber <= range.endRow
      ? [index]
      : [];
  });
}

function buildTrack(
  rows: WorkbookStackedLayoutRow[],
  side: 'base' | 'mine',
): WorkbookStackedTrackItem[] {
  return rows.flatMap((row, sourceRowIndex) => {
    const entry = side === 'base' ? row.baseEntry : row.mineEntry;
    return entry
      ? [{
        sourceRowIndex,
        renderMode: row.renderMode,
        entry,
      }]
      : [];
  });
}

export function buildWorkbookStackedLayoutRows(params: {
  rows: WorkbookStackedLayoutRowInput[];
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  visibleColumns: number[];
}): WorkbookStackedLayoutRow[] {
  const {
    rows,
    sheetName,
    baseVersion,
    mineVersion,
    visibleColumns,
  } = params;

  return rows.map((item, index) => {
    const baseEntry = buildWorkbookRowEntry(item.row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(item.row, 'mine', sheetName, mineVersion, visibleColumns);

    return {
      key: `stacked-layout-row:${index}:${item.row.lineIdx}`,
      row: item.row,
      renderMode: item.renderMode,
      height: item.height,
      baseEntry,
      mineEntry,
      baseRowNumber: baseEntry?.rowNumber ?? null,
      mineRowNumber: mineEntry?.rowNumber ?? null,
    };
  });
}

export function buildWorkbookStackedMergeCoverageWindows(params: {
  rows: WorkbookStackedLayoutRow[];
  baseMergeRanges: WorkbookMergeRange[];
  mineMergeRanges: WorkbookMergeRange[];
}): WorkbookStackedMergeCoverageWindow[] {
  const {
    rows,
    baseMergeRanges,
    mineMergeRanges,
  } = params;

  const windows: WorkbookStackedMergeCoverageWindow[] = [];
  const appendWindows = (side: 'base' | 'mine', ranges: WorkbookMergeRange[]) => {
    ranges
      .filter(isVerticalMerge)
      .forEach((range) => {
        const indexes = collectCoverageIndexes(rows, side, range);
        if (indexes.length === 0) return;

        windows.push({
          key: buildMergeWindowKey(side, range),
          side,
          range,
          startIndex: Math.min(...indexes),
          endIndex: Math.max(...indexes),
        });
      });
  };

  appendWindows('base', baseMergeRanges);
  appendWindows('mine', mineMergeRanges);

  return windows.sort((left, right) => (
    left.startIndex - right.startIndex
    || left.endIndex - right.endIndex
    || left.key.localeCompare(right.key)
  ));
}

export function mergeWorkbookStackedCoverageWindows(
  windows: WorkbookStackedMergeCoverageWindow[],
): WorkbookStackedMergedCoverageWindow[] {
  if (windows.length === 0) return [];

  const merged: WorkbookStackedMergedCoverageWindow[] = [];
  windows.forEach((window) => {
    const previous = merged[merged.length - 1];
    if (!previous || window.startIndex > (previous.endIndex + 1)) {
      merged.push({
        key: `coverage:${window.startIndex}:${window.endIndex}:${window.key}`,
        startIndex: window.startIndex,
        endIndex: window.endIndex,
        windows: [window],
      });
      return;
    }

    previous.endIndex = Math.max(previous.endIndex, window.endIndex);
    previous.windows.push(window);
  });

  return merged;
}

export function buildWorkbookStackedVisualGroups(params: {
  rows: WorkbookStackedLayoutRow[];
  baseMergeRanges: WorkbookMergeRange[];
  mineMergeRanges: WorkbookMergeRange[];
}): WorkbookStackedVisualGroup[] {
  const {
    rows,
    baseMergeRanges,
    mineMergeRanges,
  } = params;

  if (rows.length === 0) return [];

  const coverageWindows = buildWorkbookStackedMergeCoverageWindows({
    rows,
    baseMergeRanges,
    mineMergeRanges,
  });
  const mergedWindows = mergeWorkbookStackedCoverageWindows(coverageWindows);
  const groups: WorkbookStackedVisualGroup[] = [];

  const pushGroup = (
    startIndex: number,
    endIndex: number,
    reason: 'plain' | 'merge',
    mergeWindows: WorkbookStackedMergeCoverageWindow[],
  ) => {
    const groupRows = rows.slice(startIndex, endIndex + 1);
    groups.push({
      key: `stacked-group:${reason}:${startIndex}:${endIndex}`,
      startIndex,
      endIndex,
      reason,
      rows: groupRows,
      baseTrack: buildTrack(groupRows, 'base'),
      mineTrack: buildTrack(groupRows, 'mine'),
      mergeWindows,
    });
  };

  let cursor = 0;
  mergedWindows.forEach((window) => {
    if (cursor < window.startIndex) {
      pushGroup(cursor, window.startIndex - 1, 'plain', []);
    }
    pushGroup(window.startIndex, window.endIndex, 'merge', window.windows);
    cursor = window.endIndex + 1;
  });

  if (cursor < rows.length) {
    pushGroup(cursor, rows.length - 1, 'plain', []);
  }

  return groups;
}
