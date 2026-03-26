import type {
  WorkbookSelectedCell,
  WorkbookSelectionMode,
  WorkbookSelectionState,
} from '../types';

export interface WorkbookSelectionLookup {
  anchor: WorkbookSelectedCell | null;
  primary: WorkbookSelectedCell | null;
  rowKeys: Set<string>;
  columnKeys: Set<string>;
  cellKeys: Set<string>;
  mirroredCellKeys: Set<string>;
}

function buildAxisKey(sheetName: string, value: number): string {
  return `${sheetName}:${value}`;
}

function buildCellKey(
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  colIndex: number,
): string {
  return `${sheetName}:${side}:${rowNumber}:${colIndex}`;
}

function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function buildWorkbookSelectionKey(selection: WorkbookSelectedCell): string {
  if (selection.kind === 'row') {
    return `row:${buildAxisKey(selection.sheetName, selection.rowNumber)}`;
  }
  if (selection.kind === 'column') {
    return `column:${buildAxisKey(selection.sheetName, selection.colIndex)}`;
  }
  return `cell:${buildCellKey(selection.sheetName, selection.side, selection.rowNumber, selection.colIndex)}`;
}

export function createWorkbookSelectionState(
  primary: WorkbookSelectedCell | null,
  items: WorkbookSelectedCell[] = primary ? [primary] : [],
  anchor: WorkbookSelectedCell | null = primary,
): WorkbookSelectionState {
  if (!primary) {
    return { anchor: null, primary: null, items: [] };
  }

  const nextItems = new Map<string, WorkbookSelectedCell>();
  items.forEach((item) => {
    nextItems.set(buildWorkbookSelectionKey(item), item);
  });
  nextItems.set(buildWorkbookSelectionKey(primary), primary);

  return {
    anchor,
    primary,
    items: Array.from(nextItems.values()).sort(compareWorkbookSelections),
  };
}

function compareWorkbookSelections(left: WorkbookSelectedCell, right: WorkbookSelectedCell): number {
  if (left.sheetName !== right.sheetName) return left.sheetName.localeCompare(right.sheetName);
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  if (left.kind === 'row' && right.kind === 'row') {
    return left.rowNumber - right.rowNumber;
  }
  if (left.kind === 'column' && right.kind === 'column') {
    return left.colIndex - right.colIndex;
  }
  if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
  if (left.colIndex !== right.colIndex) return left.colIndex - right.colIndex;
  return left.side.localeCompare(right.side);
}

function canMergeSelections(
  current: WorkbookSelectedCell,
  next: WorkbookSelectedCell,
): boolean {
  if (current.sheetName !== next.sheetName || current.kind !== next.kind) return false;
  if (current.kind === 'cell') return current.side === next.side;
  return true;
}

function withCellValue(
  template: WorkbookSelectedCell,
  rowNumber: number,
  colIndex: number,
): WorkbookSelectedCell {
  const colLabel = getWorkbookColumnLabel(colIndex);
  return {
    ...template,
    rowNumber,
    colIndex,
    colLabel,
    address: `${colLabel}${rowNumber}`,
  };
}

function withRowValue(
  template: WorkbookSelectedCell,
  rowNumber: number,
): WorkbookSelectedCell {
  return {
    ...template,
    rowNumber,
    address: `${rowNumber}`,
    value: '',
    formula: '',
  };
}

function withColumnValue(
  template: WorkbookSelectedCell,
  colIndex: number,
): WorkbookSelectedCell {
  const colLabel = getWorkbookColumnLabel(colIndex);
  return {
    ...template,
    colIndex,
    colLabel,
    address: colLabel,
  };
}

function buildWorkbookRangeSelection(
  anchor: WorkbookSelectedCell,
  target: WorkbookSelectedCell,
): WorkbookSelectedCell[] {
  if (!canMergeSelections(anchor, target)) return [target];

  if (anchor.kind === 'row' && target.kind === 'row') {
    const startRow = Math.min(anchor.rowNumber, target.rowNumber);
    const endRow = Math.max(anchor.rowNumber, target.rowNumber);
    return Array.from({ length: (endRow - startRow) + 1 }, (_, index) => (
      withRowValue(target, startRow + index)
    ));
  }

  if (anchor.kind === 'column' && target.kind === 'column') {
    const startColumn = Math.min(anchor.colIndex, target.colIndex);
    const endColumn = Math.max(anchor.colIndex, target.colIndex);
    return Array.from({ length: (endColumn - startColumn) + 1 }, (_, index) => (
      withColumnValue(target, startColumn + index)
    ));
  }

  if (
    anchor.kind === 'cell'
    && target.kind === 'cell'
    && anchor.side === target.side
  ) {
    const startRow = Math.min(anchor.rowNumber, target.rowNumber);
    const endRow = Math.max(anchor.rowNumber, target.rowNumber);
    const startColumn = Math.min(anchor.colIndex, target.colIndex);
    const endColumn = Math.max(anchor.colIndex, target.colIndex);
    const cells: WorkbookSelectedCell[] = [];

    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
      for (let colIndex = startColumn; colIndex <= endColumn; colIndex += 1) {
        cells.push(withCellValue(target, rowNumber, colIndex));
      }
    }

    return cells;
  }

  return [target];
}

export function selectionContainsCell(
  selection: WorkbookSelectionState,
  target: WorkbookSelectedCell | null,
): boolean {
  if (!target) return false;
  const key = buildWorkbookSelectionKey(target);
  return selection.items.some(item => buildWorkbookSelectionKey(item) === key);
}

export function applyWorkbookSelection(
  current: WorkbookSelectionState,
  target: WorkbookSelectedCell | null,
  options: {
    mode?: WorkbookSelectionMode | undefined;
    preserveExistingIfTargetSelected?: boolean | undefined;
  } = {},
): WorkbookSelectionState {
  if (!target) return createWorkbookSelectionState(null);

  if (
    options.preserveExistingIfTargetSelected
    && selectionContainsCell(current, target)
  ) {
    return createWorkbookSelectionState(
      target,
      current.items,
      current.anchor ?? current.primary ?? target,
    );
  }

  const mode = options.mode ?? 'replace';
  const rangeAnchor = current.anchor ?? current.primary;
  if (mode === 'replace' || !rangeAnchor || !canMergeSelections(rangeAnchor, target)) {
    return createWorkbookSelectionState(target);
  }

  if (mode === 'toggle') {
    const targetKey = buildWorkbookSelectionKey(target);
    const remainingItems = current.items.filter(item => buildWorkbookSelectionKey(item) !== targetKey);

    if (remainingItems.length !== current.items.length) {
      if (remainingItems.length === 0) return createWorkbookSelectionState(null);
      const nextPrimary = (
        current.primary && buildWorkbookSelectionKey(current.primary) !== targetKey
          ? current.primary
          : remainingItems[remainingItems.length - 1]!
      );
      const nextAnchor = (
        current.anchor && buildWorkbookSelectionKey(current.anchor) !== targetKey
          ? current.anchor
          : remainingItems[0]!
      );
      return createWorkbookSelectionState(nextPrimary, remainingItems, nextAnchor);
    }

    return createWorkbookSelectionState(
      target,
      [...current.items, target],
      rangeAnchor,
    );
  }

  return createWorkbookSelectionState(
    target,
    buildWorkbookRangeSelection(rangeAnchor, target),
    rangeAnchor,
  );
}

export function buildWorkbookSelectionLookup(
  selection: WorkbookSelectionState | null | undefined,
): WorkbookSelectionLookup {
  const state = selection ?? createWorkbookSelectionState(null);
  const rowKeys = new Set<string>();
  const columnKeys = new Set<string>();
  const cellKeys = new Set<string>();
  const mirroredCellKeys = new Set<string>();

  state.items.forEach((item) => {
    if (item.kind === 'row') {
      rowKeys.add(buildAxisKey(item.sheetName, item.rowNumber));
      return;
    }
    if (item.kind === 'column') {
      columnKeys.add(buildAxisKey(item.sheetName, item.colIndex));
      return;
    }
    const key = buildCellKey(item.sheetName, item.side, item.rowNumber, item.colIndex);
    cellKeys.add(key);
    mirroredCellKeys.add(
      buildCellKey(
        item.sheetName,
        item.side === 'base' ? 'mine' : 'base',
        item.rowNumber,
        item.colIndex,
      ),
    );
  });

  return {
    anchor: state.anchor,
    primary: state.primary,
    rowKeys,
    columnKeys,
    cellKeys,
    mirroredCellKeys,
  };
}

export function getWorkbookSelectionCount(
  selection: WorkbookSelectionState | null | undefined,
): number {
  return selection?.items.length ?? 0;
}
