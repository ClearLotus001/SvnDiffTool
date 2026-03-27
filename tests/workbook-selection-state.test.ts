import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWorkbookSelection,
  createWorkbookSelectionState,
} from '../src/utils/workbook/workbookSelectionState';

function buildCell(rowNumber: number, side: 'base' | 'mine' = 'base') {
  return {
    kind: 'cell' as const,
    sheetName: 'Items',
    side,
    versionLabel: side === 'base' ? 'BASE' : 'LOCAL',
    rowNumber,
    colIndex: 1,
    colLabel: 'B',
    address: `B${rowNumber}`,
    value: `${rowNumber}`,
    formula: '',
  };
}

test('shift-style range selection expands compatible workbook cells into a rectangle', () => {
  const first = buildCell(2);
  const second = {
    ...buildCell(4),
    colIndex: 3,
    colLabel: 'D',
    address: 'D4',
  };

  const afterFirst = applyWorkbookSelection(createWorkbookSelectionState(null), first);
  const afterSecond = applyWorkbookSelection(afterFirst, second, { mode: 'range' });

  assert.equal(afterSecond.anchor?.rowNumber, 2);
  assert.equal(afterSecond.primary?.rowNumber, 4);
  assert.deepEqual(afterSecond.items.map(item => item.address), [
    'B2', 'C2', 'D2',
    'B3', 'C3', 'D3',
    'B4', 'C4', 'D4',
  ]);
});

test('shift-style row selection expands into the full row interval', () => {
  const baseRow = {
    ...buildCell(8, 'base'),
    kind: 'row' as const,
    address: '8',
  };
  const mineRow = {
    ...baseRow,
    side: 'mine' as const,
    versionLabel: 'LOCAL',
    rowNumber: 11,
    address: '11',
  };

  const initial = applyWorkbookSelection(createWorkbookSelectionState(null), baseRow);
  const next = applyWorkbookSelection(initial, mineRow, { mode: 'range' });

  assert.equal(next.anchor?.rowNumber, 8);
  assert.equal(next.primary?.side, 'mine');
  assert.deepEqual(next.items.map(item => item.rowNumber), [8, 9, 10, 11]);
});

test('shift-style column selection expands into the full column interval', () => {
  const first = {
    ...buildCell(5),
    kind: 'column' as const,
    colIndex: 1,
    colLabel: 'B',
    address: 'B',
  };
  const second = {
    ...first,
    colIndex: 4,
    colLabel: 'E',
    address: 'E',
  };

  const initial = applyWorkbookSelection(createWorkbookSelectionState(null), first);
  const next = applyWorkbookSelection(initial, second, { mode: 'range' });

  assert.equal(next.anchor?.colIndex, 1);
  assert.deepEqual(next.items.map(item => item.colLabel), ['B', 'C', 'D', 'E']);
});

test('ctrl-style toggle selection appends a disjoint compatible cell', () => {
  const first = buildCell(2);
  const second = buildCell(5);

  const initial = applyWorkbookSelection(createWorkbookSelectionState(null), first);
  const next = applyWorkbookSelection(initial, second, { mode: 'toggle' });

  assert.equal(next.anchor?.rowNumber, 2);
  assert.equal(next.primary?.rowNumber, 5);
  assert.deepEqual(next.items.map(item => item.address), ['B2', 'B5']);
});

test('ctrl-style toggle selection removes an already selected item', () => {
  const first = buildCell(2);
  const second = buildCell(5);

  const initial = createWorkbookSelectionState(second, [first, second], first);
  const next = applyWorkbookSelection(initial, second, { mode: 'toggle' });

  assert.equal(next.anchor?.rowNumber, 2);
  assert.equal(next.primary?.rowNumber, 2);
  assert.deepEqual(next.items.map(item => item.address), ['B2']);
});

test('incompatible range selection resets to a single compatible item', () => {
  const row = {
    ...buildCell(4),
    kind: 'row' as const,
    address: '4',
  };
  const cell = buildCell(6);

  const initial = applyWorkbookSelection(createWorkbookSelectionState(null), row);
  const next = applyWorkbookSelection(initial, cell, { mode: 'range' });

  assert.equal(next.items.length, 1);
  assert.equal(next.primary?.kind, 'cell');
  assert.equal(next.primary?.rowNumber, 6);
});
