import type { Theme } from '@/types';
import type { WorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import { resolveWorkbookRowSelectionAccent } from '@/utils/workbook/workbookRowVisuals';

export interface WorkbookSelectionVisualState {
  accent: string;
  axisAccent: string;
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
}

export interface WorkbookSelectionPaint {
  overlay: string | null;
  rowAxisFill: string | null;
  columnAxisFill: string | null;
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

export function getWorkbookSelectionVisualState(
  T: Theme,
  selectionLookup: WorkbookSelectionLookup | null | undefined,
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
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

  return {
    accent,
    axisAccent,
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
  };
}

export function getWorkbookSelectionOverlay(
  state: Pick<WorkbookSelectionVisualState, 'accent' | 'axisAccent' | 'hasAxisSelection' | 'isMirroredSelection' | 'isPrimarySelected' | 'isSecondarySelected'>,
): string | null {
  return getWorkbookSelectionPaint({
    ...state,
    isSelectedRow: false,
    isSelectedColumn: false,
    isFocusedRowAnchor: false,
    isFocusedColumnAnchor: false,
    hasFocusedAnchor: false,
    hasSelectionHighlight: state.isPrimarySelected || state.isSecondarySelected || state.isMirroredSelection || state.hasAxisSelection,
  }).overlay;
}

export function getWorkbookSelectionPaint(
  state: WorkbookSelectionVisualState,
): WorkbookSelectionPaint {
  return {
    overlay: state.isPrimarySelected
      ? `${state.accent}2c`
      : state.isSecondarySelected || state.isMirroredSelection
      ? `${state.accent}18`
      : state.hasAxisSelection
      ? `${state.axisAccent}12`
      : null,
    rowAxisFill: state.isSelectedRow ? `${state.axisAccent}8f` : null,
    columnAxisFill: state.isSelectedColumn ? `${state.axisAccent}9f` : null,
    focusStroke: state.hasFocusedAnchor ? `${state.accent}38` : null,
    primaryOuterStroke: state.isPrimarySelected ? `${state.accent}48` : null,
    primaryInnerStroke: state.isPrimarySelected ? state.accent : null,
    secondaryStroke: state.isSecondarySelected ? `${state.accent}82` : null,
    mirroredOuterStroke: state.isMirroredSelection ? `${state.accent}36` : null,
    mirroredInnerStroke: state.isMirroredSelection ? `${state.accent}9a` : null,
    anchorStroke: !state.isPrimarySelected && !state.isSecondarySelected && !state.isMirroredSelection && state.hasFocusedAnchor
      ? `${state.accent}c8`
      : null,
  };
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
  const innerWidth = Math.max(0, width - 2);
  const innerHeight = Math.max(0, height - 2);
  const outerWidth = Math.max(0, width - 1);
  const outerHeight = Math.max(0, height - 1);
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

  if (paint.focusStroke) {
    ctx.strokeStyle = paint.focusStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
  }

  if (paint.primaryOuterStroke && paint.primaryInnerStroke) {
    ctx.strokeStyle = paint.primaryOuterStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
    ctx.strokeStyle = paint.primaryInnerStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (paint.secondaryStroke) {
    ctx.strokeStyle = paint.secondaryStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (paint.mirroredOuterStroke && paint.mirroredInnerStroke) {
    ctx.strokeStyle = paint.mirroredOuterStroke;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
    ctx.setLineDash([]);
    ctx.strokeStyle = paint.mirroredInnerStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (paint.anchorStroke) {
    ctx.strokeStyle = paint.anchorStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  }

  ctx.restore();
}
