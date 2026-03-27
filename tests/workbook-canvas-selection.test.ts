import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveWorkbookCanvasSelectionKind } from '../src/utils/workbook/workbookCanvasSelection';

test('resolveWorkbookCanvasSelectionKind only treats the row header gutter as row selection', () => {
  assert.equal(resolveWorkbookCanvasSelectionKind({
    hitX: 42,
    contentLeft: 43,
    rowNumber: 12,
    headerRowNumber: 1,
  }), 'row');

  assert.equal(resolveWorkbookCanvasSelectionKind({
    hitX: 43,
    contentLeft: 43,
    rowNumber: 12,
    headerRowNumber: 1,
  }), 'cell');
});

test('resolveWorkbookCanvasSelectionKind still promotes header-row hits to column selection', () => {
  assert.equal(resolveWorkbookCanvasSelectionKind({
    hitX: 44,
    contentLeft: 43,
    rowNumber: 1,
    headerRowNumber: 1,
  }), 'column');
});
