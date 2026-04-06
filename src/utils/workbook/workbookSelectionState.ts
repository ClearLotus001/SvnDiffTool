import type {
  WorkbookSelectedCell,
  WorkbookSelectionMode,
  WorkbookSelectionState,
} from '@/types';

export interface WorkbookSelectionLookup {
  anchor: WorkbookSelectedCell | null;
  primary: WorkbookSelectedCell | null;
  rowKeys: Set<string>;
  columnKeys: Set<string>;
  cellKeys: Set<string>;
  mirroredCellKeys: Set<string>;
  cellColumnKeys: Set<string>;
}

interface WorkbookSelectionStateInternal extends WorkbookSelectionState {
  __keySetCache?: Set<string>;
  __lookupCache?: WorkbookSelectionLookup;
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

function getSelectionStateInternal(
  selection: WorkbookSelectionState | null | undefined,
): WorkbookSelectionStateInternal | null {
  return selection as WorkbookSelectionStateInternal | null;
}

function getWorkbookSelectionKeySet(
  selection: WorkbookSelectionState | null | undefined,
): Set<string> {
  const internal = getSelectionStateInternal(selection);
  if (!internal) return new Set<string>();
  if (internal.__keySetCache) return internal.__keySetCache;
  const keySet = new Set(internal.items.map(item => buildWorkbookSelectionKey(item)));
  internal.__keySetCache = keySet;
  return keySet;
}

export function createWorkbookSelectionState(
  primary: WorkbookSelectedCell | null,
  items: WorkbookSelectedCell[] = primary ? [primary] : [],
  anchor: WorkbookSelectedCell | null = primary,
): WorkbookSelectionState {
  if (!primary) {
    const emptyState: WorkbookSelectionStateInternal = {
      anchor: null,
      primary: null,
      items: [],
      __keySetCache: new Set<string>(),
    };
    return emptyState;
  }

  const nextItems = new Map<string, WorkbookSelectedCell>();
  items.forEach((item) => {
    nextItems.set(buildWorkbookSelectionKey(item), item);
  });
  nextItems.set(buildWorkbookSelectionKey(primary), primary);

  const nextState: WorkbookSelectionStateInternal = {
    anchor,
    primary,
    items: Array.from(nextItems.values()).sort(compareWorkbookSelections),
    __keySetCache: new Set(nextItems.keys()),
  };
  return nextState;
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

function selectionContainsCell(
  selection: WorkbookSelectionState,
  target: WorkbookSelectedCell | null,
): boolean {
  if (!target) return false;
  return getWorkbookSelectionKeySet(selection).has(buildWorkbookSelectionKey(target));
}

function areWorkbookSelectionsEqual(
  left: WorkbookSelectionState | null | undefined,
  right: WorkbookSelectionState | null | undefined,
): boolean {
  if (left === right) return true;

  const leftPrimaryKey = left?.primary ? buildWorkbookSelectionKey(left.primary) : null;
  const rightPrimaryKey = right?.primary ? buildWorkbookSelectionKey(right.primary) : null;
  if (leftPrimaryKey !== rightPrimaryKey) return false;

  const leftAnchorKey = left?.anchor ? buildWorkbookSelectionKey(left.anchor) : null;
  const rightAnchorKey = right?.anchor ? buildWorkbookSelectionKey(right.anchor) : null;
  if (leftAnchorKey !== rightAnchorKey) return false;

  const leftKeySet = getWorkbookSelectionKeySet(left);
  const rightKeySet = getWorkbookSelectionKeySet(right);
  if (leftKeySet.size !== rightKeySet.size) return false;

  for (const key of leftKeySet) {
    if (!rightKeySet.has(key)) return false;
  }
  return true;
}

export function applyWorkbookSelection(
  current: WorkbookSelectionState,
  target: WorkbookSelectedCell | null,
  options: {
    mode?: WorkbookSelectionMode | undefined;
    preserveExistingIfTargetSelected?: boolean | undefined;
  } = {},
): WorkbookSelectionState {
  if (!target) {
    return current.primary ? createWorkbookSelectionState(null) : current;
  }

  if (
    options.preserveExistingIfTargetSelected
    && selectionContainsCell(current, target)
  ) {
    const nextSelection = createWorkbookSelectionState(
      target,
      current.items,
      current.anchor ?? current.primary ?? target,
    );
    return areWorkbookSelectionsEqual(current, nextSelection) ? current : nextSelection;
  }

  const mode = options.mode ?? 'replace';
  const rangeAnchor = current.anchor ?? current.primary;
  if (mode === 'replace' || !rangeAnchor || !canMergeSelections(rangeAnchor, target)) {
    const nextSelection = createWorkbookSelectionState(target);
    return areWorkbookSelectionsEqual(current, nextSelection) ? current : nextSelection;
  }

  if (mode === 'toggle') {
    const targetKey = buildWorkbookSelectionKey(target);
    const remainingItems = current.items.filter(item => buildWorkbookSelectionKey(item) !== targetKey);

    if (remainingItems.length !== current.items.length) {
      if (remainingItems.length === 0) {
        return current.primary ? createWorkbookSelectionState(null) : current;
      }
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
      const nextSelection = createWorkbookSelectionState(nextPrimary, remainingItems, nextAnchor);
      return areWorkbookSelectionsEqual(current, nextSelection) ? current : nextSelection;
    }

    const nextSelection = createWorkbookSelectionState(
      target,
      [...current.items, target],
      rangeAnchor,
    );
    return areWorkbookSelectionsEqual(current, nextSelection) ? current : nextSelection;
  }

  const nextSelection = createWorkbookSelectionState(
    target,
    buildWorkbookRangeSelection(rangeAnchor, target),
    rangeAnchor,
  );
  return areWorkbookSelectionsEqual(current, nextSelection) ? current : nextSelection;
}

export function buildWorkbookSelectionLookup(
  selection: WorkbookSelectionState | null | undefined,
): WorkbookSelectionLookup {
  const internal = getSelectionStateInternal(selection);
  if (internal?.__lookupCache) return internal.__lookupCache;

  const state = selection ?? createWorkbookSelectionState(null);
  const rowKeys = new Set<string>();
  const columnKeys = new Set<string>();
  const cellKeys = new Set<string>();
  const mirroredCellKeys = new Set<string>();
  const cellColumnKeys = new Set<string>();

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
    cellColumnKeys.add(buildAxisKey(item.sheetName, item.colIndex));
    mirroredCellKeys.add(
      buildCellKey(
        item.sheetName,
        item.side === 'base' ? 'mine' : 'base',
        item.rowNumber,
        item.colIndex,
      ),
    );
  });

  const lookup = {
    anchor: state.anchor,
    primary: state.primary,
    rowKeys,
    columnKeys,
    cellKeys,
    mirroredCellKeys,
    cellColumnKeys,
  };
  if (internal) internal.__lookupCache = lookup;
  return lookup;
}

export function getWorkbookSelectionCount(
  selection: WorkbookSelectionState | null | undefined,
): number {
  return selection?.items.length ?? 0;
}
