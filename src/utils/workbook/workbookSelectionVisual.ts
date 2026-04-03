import type { ThemeTokens } from '@/theme/tokens';
import type { WorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import { resolveWorkbookRowSelectionAccent } from '@/utils/workbook/workbookRowVisuals';

export interface WorkbookSelectionVisualState {
  accent: string;
  axisAccent: string;
  searchAccent: string;
  contrastStroke: string;
  isSearchFocused: boolean;
  isPreviewActive: boolean;
  isPrimarySelected: boolean;
  isSecondarySelected: boolean;
  isMirroredSelection: boolean;
  isSelectedRow: boolean;
  isSelectedColumn: boolean;
  isFocusedRowAnchor: boolean;
  isFocusedColumnAnchor: boolean;
  hasAxisSelection: boolean;
  hasFocusedAnchor: boolean;
  hasSelectionHighlight: boolean;
  previewEdges: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

interface WorkbookSelectionPreviewSpan {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface WorkbookSelectionPaint {
  overlay: string | null;
  rowAxisFill: string | null;
  columnAxisFill: string | null;
  previewStroke: string | null;
  searchHaloStroke: string | null;
  focusStroke: string | null;
  primaryOuterStroke: string | null;
  primaryInnerStroke: string | null;
  secondaryStroke: string | null;
  mirroredOuterStroke: string | null;
  mirroredInnerStroke: string | null;
  anchorStroke: string | null;
}

const EMPTY_LOOKUP: WorkbookSelectionLookup = {
  anchor: null,
  primary: null,
  rowKeys: new Set<string>(),
  columnKeys: new Set<string>(),
  cellKeys: new Set<string>(),
  mirroredCellKeys: new Set<string>(),
  cellColumnKeys: new Set<string>(),
};

function buildAxisKey(sheetName: string, value: number): string {
  return `${sheetName}:${value}`;
}

function buildCellKey(
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
): string {
  return `${sheetName}:${side}:${rowNumber}:${column}`;
}

function resolvePreviewSpanEdges(
  lookup: WorkbookSelectionLookup,
  sheetName: string,
  side: 'base' | 'mine',
  span: WorkbookSelectionPreviewSpan,
): WorkbookSelectionVisualState['previewEdges'] {
  const { cellKeys } = lookup;
  const hasDirectSelection = (rowNumber: number, column: number) => (
    cellKeys.has(buildCellKey(sheetName, side, rowNumber, column))
  );

  const hasSelectedTop = span.startRow > 1
    && Array.from({ length: (span.endColumn - span.startColumn) + 1 }, (_, index) => (
      hasDirectSelection(span.startRow - 1, span.startColumn + index)
    )).every(Boolean);
  const hasSelectedBottom = Array.from({ length: (span.endColumn - span.startColumn) + 1 }, (_, index) => (
    hasDirectSelection(span.endRow + 1, span.startColumn + index)
  )).every(Boolean);
  const hasSelectedLeft = span.startColumn > 0
    && Array.from({ length: (span.endRow - span.startRow) + 1 }, (_, index) => (
      hasDirectSelection(span.startRow + index, span.startColumn - 1)
    )).every(Boolean);
  const hasSelectedRight = Array.from({ length: (span.endRow - span.startRow) + 1 }, (_, index) => (
    hasDirectSelection(span.startRow + index, span.endColumn + 1)
  )).every(Boolean);

  return {
    top: !hasSelectedTop,
    right: !hasSelectedRight,
    bottom: !hasSelectedBottom,
    left: !hasSelectedLeft,
  };
}

export function getWorkbookSelectionVisualState(
  T: ThemeTokens,
  selectionLookup: WorkbookSelectionLookup | null | undefined,
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
  isSearchFocused = false,
  isPreviewActive = false,
  previewSpan?: WorkbookSelectionPreviewSpan,
): WorkbookSelectionVisualState {
  const lookup = selectionLookup ?? EMPTY_LOOKUP;
  const primary = lookup.primary;
  const selectionKind = primary?.kind ?? 'cell';
  const isSameSheet = Boolean(primary && primary.sheetName === sheetName);
  const accent = resolveWorkbookRowSelectionAccent(T, side);
  const axisAccent = resolveWorkbookRowSelectionAccent(T, side);
  const rowKey = buildAxisKey(sheetName, rowNumber);
  const columnKey = buildAxisKey(sheetName, column);
  const cellKey = buildCellKey(sheetName, side, rowNumber, column);
  const isPrimarySelected = Boolean(
    isSameSheet
    && selectionKind === 'cell'
    && primary?.side === side
    && primary?.rowNumber === rowNumber
    && primary?.colIndex === column,
  );
  const isSecondarySelected = Boolean(
    !isPrimarySelected
    && lookup.cellKeys.has(cellKey),
  );
  const isMirroredSelection = Boolean(
    !isPrimarySelected
    && !isSecondarySelected
    && lookup.mirroredCellKeys.has(cellKey),
  );
  const isSelectedRow = lookup.rowKeys.has(rowKey);
  const isSelectedColumn = lookup.columnKeys.has(columnKey);
  const isFocusedRowAnchor = Boolean(
    isSameSheet
    && selectionKind === 'row'
    && primary?.side === side
    && primary?.rowNumber === rowNumber
    && primary?.colIndex === column,
  );
  const isFocusedColumnAnchor = Boolean(
    isSameSheet
    && selectionKind === 'column'
    && primary?.side === side
    && primary?.rowNumber === rowNumber
    && primary?.colIndex === column,
  );
  const hasAxisSelection = isSelectedRow || isSelectedColumn;
  const hasFocusedAnchor = isFocusedRowAnchor || isFocusedColumnAnchor;
  const previewEdges = isPreviewActive && (isPrimarySelected || isSecondarySelected)
    ? resolvePreviewSpanEdges(
      lookup,
      sheetName,
      side,
      previewSpan ?? {
        startRow: rowNumber,
        endRow: rowNumber,
        startColumn: column,
        endColumn: column,
      },
    )
    : {
      top: false,
      right: false,
      bottom: false,
      left: false,
    };

  return {
    accent,
    axisAccent,
    searchAccent: T.searchHl,
    contrastStroke: T.bg0,
    isSearchFocused,
    isPreviewActive,
    isPrimarySelected,
    isSecondarySelected,
    isMirroredSelection,
    isSelectedRow,
    isSelectedColumn,
    isFocusedRowAnchor,
    isFocusedColumnAnchor,
    hasAxisSelection,
    hasFocusedAnchor,
    hasSelectionHighlight: isPrimarySelected || isSecondarySelected || isMirroredSelection || hasAxisSelection,
    previewEdges,
  };
}

export function getWorkbookSelectionOverlay(
  state: Pick<WorkbookSelectionVisualState, 'accent' | 'axisAccent' | 'contrastStroke' | 'hasAxisSelection' | 'isMirroredSelection' | 'isPreviewActive' | 'isPrimarySelected' | 'isSecondarySelected' | 'isSearchFocused' | 'searchAccent'>,
): string | null {
  return getWorkbookSelectionPaint({
    ...state,
    isSelectedRow: false,
    isSelectedColumn: false,
    isFocusedRowAnchor: false,
    isFocusedColumnAnchor: false,
    hasFocusedAnchor: false,
    hasSelectionHighlight: state.isPrimarySelected || state.isSecondarySelected || state.isMirroredSelection || state.hasAxisSelection,
    previewEdges: {
      top: false,
      right: false,
      bottom: false,
      left: false,
    },
  }).overlay;
}

export function getWorkbookSelectionPaint(
  state: WorkbookSelectionVisualState,
): WorkbookSelectionPaint {
  return {
    overlay: state.isPrimarySelected
      ? (state.isSearchFocused
        ? `${state.searchAccent}${state.isPreviewActive ? '32' : '26'}`
        : `${state.accent}${state.isPreviewActive ? '22' : '14'}`)
      : state.isSecondarySelected || state.isMirroredSelection
      ? `${state.accent}${state.isPreviewActive ? '18' : '0d'}`
      : state.hasAxisSelection
      ? `${state.axisAccent}${state.isPreviewActive ? '12' : '0a'}`
      : null,
    rowAxisFill: state.isSelectedRow ? `${state.axisAccent}70` : null,
    columnAxisFill: state.isSelectedColumn ? `${state.axisAccent}78` : null,
    previewStroke: state.isPreviewActive && (state.isPrimarySelected || state.isSecondarySelected || state.isMirroredSelection)
      ? `${state.accent}96`
      : null,
    searchHaloStroke: state.isSearchFocused ? `${state.searchAccent}c8` : null,
    focusStroke: state.hasFocusedAnchor ? `${state.accent}24` : null,
    primaryOuterStroke: state.isPrimarySelected ? `${state.contrastStroke}e6` : null,
    primaryInnerStroke: state.isPrimarySelected ? state.accent : null,
    secondaryStroke: state.isSecondarySelected ? `${state.accent}78` : null,
    mirroredOuterStroke: state.isMirroredSelection ? `${state.contrastStroke}c8` : null,
    mirroredInnerStroke: state.isMirroredSelection ? `${state.accent}7a` : null,
    anchorStroke: !state.isPrimarySelected && !state.isSecondarySelected && !state.isMirroredSelection && state.hasFocusedAnchor
      ? `${state.accent}9e`
      : null,
  };
}

function drawInsetFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  thickness: number,
  inset = 0,
) {
  const left = Math.round(x + inset);
  const top = Math.round(y + inset);
  const frameWidth = Math.max(0, Math.round(width - (inset * 2)));
  const frameHeight = Math.max(0, Math.round(height - (inset * 2)));
  if (frameWidth <= 0 || frameHeight <= 0 || thickness <= 0) return;

  const frameThickness = Math.max(1, Math.min(
    thickness,
    Math.ceil(frameWidth / 2),
    Math.ceil(frameHeight / 2),
  ));
  const verticalHeight = Math.max(0, frameHeight - (frameThickness * 2));

  ctx.fillStyle = color;
  ctx.fillRect(left, top, frameWidth, frameThickness);
  if (frameHeight > frameThickness) {
    ctx.fillRect(left, top + frameHeight - frameThickness, frameWidth, frameThickness);
  }
  if (verticalHeight > 0) {
    ctx.fillRect(left, top + frameThickness, frameThickness, verticalHeight);
    if (frameWidth > frameThickness) {
      ctx.fillRect(left + frameWidth - frameThickness, top + frameThickness, frameThickness, verticalHeight);
    }
  }
}

function drawWorkbookPreviewSelectionEdges(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  edges: WorkbookSelectionVisualState['previewEdges'],
  color: string,
) {
  if (!edges.top && !edges.right && !edges.bottom && !edges.left) return;
  const left = x + 1;
  const right = x + width - 1;
  const top = y + 1;
  const bottom = y + height - 1;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 3]);
  ctx.lineCap = 'butt';

  if (edges.top) {
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.stroke();
  }
  if (edges.right) {
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();
  }
  if (edges.bottom) {
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
  }
  if (edges.left) {
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawWorkbookCanvasSelectionFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  state: WorkbookSelectionVisualState,
) {
  if (!state.hasSelectionHighlight && !state.hasFocusedAnchor) return;

  const axisThickness = Math.min(2, Math.max(1, Math.floor(Math.min(width, height) / 8)));
  const paint = getWorkbookSelectionPaint(state);

  ctx.save();

  if (paint.rowAxisFill) {
    ctx.fillStyle = paint.rowAxisFill;
    ctx.fillRect(x, y, width, axisThickness);
    ctx.fillRect(x, y + height - axisThickness, width, axisThickness);
  }

  if (paint.columnAxisFill) {
    ctx.fillStyle = paint.columnAxisFill;
    ctx.fillRect(x, y, axisThickness, height);
    ctx.fillRect(x + width - axisThickness, y, axisThickness, height);
  }

  if (paint.searchHaloStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.searchHaloStroke, 1, 0);
  }

  if (paint.previewStroke) {
    drawWorkbookPreviewSelectionEdges(ctx, x, y, width, height, state.previewEdges, paint.previewStroke);
  }

  if (paint.focusStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.focusStroke, 1, 0);
  }

  if (paint.primaryOuterStroke && paint.primaryInnerStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.primaryOuterStroke, 1, 0);
    drawInsetFrame(ctx, x, y, width, height, paint.primaryInnerStroke, 2, 1);
  } else if (paint.secondaryStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.secondaryStroke, 1, 1);
  } else if (paint.mirroredOuterStroke && paint.mirroredInnerStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.mirroredOuterStroke, 1, 0);
    ctx.strokeStyle = paint.mirroredOuterStroke;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, Math.max(0, width - 3), Math.max(0, height - 3));
    ctx.setLineDash([]);
    drawInsetFrame(ctx, x, y, width, height, paint.mirroredInnerStroke, 1, 1);
  } else if (paint.anchorStroke) {
    drawInsetFrame(ctx, x, y, width, height, paint.anchorStroke, 1, 1);
  }

  ctx.restore();
}
