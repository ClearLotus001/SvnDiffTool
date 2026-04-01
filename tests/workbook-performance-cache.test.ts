import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookSplitRowCompareState } from '../src/utils/workbook/workbookCompare';
import type { SplitRow } from '../src/types/view';
import type { WorkbookRowDelta } from '../src/types/workbook';

function buildPrecomputedRowDelta(columnCount = 8): WorkbookRowDelta {
  const cellDeltas = new Map<number, WorkbookRowDelta['cellDeltas'] extends Map<number, infer T> ? T : never>();

  for (let column = 0; column < columnCount; column += 1) {
    cellDeltas.set(column, {
      column,
      baseCell: { value: `base-${column}`, formula: '' },
      mineCell: { value: column % 2 === 0 ? `base-${column}` : `mine-${column}`, formula: '' },
      changed: column % 2 === 1,
      masked: column % 2 === 0,
      strictOnly: false,
      kind: column % 2 === 1 ? 'modify' : 'equal',
      hasBaseContent: true,
      hasMineContent: true,
      hasContent: true,
    });
  }

  const deltas = [...cellDeltas.values()];
  return {
    cellDeltas,
    changedColumns: deltas.filter(delta => delta.changed).map(delta => delta.column),
    strictOnlyColumns: [],
    changedCount: deltas.filter(delta => delta.changed).length,
    hasChanges: deltas.some(delta => delta.changed),
    tone: 'mixed',
  };
}

test('buildWorkbookSplitRowCompareState reuses cached subset deltas for repeated visible-column requests', () => {
  const row: SplitRow = {
    left: null,
    right: null,
    lineIdx: 10,
    lineIdxs: [10],
    workbookRowDelta: buildPrecomputedRowDelta(),
  };
  const visibleColumns = [1, 3, 5, 7];

  const first = buildWorkbookSplitRowCompareState(row, visibleColumns, 'strict');
  const second = buildWorkbookSplitRowCompareState(row, visibleColumns, 'strict');

  assert.equal(first, second);
  assert.deepEqual(first.changedColumns, visibleColumns);
  assert.equal(first.changedCount, visibleColumns.length);
});

test('buildWorkbookSplitRowCompareState keeps different visible-column subsets isolated', () => {
  const row: SplitRow = {
    left: null,
    right: null,
    lineIdx: 11,
    lineIdxs: [11],
    workbookRowDelta: buildPrecomputedRowDelta(),
  };

  const oddColumns = buildWorkbookSplitRowCompareState(row, [1, 3, 5, 7], 'strict');
  const mixedColumns = buildWorkbookSplitRowCompareState(row, [0, 1, 2], 'strict');

  assert.notEqual(oddColumns, mixedColumns);
  assert.deepEqual(oddColumns.changedColumns, [1, 3, 5, 7]);
  assert.deepEqual(mixedColumns.changedColumns, [1]);
  assert.equal(mixedColumns.changedCount, 1);
});
