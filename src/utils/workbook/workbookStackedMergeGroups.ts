import type { SplitRow, WorkbookMergeRange } from '@/types';
import {
  getWorkbookSideRowNumber,
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
  rowNumber: number;
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

const MAX_PLAIN_ROWS_PER_GROUP = 256;

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
    const rowNumber = side === 'base' ? row.baseRowNumber : row.mineRowNumber;
    return rowNumber != null
      ? [{
        sourceRowIndex,
        renderMode: row.renderMode,
        rowNumber,
      }]
      : [];
  });
}

export function buildWorkbookStackedLayoutRows(params: {
  rows: WorkbookStackedLayoutRowInput[];
}): WorkbookStackedLayoutRow[] {
  const { rows } = params;

  return rows.map((item, index) => {
    return {
      key: `stacked-layout-row:${index}:${item.row.lineIdx}`,
      row: item.row,
      renderMode: item.renderMode,
      height: item.height,
      baseRowNumber: getWorkbookSideRowNumber(item.row, 'base'),
      mineRowNumber: getWorkbookSideRowNumber(item.row, 'mine'),
    };
  });
}

export function buildWorkbookStackedMergeCoverageWindows(params: {
  rows: WorkbookStackedLayoutRow[];
  baseMergeRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergeRanges: ReadonlyArray<WorkbookMergeRange>;
}): WorkbookStackedMergeCoverageWindow[] {
  const {
    rows,
    baseMergeRanges,
    mineMergeRanges,
  } = params;

  const windows: WorkbookStackedMergeCoverageWindow[] = [];
  const appendWindows = (side: 'base' | 'mine', ranges: ReadonlyArray<WorkbookMergeRange>) => {
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
  baseMergeRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergeRanges: ReadonlyArray<WorkbookMergeRange>;
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

  const pushPlainGroups = (startIndex: number, endIndex: number) => {
    if (startIndex > endIndex) return;
    for (let chunkStart = startIndex; chunkStart <= endIndex; chunkStart += MAX_PLAIN_ROWS_PER_GROUP) {
      const chunkEnd = Math.min(endIndex, chunkStart + MAX_PLAIN_ROWS_PER_GROUP - 1);
      pushGroup(chunkStart, chunkEnd, 'plain', []);
    }
  };

  let cursor = 0;
  mergedWindows.forEach((window) => {
    if (cursor < window.startIndex) {
      pushPlainGroups(cursor, window.startIndex - 1);
    }
    pushGroup(window.startIndex, window.endIndex, 'merge', window.windows);
    cursor = window.endIndex + 1;
  });

  if (cursor < rows.length) {
    pushPlainGroups(cursor, rows.length - 1);
  }

  return groups;
}
