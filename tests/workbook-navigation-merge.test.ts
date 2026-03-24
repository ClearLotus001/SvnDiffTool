import test from 'node:test';
import assert from 'node:assert/strict';

import type { WorkbookRowEntry } from '../src/utils/workbookNavigation';
import { buildWorkbookSelectedCell, moveWorkbookSelection } from '../src/utils/workbookNavigation';

const mergeRanges = [
  {
    startRow: 2,
    endRow: 2,
    startCol: 1,
    endCol: 2,
  },
];

function buildEntry(rowNumber: number): WorkbookRowEntry {
  return {
    sheetName: 'Items',
    side: 'base',
    versionLabel: 'BASE',
    rowNumber,
    visibleColumns: [0, 1, 2, 3],
    lineIdxs: [rowNumber],
    cells: [
      { value: `ID-${rowNumber}`, formula: '' },
      { value: `B-${rowNumber}`, formula: '' },
      { value: `C-${rowNumber}`, formula: '' },
      { value: `D-${rowNumber}`, formula: '' },
    ],
  };
}

test('buildWorkbookSelectedCell snaps covered columns to the merge anchor', () => {
  const selected = buildWorkbookSelectedCell(buildEntry(2), 2, mergeRanges);
  assert.equal(selected.colIndex, 1);
  assert.equal(selected.address, 'B2');
});

test('moveWorkbookSelection skips over merged spans when navigating horizontally', () => {
  const entries = [buildEntry(1), buildEntry(2)];
  const selected = buildWorkbookSelectedCell(entries[1]!, 0);
  const movedIntoMerge = moveWorkbookSelection(entries, selected, 'right', { base: mergeRanges });
  assert.ok(movedIntoMerge);
  assert.equal(movedIntoMerge.colIndex, 1);

  const movedPastMerge = moveWorkbookSelection(entries, movedIntoMerge, 'right', { base: mergeRanges });
  assert.ok(movedPastMerge);
  assert.equal(movedPastMerge.colIndex, 3);

  const movedLeft = moveWorkbookSelection(entries, movedPastMerge, 'left', { base: mergeRanges });
  assert.ok(movedLeft);
  assert.equal(movedLeft.colIndex, 1);
});

test('moveWorkbookSelection snaps vertically into merged rows', () => {
  const entries = [buildEntry(1), buildEntry(2), buildEntry(3)];
  const selected = buildWorkbookSelectedCell(entries[0]!, 2);
  const movedDown = moveWorkbookSelection(entries, selected, 'down', { base: mergeRanges });
  assert.ok(movedDown);
  assert.equal(movedDown.rowNumber, 2);
  assert.equal(movedDown.colIndex, 1);
  assert.equal(movedDown.address, 'B2');
});
