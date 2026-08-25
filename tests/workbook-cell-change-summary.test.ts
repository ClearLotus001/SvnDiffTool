import assert from 'node:assert/strict';
import test from 'node:test';

import type { SplitRow, WorkbookCellDelta, WorkbookRowDelta } from '../src/types';
import { summarizeWorkbookCellChanges } from '../src/utils/workbook/workbookCellChangeSummary';
import type { WorkbookSectionRowIndex } from '../src/utils/workbook/workbookSheetIndex';

function cellDelta(
  column: number,
  kind: NonNullable<WorkbookCellDelta['kind']>,
  strictOnly = false,
): WorkbookCellDelta {
  return {
    column,
    baseCell: { value: kind === 'add' ? '' : `base-${column}`, formula: '' },
    mineCell: { value: kind === 'delete' ? '' : `mine-${column}`, formula: '' },
    changed: true,
    masked: false,
    strictOnly,
    kind,
    hasBaseContent: kind !== 'add',
    hasMineContent: kind !== 'delete',
    hasContent: true,
  };
}

test('workbook cell summary follows the same semantic kinds rendered by table cells', () => {
  const deltas = [
    cellDelta(0, 'add'),
    cellDelta(1, 'delete'),
    cellDelta(2, 'modify'),
    cellDelta(3, 'modify'),
    cellDelta(4, 'modify', true),
  ];
  const rowDelta: WorkbookRowDelta = {
    cellDeltas: new Map(deltas.map((delta) => [delta.column, delta])),
    changedColumns: deltas.map((delta) => delta.column),
    strictOnlyColumns: [4],
    changedCount: deltas.length,
    hasChanges: true,
    tone: 'mixed',
    miniMapTone: 'mixed',
    miniMapPaintTones: ['add', 'delete', 'modify', 'strict-only'],
  };
  const row: SplitRow = {
    left: null,
    right: null,
    lineIdx: 0,
    lineIdxs: [0],
    workbookRowDelta: rowDelta,
  };
  const sectionRowIndex: WorkbookSectionRowIndex = {
    get: (sheetName) => (sheetName === 'Thing' ? { rows: [row] } : undefined),
  };

  assert.deepEqual(
    summarizeWorkbookCellChanges('Thing', sectionRowIndex, 'strict'),
    { added: 1, removed: 1, modified: 2, strictOnly: 1 },
  );
});
