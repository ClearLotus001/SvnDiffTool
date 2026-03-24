import type { Theme, WorkbookSelectedCell } from '../types';

export interface WorkbookSelectionVisualState {
  accent: string;
  axisAccent: string;
  isSelected: boolean;
  isMirroredSelection: boolean;
  isSelectedRow: boolean;
  isSelectedColumn: boolean;
  isFocusedRowAnchor: boolean;
  isFocusedColumnAnchor: boolean;
  hasAxisSelection: boolean;
  hasFocusedAnchor: boolean;
  hasSelectionHighlight: boolean;
}

export function getWorkbookSelectionVisualState(
  T: Theme,
  selectedCell: WorkbookSelectedCell | null | undefined,
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
): WorkbookSelectionVisualState {
  const selectionKind = selectedCell?.kind ?? 'cell';
  const isSameSheet = Boolean(selectedCell && selectedCell.sheetName === sheetName);
  const accent = side === 'base' ? T.acc2 : T.acc;
  const axisAccent = side === 'base' ? T.acc2 : T.acc;
  const isSelected = Boolean(
    isSameSheet
    && selectionKind === 'cell'
    && selectedCell?.side === side
    && selectedCell?.rowNumber === rowNumber
    && selectedCell?.colIndex === column,
  );
  const isMirroredSelection = Boolean(
    isSameSheet
    && selectionKind === 'cell'
    && selectedCell?.side !== side
    && selectedCell?.rowNumber === rowNumber
    && selectedCell?.colIndex === column,
  );
  const isSelectedRow = Boolean(
    isSameSheet
    && selectionKind === 'row'
    && selectedCell?.rowNumber === rowNumber,
  );
  const isSelectedColumn = Boolean(
    isSameSheet
    && selectionKind === 'column'
    && selectedCell?.colIndex === column,
  );
  const isFocusedRowAnchor = Boolean(
    isSameSheet
    && selectionKind === 'row'
    && selectedCell?.side === side
    && selectedCell?.rowNumber === rowNumber
    && selectedCell?.colIndex === column,
  );
  const isFocusedColumnAnchor = Boolean(
    isSameSheet
    && selectionKind === 'column'
    && selectedCell?.side === side
    && selectedCell?.rowNumber === rowNumber
    && selectedCell?.colIndex === column,
  );
  const hasAxisSelection = isSelectedRow || isSelectedColumn;
  const hasFocusedAnchor = isFocusedRowAnchor || isFocusedColumnAnchor;

  return {
    accent,
    axisAccent,
    isSelected,
    isMirroredSelection,
    isSelectedRow,
    isSelectedColumn,
    isFocusedRowAnchor,
    isFocusedColumnAnchor,
    hasAxisSelection,
    hasFocusedAnchor,
    hasSelectionHighlight: isSelected || isMirroredSelection || hasAxisSelection,
  };
}

export function getWorkbookSelectionOverlay(
  state: Pick<WorkbookSelectionVisualState, 'accent' | 'axisAccent' | 'hasAxisSelection' | 'isMirroredSelection' | 'isSelected'>,
): string | null {
  if (state.isSelected) return `${state.accent}2c`;
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

  if (state.isSelected) {
    ctx.strokeStyle = `${state.accent}48`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, outerWidth, outerHeight);
    ctx.strokeStyle = state.accent;
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
