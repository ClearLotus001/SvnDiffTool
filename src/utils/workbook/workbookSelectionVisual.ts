import type { Theme } from '@/types';
import type { WorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';

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
  const accent = side === 'base' ? T.acc2 : T.acc;
  const axisAccent = side === 'base' ? T.acc2 : T.acc;
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
  if (state.isPrimarySelected) return `${state.accent}2c`;
  if (state.isSecondarySelected) return `${state.accent}18`;
  if (state.isMirroredSelection) return `${state.accent}18`;
  if (state.hasAxisSelection) return `${state.axisAccent}12`;
  return null;
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

  ctx.save();

  if (state.isSelectedRow) {
    ctx.fillStyle = `${state.axisAccent}8f`;
    ctx.fillRect(x, y, width, axisThickness);
    ctx.fillRect(x, y + height - axisThickness, width, axisThickness);
  }

  if (state.isSelectedColumn) {
    ctx.fillStyle = `${state.axisAccent}9f`;
    ctx.fillRect(x, y, axisThickness, height);
    ctx.fillRect(x + width - axisThickness, y, axisThickness, height);
  }

  if (state.hasFocusedAnchor) {
    ctx.strokeStyle = `${state.accent}38`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
  }

  if (state.isPrimarySelected) {
    ctx.strokeStyle = `${state.accent}48`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
    ctx.strokeStyle = state.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (state.isSecondarySelected) {
    ctx.strokeStyle = `${state.accent}82`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (state.isMirroredSelection) {
    ctx.strokeStyle = `${state.accent}36`;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
    ctx.setLineDash([]);
    ctx.strokeStyle = `${state.accent}9a`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  } else if (state.hasFocusedAnchor) {
    ctx.strokeStyle = `${state.accent}c8`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, innerWidth, innerHeight);
  }

  ctx.restore();
}
