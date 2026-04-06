import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkbookSparseGapItem,
  injectWorkbookSparseGapItems,
  type WorkbookSparseRowRange,
} from '../src/utils/workbook/workbookSparseGaps';

type MockItem =
  | { kind: 'row'; start: number; end: number }
  | { kind: 'collapse'; start: number; end: number };

function resolveMockRange(item: MockItem): WorkbookSparseRowRange {
  return {
    rowNumberStart: item.start,
    rowNumberEnd: item.end,
  };
}

test('createWorkbookSparseGapItem returns null for invalid ranges', () => {
  assert.equal(createWorkbookSparseGapItem(10, 9), null);
});

test('injectWorkbookSparseGapItems inserts leading and intermediate sparse gaps', () => {
  const items: MockItem[] = [
    { kind: 'row', start: 58043, end: 58043 },
    { kind: 'row', start: 58046, end: 58046 },
  ];

  const result = injectWorkbookSparseGapItems(items, {
    firstExpectedRowNumber: 2,
    resolveRowRange: resolveMockRange,
  });

  assert.deepEqual(result, [
    { kind: 'sparse-gap', rowNumberStart: 2, rowNumberEnd: 58042, count: 58041 },
    { kind: 'row', start: 58043, end: 58043 },
    { kind: 'sparse-gap', rowNumberStart: 58044, rowNumberEnd: 58045, count: 2 },
    { kind: 'row', start: 58046, end: 58046 },
  ]);
});

test('injectWorkbookSparseGapItems respects collapsed row spans when inserting gaps', () => {
  const items: MockItem[] = [
    { kind: 'row', start: 1, end: 1 },
    { kind: 'collapse', start: 2, end: 10 },
    { kind: 'row', start: 58043, end: 58043 },
  ];

  const result = injectWorkbookSparseGapItems(items, {
    firstExpectedRowNumber: 1,
    resolveRowRange: resolveMockRange,
  });

  assert.deepEqual(result, [
    { kind: 'row', start: 1, end: 1 },
    { kind: 'collapse', start: 2, end: 10 },
    { kind: 'sparse-gap', rowNumberStart: 11, rowNumberEnd: 58042, count: 58032 },
    { kind: 'row', start: 58043, end: 58043 },
  ]);
});
