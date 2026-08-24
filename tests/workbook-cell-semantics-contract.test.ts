import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasWorkbookCellContent as hasRendererCellContent,
  isWorkbookStrictOnlyDifference as isRendererStrictOnlyDifference,
  workbookCellsDiffer as rendererCellsDiffer,
} from '../src/utils/workbook/workbookCellContract';
import {
  hasWorkbookCellContent,
  isWorkbookStrictOnlyDifference,
  resolveWorkbookCellDeltaKind,
  resolveWorkbookMiniMapDescriptorFromDeltas,
  resolveWorkbookRowDeltaTone,
  workbookCellsDiffer,
} from '../shared/workbookCellSemantics';

const blank = { value: '', formula: '' };
const whitespace = { value: ' ', formula: '' };
const value = { value: 'A', formula: '' };
const formula = { value: '', formula: 'SUM(A1:A2)' };

test('shared workbook cell semantics preserve strict/content behavior across renderer adapter', () => {
  for (const mode of ['strict', 'content'] as const) {
    for (const cell of [blank, whitespace, value, formula]) {
      assert.equal(hasRendererCellContent(cell, mode), hasWorkbookCellContent(cell, mode));
    }
    for (const [left, right] of [[blank, whitespace], [blank, value], [value, formula]] as const) {
      assert.equal(rendererCellsDiffer(left, right, mode), workbookCellsDiffer(left, right, mode));
    }
  }

  assert.equal(isRendererStrictOnlyDifference(blank, whitespace), true);
  assert.equal(isWorkbookStrictOnlyDifference(blank, whitespace), true);
  assert.equal(resolveWorkbookCellDeltaKind(blank, value, 'strict'), 'add');
  assert.equal(resolveWorkbookCellDeltaKind(value, blank, 'strict'), 'delete');
  assert.equal(resolveWorkbookCellDeltaKind(value, formula, 'strict'), 'modify');
});

test('shared workbook row and minimap semantics keep mixed and strict-only tones', () => {
  const deltas = [
    { changed: true, kind: 'delete' as const, strictOnly: false },
    { changed: true, kind: 'add' as const, strictOnly: false },
    { changed: true, kind: 'modify' as const, strictOnly: true },
  ];

  assert.equal(resolveWorkbookRowDeltaTone(deltas), 'mixed');
  assert.deepEqual(resolveWorkbookMiniMapDescriptorFromDeltas(deltas), {
    tone: 'mixed',
    tones: ['delete', 'add', 'strict-only'],
  });
});
