import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookSelectedCell } from '@/types';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';

export type WorkbookColumnSpanMode =
  | 'single'
  | 'paired-shared'
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
  rowSegments: WorkbookCanvasRowSegment[];
}

export interface WorkbookMergeDrawInfo {
  covered: boolean;
  region: WorkbookMergedRegion | null;
}

export interface WorkbookCanvasSpanSegment {
  left: number;
  width: number;
}

export interface WorkbookCanvasRowSegment {
  top: number;
  height: number;
}

export interface WorkbookCanvasSpanGeometry {
  left: number;
  right: number;
  width: number;
  segments: WorkbookCanvasSpanSegment[];
  layerSegments: {
    frozen: WorkbookCanvasSpanSegment[];
    scroll: WorkbookCanvasSpanSegment[];
  };
}

export interface WorkbookCanvasCellViewportRect {
  left: number;
  width: number;
}

export interface WorkbookCanvasLayerViewports {
  content: WorkbookCanvasCellViewportRect;
  frozen: WorkbookCanvasCellViewportRect | null;
  scroll: WorkbookCanvasCellViewportRect | null;
  frozenBoundaryX: number;
}

export function clipWorkbookCanvasToViewport(
  ctx: CanvasRenderingContext2D,
  viewportRect: WorkbookCanvasCellViewportRect,
  top: number,
  height: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportRect.left, top, viewportRect.width, height);
  ctx.clip();
  draw();
  ctx.restore();
}

function mergeContiguousCanvasSegments(
  segments: WorkbookCanvasSpanSegment[],
): WorkbookCanvasSpanSegment[] {
  if (segments.length <= 1) return segments;

  const merged: WorkbookCanvasSpanSegment[] = [];
  segments.forEach((segment) => {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push({ ...segment });
      return;
    }

    const previousRight = previous.left + previous.width;
    if (Math.abs(previousRight - segment.left) <= 0.5) {
      previous.width = (segment.left + segment.width) - previous.left;
      return;
    }

    merged.push({ ...segment });
  });

  return merged;
}

function getWorkbookCanvasSpanSegmentBounds(
  segments: WorkbookCanvasSpanSegment[],
): { left: number; right: number; width: number } | null {
  if (segments.length === 0) return null;

  const left = Math.min(...segments.map((segment) => segment.left));
  const right = Math.max(...segments.map((segment) => segment.left + segment.width));
  return {
    left,
    right,
    width: Math.max(0, right - left),
  };
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

      if (mode === 'paired-shared') {
        rightOffset = entry.offset + entry.displayWidth;
      } else if (mode === 'paired-mine') {
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
  const frozenLayerSegments: WorkbookCanvasSpanSegment[] = [];
  const scrollLayerSegments: WorkbookCanvasSpanSegment[] = [];

  bounds.segmentOffsets.forEach((segment) => {
    if (segment.leftOffset < frozenWidth) {
      const frozenLeftOffset = segment.leftOffset;
      const frozenRightOffset = Math.min(segment.rightOffset, frozenWidth);
      if (frozenRightOffset > frozenLeftOffset) {
        const frozenSegment = {
          left: contentLeft + frozenLeftOffset,
          width: frozenRightOffset - frozenLeftOffset,
        };
        segments.push(frozenSegment);
        frozenLayerSegments.push(frozenSegment);
      }
    }

    if (segment.rightOffset > frozenWidth) {
      const scrollLeftOffset = Math.max(segment.leftOffset, frozenWidth);
      const scrollRightOffset = segment.rightOffset;
      const rawLeft = contentLeft + scrollLeftOffset - currentScrollLeft;
      const rawRight = contentLeft + scrollRightOffset - currentScrollLeft;
      if (rawRight > rawLeft) {
        scrollLayerSegments.push({
          left: rawLeft,
          width: rawRight - rawLeft,
        });
      }
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
  const normalizedSegments = bounds.spansFreezeBoundary
    ? visibleSegments
    : mergeContiguousCanvasSegments(visibleSegments);
  const normalizedFrozenLayerSegments = mergeContiguousCanvasSegments(
    frozenLayerSegments.filter((segment) => segment.width > 0),
  );
  const normalizedScrollLayerSegments = mergeContiguousCanvasSegments(
    scrollLayerSegments.filter((segment) => segment.width > 0),
  );
  const normalizedBounds = getWorkbookCanvasSpanSegmentBounds(normalizedSegments);
  if (!normalizedBounds) return null;

  return {
    left: normalizedBounds.left,
    right: normalizedBounds.right,
    width: normalizedBounds.width,
    segments: normalizedSegments,
    layerSegments: {
      frozen: normalizedFrozenLayerSegments,
      scroll: normalizedScrollLayerSegments,
    },
  };
}

export function getWorkbookCanvasSpanSegmentsForLayer(
  geometry: WorkbookCanvasSpanGeometry,
  layer: 'content' | 'frozen' | 'scroll',
): WorkbookCanvasSpanSegment[] {
  if (layer === 'content') return geometry.segments;
  return geometry.layerSegments[layer];
}

export function getWorkbookCanvasLayerViewports(params: {
  contentLeft: number;
  contentRight: number;
  frozenWidth: number;
}): WorkbookCanvasLayerViewports {
  const {
    contentLeft,
    contentRight,
    frozenWidth,
  } = params;

  const normalizedContentRight = Math.max(contentLeft, contentRight);
  const frozenBoundaryX = contentLeft + frozenWidth;
  const frozenRight = Math.min(normalizedContentRight, frozenBoundaryX);
  const scrollLeft = Math.max(contentLeft, frozenBoundaryX);
  const contentWidth = Math.max(0, normalizedContentRight - contentLeft);
  const frozenViewportWidth = Math.max(0, frozenRight - contentLeft);
  const scrollViewportWidth = Math.max(0, normalizedContentRight - scrollLeft);

  return {
    content: {
      left: contentLeft,
      width: contentWidth,
    },
    frozen: frozenViewportWidth > 0
      ? {
          left: contentLeft,
          width: frozenViewportWidth,
        }
      : null,
    scroll: scrollViewportWidth > 0
      ? {
          left: scrollLeft,
          width: scrollViewportWidth,
        }
      : null,
    frozenBoundaryX,
  };
}

export function getWorkbookCanvasCellViewportRect(params: {
  drawLeft: number;
  drawWidth: number;
  contentLeft: number;
  frozenWidth: number;
  frozen: boolean;
}): WorkbookCanvasCellViewportRect | null {
  const {
    drawLeft,
    drawWidth,
    contentLeft,
    frozenWidth,
    frozen,
  } = params;

  if (drawWidth <= 0) return null;
  if (frozen) {
    return {
      left: drawLeft,
      width: drawWidth,
    };
  }

  const boundaryX = contentLeft + frozenWidth;
  const visibleLeft = Math.max(drawLeft, boundaryX);
  const visibleRight = drawLeft + drawWidth;
  if (visibleRight <= visibleLeft) return null;

  return {
    left: visibleLeft,
    width: visibleRight - visibleLeft,
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

export function getWorkbookMergedCompareCellFromRows(
  compareCellsByRowNumber: Map<number, Map<number, WorkbookCompareCellState>>,
  range: WorkbookMergeRange,
): WorkbookCompareCellState | undefined {
  let fallback: WorkbookCompareCellState | undefined;

  for (let rowNumber = range.startRow; rowNumber <= range.endRow; rowNumber += 1) {
    const compareCells = compareCellsByRowNumber.get(rowNumber);
    if (!compareCells) continue;

    const cell = getWorkbookMergedCompareCell(compareCells, range);
    if (!cell) continue;

    fallback ??= cell;
    if (cell.changed) return cell;
  }

  return fallback;
}

function getWorkbookVisibleStartColumn(params: {
  range: WorkbookMergeRange;
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  currentScrollLeft: number;
  freezeColumnCount: number;
  frozenWidth: number;
  mode: WorkbookColumnSpanMode;
  layer?: 'content' | 'frozen' | 'scroll';
}): number | null {
  const {
    range,
    columnLayoutByColumn,
    contentLeft,
    currentScrollLeft,
    freezeColumnCount,
    frozenWidth,
    mode,
    layer = 'content',
  } = params;

  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const bounds = getWorkbookColumnSpanBounds(
      column,
      column,
      columnLayoutByColumn,
      mode,
      freezeColumnCount,
    );
    if (!bounds) continue;

    const geometry = getWorkbookCanvasSpanGeometry(
      bounds,
      contentLeft,
      currentScrollLeft,
      frozenWidth,
    );
    if (geometry && getWorkbookCanvasSpanSegmentsForLayer(geometry, layer).some((segment) => segment.width > 0)) {
      return column;
    }
  }

  return null;
}

export function getWorkbookCanvasRowSegments(
  range: WorkbookMergeRange,
  renderedRowNumbers: number[],
  rowLayoutByRowNumber: Map<number, { top: number; height: number }>,
): WorkbookCanvasRowSegment[] {
  return renderedRowNumbers
    .filter((rowNumber) => rowNumber >= range.startRow && rowNumber <= range.endRow)
    .map((rowNumber) => rowLayoutByRowNumber.get(rowNumber))
    .filter((segment): segment is { top: number; height: number } => Boolean(segment))
    .map((segment) => ({ top: segment.top, height: segment.height }))
    .sort((left, right) => left.top - right.top);
}

export function getWorkbookCanvasRowSegmentBounds(
  segments: WorkbookCanvasRowSegment[],
): { top: number; height: number } | null {
  if (segments.length === 0) return null;

  const top = segments[0]!.top;
  const bottom = Math.max(...segments.map((segment) => segment.top + segment.height));
  return {
    top,
    height: Math.max(0, bottom - top),
  };
}

export function findWorkbookCanvasRowSegmentAtY(
  segments: WorkbookCanvasRowSegment[],
  y: number,
): WorkbookCanvasRowSegment | null {
  return segments.find((segment) => y >= segment.top && y <= (segment.top + segment.height)) ?? null;
}

export function getWorkbookCanvasHoverRowSegmentBounds(
  segments: WorkbookCanvasRowSegment[],
  y: number,
): { top: number; height: number } | null {
  if (segments.length === 0) return null;

  if (segments.length === 1) {
    const segment = segments[0]!;
    return { top: segment.top, height: segment.height };
  }

  const hoveredSegment = findWorkbookCanvasRowSegmentAtY(segments, y) ?? segments[0]!;
  return {
    top: hoveredSegment.top,
    height: hoveredSegment.height,
  };
}

export function getWorkbookCanvasRowSegmentContentHeight(
  segments: WorkbookCanvasRowSegment[],
): number {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.height), 0);
}

export function getWorkbookCanvasRowSegmentLineSlotCenters(
  segments: WorkbookCanvasRowSegment[],
  lineCount: number,
  lineHeight: number,
): number[] {
  if (lineCount <= 0 || lineHeight <= 0) return [];

  const normalizedSegments = segments
    .filter((segment) => segment.height > 0)
    .sort((left, right) => left.top - right.top);
  if (normalizedSegments.length === 0) return [];

  const slotCenters = normalizedSegments.flatMap((segment) => {
    const innerHeight = Math.max(0, segment.height - 4);
    const capacity = Math.max(1, Math.floor(innerHeight / lineHeight));
    const blockHeight = capacity * lineHeight;
    const startY = segment.top + Math.max(2, (segment.height - blockHeight) / 2) + (lineHeight / 2);

    return Array.from({ length: capacity }, (_, index) => startY + (index * lineHeight));
  });

  return slotCenters.slice(0, Math.max(0, lineCount));
}

export function getWorkbookCanvasRowSegmentCenterY(
  segments: WorkbookCanvasRowSegment[],
): number | null {
  const slotCenters = getWorkbookCanvasRowSegmentLineSlotCenters(segments, 1, 16);
  if (slotCenters.length > 0) return slotCenters[0] ?? null;
  const bounds = getWorkbookCanvasRowSegmentBounds(segments);
  return bounds ? bounds.top + (bounds.height / 2) : null;
}

export function getWorkbookCanvasRowSegmentLineCenters(
  segments: WorkbookCanvasRowSegment[],
  lineCount: number,
  lineHeight: number,
): number[] {
  if (lineCount <= 0) return [];

  const slotCenters = getWorkbookCanvasRowSegmentLineSlotCenters(segments, lineCount, lineHeight);
  if (slotCenters.length === 0) return [];

  if (slotCenters.length <= lineCount) return slotCenters;
  return slotCenters.slice(0, lineCount);
}

export function getWorkbookMergeDrawInfo(params: {
  rowNumber: number;
  column: number;
  rowTop: number;
  rowHeight: number;
  renderedRowNumbers: number[];
  rowLayoutByRowNumber?: Map<number, { top: number; height: number }>;
  renderedColumns?: number[];
  mergedRanges: WorkbookMergeRange[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  contentLeft: number;
  currentScrollLeft: number;
  freezeColumnCount: number;
  frozenWidth: number;
  mode: WorkbookColumnSpanMode;
  layer?: 'content' | 'frozen' | 'scroll';
}): WorkbookMergeDrawInfo {
  const range = findWorkbookMergeRange(params.mergedRanges, params.rowNumber, params.column);
  if (!range) {
    return { covered: false, region: null };
  }

  const visibleStartColumn = getWorkbookVisibleStartColumn({
    range,
    columnLayoutByColumn: params.columnLayoutByColumn,
    contentLeft: params.contentLeft,
    currentScrollLeft: params.currentScrollLeft,
    freezeColumnCount: params.freezeColumnCount,
    frozenWidth: params.frozenWidth,
    mode: params.mode,
    layer: params.layer ?? 'content',
  });
  if (visibleStartColumn == null) {
    return { covered: true, region: null };
  }

  if (params.column !== visibleStartColumn) {
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

  const regionSegments = getWorkbookCanvasSpanSegmentsForLayer(geometry, params.layer ?? 'content');
  const regionBounds = getWorkbookCanvasSpanSegmentBounds(regionSegments);
  if (!regionBounds) {
    return { covered: true, region: null };
  }
  const rowSegments = params.rowLayoutByRowNumber
    ? getWorkbookCanvasRowSegments(range, params.renderedRowNumbers, params.rowLayoutByRowNumber)
    : [{
        top: params.rowTop,
        height: Math.max(params.rowHeight, ((range.endRow - visibleStartRow) + 1) * params.rowHeight),
      }];
  const rowSegmentBounds = getWorkbookCanvasRowSegmentBounds(rowSegments);
  if (!rowSegmentBounds) {
    return { covered: true, region: null };
  }

  return {
    covered: true,
    region: {
      range,
      left: regionBounds.left,
      top: rowSegmentBounds.top,
      width: regionBounds.width,
      height: rowSegmentBounds.height,
      visibleStartRow,
      segments: regionSegments,
      rowSegments,
    },
  };
}
