import type { ThemeTokens } from '@/theme/tokens';
import type { WorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import { resolveWorkbookRowSelectionAccent } from '@/utils/workbook/workbookRowVisuals';
import {
  WORKBOOK_CANVAS_BORDER_PRIORITY,
  type WorkbookCanvasBorderEdges,
} from '@/utils/workbook/workbookCanvasBorders';

export interface WorkbookSelectionVisualState {
  accent: string;
  axisAccent: string;
  searchAccent: string;
  isSearchFocused: boolean;
  isPreviewActive: boolean;
  isPrimarySelected: boolean;
  isSecondarySelected: boolean;
  isMirroredSelection: boolean;
  isActiveComparisonCell: boolean;
  isSelectedComparisonCell: boolean;
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
  previewStroke: string | null;
  cellStroke: string | null;
  cellStrokeWidth: number;
}

export interface WorkbookSelectionBorderVisual {
  color: string;
  thickness: number;
  priority: number;
  edges: WorkbookCanvasBorderEdges;
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
  const isActiveComparisonCell = Boolean(
    isSameSheet
    && selectionKind === 'cell'
    && primary?.rowNumber === rowNumber
    && primary?.colIndex === column,
  );
  const isSelectedComparisonCell = isPrimarySelected || isSecondarySelected || isMirroredSelection;
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
    isSearchFocused,
    isPreviewActive,
    isPrimarySelected,
    isSecondarySelected,
    isMirroredSelection,
    isActiveComparisonCell,
    isSelectedComparisonCell,
    isSelectedRow,
    isSelectedColumn,
    isFocusedRowAnchor,
    isFocusedColumnAnchor,
    hasAxisSelection,
    hasFocusedAnchor,
    hasSelectionHighlight: isSelectedComparisonCell || hasAxisSelection,
    previewEdges,
  };
}

export function getWorkbookSelectionOverlay(
  state: Pick<WorkbookSelectionVisualState, 'accent' | 'axisAccent' | 'hasAxisSelection' | 'isActiveComparisonCell' | 'isMirroredSelection' | 'isPreviewActive' | 'isPrimarySelected' | 'isSecondarySelected' | 'isSearchFocused' | 'isSelectedComparisonCell' | 'searchAccent'>,
): string | null {
  return getWorkbookSelectionPaint({
    ...state,
    isSelectedRow: false,
    isSelectedColumn: false,
    isFocusedRowAnchor: false,
    isFocusedColumnAnchor: false,
    hasFocusedAnchor: false,
    hasSelectionHighlight: state.isSelectedComparisonCell || state.hasAxisSelection,
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
  const isDirectCellSelection = state.isPrimarySelected || state.isSecondarySelected;
  const isPreviewCell = state.isPreviewActive && isDirectCellSelection;

  return {
    overlay: isPreviewCell
      ? `${state.accent}0d`
      : state.hasAxisSelection
      ? `${state.axisAccent}${state.isPreviewActive ? '12' : '0a'}`
      : null,
    previewStroke: isPreviewCell
      ? `${state.accent}96`
      : null,
    cellStroke: state.isSelectedComparisonCell && !isPreviewCell
      ? (state.isSearchFocused ? state.searchAccent : state.accent)
      : null,
    cellStrokeWidth: state.isActiveComparisonCell ? 2 : 1,
  };
}

export function getWorkbookSelectionBorderVisual(
  state: WorkbookSelectionVisualState,
): WorkbookSelectionBorderVisual | null {
  const paint = getWorkbookSelectionPaint(state);
  if (paint.cellStroke) {
    return {
      color: paint.cellStroke,
      thickness: paint.cellStrokeWidth,
      priority: state.isPrimarySelected
        ? WORKBOOK_CANVAS_BORDER_PRIORITY.primarySelection
        : state.isSecondarySelected
          ? WORKBOOK_CANVAS_BORDER_PRIORITY.rangeSelection
          : WORKBOOK_CANVAS_BORDER_PRIORITY.mirroredSelection,
      edges: {
        top: true,
        right: true,
        bottom: true,
        left: true,
      },
    };
  }
  if (!state.hasAxisSelection) return null;

  return {
    color: `${state.axisAccent}a6`,
    thickness: 2,
    priority: WORKBOOK_CANVAS_BORDER_PRIORITY.axisSelection,
    edges: {
      top: state.isSelectedRow,
      right: state.isSelectedColumn,
      bottom: state.isSelectedRow,
      left: state.isSelectedColumn,
    },
  };
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

  const paint = getWorkbookSelectionPaint(state);

  ctx.save();

  if (paint.previewStroke) {
    drawWorkbookPreviewSelectionEdges(ctx, x, y, width, height, state.previewEdges, paint.previewStroke);
  }

  ctx.restore();
}
