import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';
import {
  buildWorkbookMaskedRegionModel,
  getWorkbookMaskedRegionId,
} from '../src/utils/workbook/workbookMaskedRegionModel';

function row(rowNumber: number, changedColumn: number): SplitRow {
  const base = createWorkbookRowLine(rowNumber, ['same-a', 'before', 'same-c']);
  const mine = createWorkbookRowLine(rowNumber, [
    'same-a',
    changedColumn === 1 ? 'after' : 'before',
    'same-c',
  ]);
  return {
    lineIdx: rowNumber,
    lineIdxs: [rowNumber],
    left: { type: 'delete', base, mine: null, baseLineNo: rowNumber, mineLineNo: null, baseCharSpans: null, mineCharSpans: null },
    right: { type: 'add', base: null, mine, baseLineNo: null, mineLineNo: rowNumber, baseCharSpans: null, mineCharSpans: null },
  };
}

test('masked region model merges adjacent irrelevant cells and pairs both versions', () => {
  const model = buildWorkbookMaskedRegionModel({
    rows: [row(2, 1), row(3, 1)],
    visibleColumns: [0, 1, 2],
    compareMode: 'strict',
    renderPolicy: { mode: 'differences-only', maskIrrelevantCells: true, diffTypeFilter: 'all' },
    sheetName: 'Sheet1',
    headerRowNumber: 1,
  });

  const leftTop = getWorkbookMaskedRegionId(model, 'base', 2, 0);
  const leftBottom = getWorkbookMaskedRegionId(model, 'mine', 3, 0);
  const rightTop = getWorkbookMaskedRegionId(model, 'base', 2, 2);
  assert.ok(leftTop);
  assert.equal(leftBottom, leftTop);
  assert.ok(rightTop);
  assert.notEqual(rightTop, leftTop);
  assert.equal(getWorkbookMaskedRegionId(model, 'mine', 2, 1), null);
  assert.equal(model.regionCount, 2);
});

test('full render policy does not build masked regions', () => {
  const model = buildWorkbookMaskedRegionModel({
    rows: [row(2, 1)],
    visibleColumns: [0, 1, 2],
    compareMode: 'strict',
    renderPolicy: { mode: 'full', maskIrrelevantCells: false, diffTypeFilter: 'all' },
    sheetName: 'Sheet1',
    headerRowNumber: 1,
  });
  assert.equal(model.regionCount, 0);
});
