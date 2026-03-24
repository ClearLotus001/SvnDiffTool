import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import type { WorkbookSelectedCell } from '../types';
import type { WorkbookCompareCellState } from './workbookCompare';
import type { WorkbookMergeRange } from './workbookMeta';

export type WorkbookColumnSpanMode =
  | 'single'
  | 'paired-base'
  | 'paired-mine'
  | 'compact-base'
  | 'compact-mine';

export interface WorkbookSelectionColumnSpan {
  startCol: number;
  endCol: number;
}

export interface WorkbookColumnSpanBounds extends WorkbookSelectionColumnSpan {
  leftOffset: number;
  rightOffset: number;
  width: number;
  startEntry: HorizontalVirtualColumnEntry;
  endEntry: HorizontalVirtualColumnEntry;
  spansFreezeBoundary: boolean;
  segmentOffsets: Array<{ leftOffset: number; rightOffset: number }>;
}

export interface WorkbookMergedRegion {
  range: WorkbookMergeRange;
  left: number;
  top: number;
  width: number;
  height: number;
  visibleStartRow: number;
  segments: WorkbookCanvasSpanSegment[];
}

export interface WorkbookMergeDrawInfo {
  covered: boolean;
  region: WorkbookMergedRegion | null;
}

export interface WorkbookCanvasSpanSegment {
  left: number;
  width: number;
}

export interface WorkbookCanvasSpanGeometry {
  left: number;
  right: number;
  width: number;
  segments: WorkbookCanvasSpanSegment[];
}

function getCompactHalfWidth(entry: HorizontalVirtualColumnEntry): number {
  return Math.max(28, Math.floor(entry.width / 2));
}

export function findWorkbookMergeRange(
  mergedRanges: WorkbookMergeRange[],
  rowNumber: number,
  column: number,
): WorkbookMergeRange | null {
  for (const range of mergedRanges) {
    if (
      rowNumber >= range.startRow
      && rowNumber <= range.endRow
      && column >= range.startCol
      && column <= range.endCol
    ) {
      return range;
    }
  }
  return null;
}

export function getWorkbookSelectionColumnSpan(
  rowNumber: number,
  column: number,
  mergedRanges: WorkbookMergeRange[],
): WorkbookSelectionColumnSpan {
  const range = findWorkbookMergeRange(mergedRanges, rowNumber, column);
  return range
    ? { startCol: range.startCol, endCol: range.endCol }
    : { startCol: column, endCol: column };
}

export function getWorkbookSelectionSpanForSelection(
  selection: WorkbookSelectedCell,
  mergedRanges: WorkbookMergeRange[],
): WorkbookSelectionColumnSpan {
  if (selection.kind !== 'cell') {
    return { startCol: selection.colIndex, endCol: selection.colIndex };
  }
  return getWorkbookSelectionColumnSpan(selection.rowNumber, selection.colIndex, mergedRanges);
}

export function getWorkbookColumnSpanBounds(
  startCol: number,
  endCol: number,
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>,
  mode: WorkbookColumnSpanMode,
  freezeColumnCount: number,
): WorkbookColumnSpanBounds | null {
  const startEntry = columnLayoutByColumn.get(startCol);
  const endEntry = columnLayoutByColumn.get(endCol);
  if (!startEntry || !endEntry) return null;

  const segmentOffsets = Array.from({ length: (endCol - startCol) + 1 }, (_, index) => startCol + index)
    .map((column) => {
      const entry = columnLayoutByColumn.get(column);
      if (!entry) return null;

      let leftOffset = entry.offset;
      let rightOffset = entry.offset + entry.width;

      if (mode === 'paired-mine') {
        leftOffset = entry.offset + entry.width;
        rightOffset = entry.offset + entry.displayWidth;
      } else if (mode === 'compact-base') {
        rightOffset = entry.offset + getCompactHalfWidth(entry);
      } else if (mode === 'compact-mine') {
        leftOffset = entry.offset + getCompactHalfWidth(entry);
        rightOffset = entry.offset + entry.width;
      }

      return { leftOffset, rightOffset, entry };
    })
    .filter((segment): segment is { leftOffset: number; rightOffset: number; entry: HorizontalVirtualColumnEntry } => Boolean(segment));

  if (segmentOffsets.length === 0) return null;

  const leftOffset = Math.min(...segmentOffsets.map((segment) => segment.leftOffset));
  const rightOffset = Math.max(...segmentOffsets.map((segment) => segment.rightOffset));
  const width = Math.max(0, rightOffset - leftOffset);
  const startFrozen = segmentOffsets.some((segment) => segment.entry.position < freezeColumnCount);
  const endFrozen = segmentOffsets.some((segment) => segment.entry.position >= freezeColumnCount);

  return {
    startCol,
    endCol,
    leftOffset,
    rightOffset,
    width,
    startEntry,
    endEntry,
    spansFreezeBoundary: startFrozen && endFrozen,
    segmentOffsets: segmentOffsets.map(({ leftOffset, rightOffset }) => ({ leftOffset, rightOffset })),
  };
}

export function getWorkbookCanvasSpanRect(
  bounds: WorkbookColumnSpanBounds,
  contentLeft: number,
  currentScrollLeft: number,
  frozenWidth: number,
): { left: number; width: number } | null {
  const geometry = getWorkbookCanvasSpanGeometry(
    bounds,
    contentLeft,
    currentScrollLeft,
    frozenWidth,
  );
  return geometry ? { left: geometry.left, width: geometry.width } : null;
}

export function getWorkbookCanvasSpanGeometry(
  bounds: WorkbookColumnSpanBounds,
  contentLeft: number,
  currentScrollLeft: number,
  frozenWidth: number,
): WorkbookCanvasSpanGeometry | null {
  const boundaryX = contentLeft + frozenWidth;
  const segments: WorkbookCanvasSpanSegment[] = [];

  bounds.segmentOffsets.forEach((segment) => {
    if (!bounds.spansFreezeBoundary) {
      const frozen = segment.rightOffset <= frozenWidth || bounds.startEntry.offset < frozenWidth;
      const left = contentLeft + segment.leftOffset - (frozen ? 0 : currentScrollLeft);
      segments.push({ left, width: segment.rightOffset - segment.leftOffset });
      return;
    }

    if (segment.leftOffset < frozenWidth) {
      const frozenLeftOffset = segment.leftOffset;
      const frozenRightOffset = Math.min(segment.rightOffset, frozenWidth);
      if (frozenRightOffset > frozenLeftOffset) {
        segments.push({
          left: contentLeft + frozenLeftOffset,
          width: frozenRightOffset - frozenLeftOffset,
        });
      }
    }

    if (segment.rightOffset > frozenWidth) {
      const scrollLeftOffset = Math.max(segment.leftOffset, frozenWidth);
      const scrollRightOffset = segment.rightOffset;
      const rawLeft = contentLeft + scrollLeftOffset - currentScrollLeft;
      const rawRight = contentLeft + scrollRightOffset - currentScrollLeft;
      const clippedLeft = Math.max(boundaryX, rawLeft);
      if (rawRight > clippedLeft) {
        segments.push({
          left: clippedLeft,
          width: rawRight - clippedLeft,
        });
      }
    }
  });

  const visibleSegments = segments.filter((segment) => segment.width > 0);
  if (visibleSegments.length === 0) return null;
  const left = visibleSegments[0]!.left;
  const right = visibleSegments[visibleSegments.length - 1]!.left + visibleSegments[visibleSegments.length - 1]!.width;

  return {
    left,
    right,
    width: Math.max(0, right - left),
    segments: visibleSegments,
  };
}

export function getWorkbookMergedCompareCell(
  compareCells: Map<number, WorkbookCompareCellState>,
  range: WorkbookMergeRange,
): WorkbookCompareCellState | undefined {
  let fallback: WorkbookCompareCellState | undefined;

  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const cell = compareCells.get(column);
    if (!cell) continue;
    fallback ??= cell;
    if (cell.changed) return cell;
  }

  return fallback;
}

export function getWorkbookMergeDrawInfo(params: {
  rowNumber: number;
  column: number;
  rowTop: number;
  rowHeight: number;
  renderedRowNumbers: number[];
  mergedRanges: WorkbookMergeRange[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  currentScrollLeft: number;
  freezeColumnCount: number;
  frozenWidth: number;
  mode: WorkbookColumnSpanMode;
}): WorkbookMergeDrawInfo {
  const range = findWorkbookMergeRange(params.mergedRanges, params.rowNumber, params.column);
  if (!range) {
    return { covered: false, region: null };
  }

  if (params.column !== range.startCol) {
    return { covered: true, region: null };
  }

  const visibleStartRow = params.renderedRowNumbers.find(
    (rowNumber) => rowNumber >= range.startRow && rowNumber <= range.endRow,
  );
  if (visibleStartRow == null || params.rowNumber !== visibleStartRow) {
    return { covered: true, region: null };
  }

  const bounds = getWorkbookColumnSpanBounds(
    range.startCol,
    range.endCol,
    params.columnLayoutByColumn,
    params.mode,
    params.freezeColumnCount,
  );
  if (!bounds) {
    return { covered: false, region: null };
  }

  const geometry = getWorkbookCanvasSpanGeometry(
    bounds,
    params.contentLeft,
    params.currentScrollLeft,
    params.frozenWidth,
  );
  if (!geometry) {
    return { covered: false, region: null };
  }

  return {
    covered: true,
    region: {
      range,
      left: geometry.left,
      top: params.rowTop,
      width: geometry.width,
      height: Math.max(params.rowHeight, ((range.endRow - visibleStartRow) + 1) * params.rowHeight),
      visibleStartRow,
      segments: geometry.segments,
    },
  };
}
