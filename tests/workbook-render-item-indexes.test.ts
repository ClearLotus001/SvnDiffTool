import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine, SplitRow } from '../src/types';
import {
  buildWorkbookRenderItemIndexes,
  findNearestWorkbookVisibleItemIndex,
} from '../src/utils/workbook/workbookRenderItemIndexes';

type WorkbookRenderProbeItem =
  | { kind: 'row'; row: SplitRow }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[] };

function createWorkbookDiffLine(rowNumber: number, side: 'base' | 'mine'): DiffLine {
  const displayLine = `@@row\t${rowNumber}\tvalue-${side}-${rowNumber}`;
  return {
    type: 'equal',
    base: side === 'base' ? displayLine : null,
    mine: side === 'mine' ? displayLine : null,
    baseLineNo: null,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function createSplitRow(
  lineIdxs: number[],
  {
    baseRowNumber,
    mineRowNumber,
  }: {
    baseRowNumber: number | null;
    mineRowNumber: number | null;
  },
): SplitRow {
  return {
    left: baseRowNumber != null ? createWorkbookDiffLine(baseRowNumber, 'base') : null,
    right: mineRowNumber != null ? createWorkbookDiffLine(mineRowNumber, 'mine') : null,
    lineIdx: lineIdxs[0] ?? -1,
    lineIdxs,
  };
}

function buildIndexes(items: WorkbookRenderProbeItem[], cacheKey = 'probe:v1') {
  return buildWorkbookRenderItemIndexes(items, {
    cacheKey,
    getRow: (item) => (item.kind === 'row' ? item.row : null),
    getHiddenRows: (item) => (item.kind === 'hidden-rows' ? item.rows : null),
    getHiddenRowNumbers: (item) => (item.kind === 'hidden-rows' ? item.rowNumbers : null),
  });
}

test('buildWorkbookRenderItemIndexes reuses cached indexes for the same items and cache key', () => {
  const items: WorkbookRenderProbeItem[] = [
    { kind: 'row', row: createSplitRow([10], { baseRowNumber: 1, mineRowNumber: 1 }) },
    {
      kind: 'hidden-rows',
      rows: [createSplitRow([11], { baseRowNumber: 2, mineRowNumber: 2 })],
      rowNumbers: [2],
    },
  ];

  const first = buildIndexes(items, 'cache-key:a');
  const second = buildIndexes(items, 'cache-key:a');
  const differentKey = buildIndexes(items, 'cache-key:b');

  assert.equal(first, second);
  assert.notEqual(first, differentKey);
});

test('buildWorkbookRenderItemIndexes collects row, hidden-row and nearest-line indexes from raw render items', () => {
  const items: WorkbookRenderProbeItem[] = [
    { kind: 'row', row: createSplitRow([1, 2], { baseRowNumber: 10, mineRowNumber: 20 }) },
    {
      kind: 'hidden-rows',
      rows: [
        createSplitRow([3], { baseRowNumber: 11, mineRowNumber: 21 }),
        createSplitRow([4], { baseRowNumber: 12, mineRowNumber: 22 }),
      ],
      rowNumbers: [11, 12],
    },
    { kind: 'row', row: createSplitRow([5, 6], { baseRowNumber: 13, mineRowNumber: 23 }) },
  ];

  const indexes = buildIndexes(items);

  assert.equal(indexes.rowItemIndexBySide.base.get(10), 0);
  assert.equal(indexes.rowItemIndexBySide.mine.get(23), 2);
  assert.equal(indexes.visibleRowItemIndexByLineIdx.get(2), 0);
  assert.equal(indexes.visibleRowItemIndexByLineIdx.get(5), 2);
  assert.deepEqual(indexes.hiddenRowNumbersByLineIdx.get(3), [11, 12]);
  assert.deepEqual(indexes.hiddenRowNumbersByLineIdx.get(4), [11, 12]);
  assert.equal(findNearestWorkbookVisibleItemIndex(indexes, 0), 0);
  assert.equal(findNearestWorkbookVisibleItemIndex(indexes, 4), 2);
  assert.equal(findNearestWorkbookVisibleItemIndex(indexes, 7), -1);
});

test('findNearestWorkbookVisibleItemIndex preserves first-match semantics when row line ranges are unordered', () => {
  const items: WorkbookRenderProbeItem[] = [
    { kind: 'row', row: createSplitRow([10], { baseRowNumber: 30, mineRowNumber: 40 }) },
    { kind: 'row', row: createSplitRow([5], { baseRowNumber: 31, mineRowNumber: 41 }) },
  ];

  const indexes = buildIndexes(items, 'unordered:v1');

  assert.equal(indexes.hasOrderedLineRanges, false);
  assert.equal(findNearestWorkbookVisibleItemIndex(indexes, 6), 0);
  assert.equal(findNearestWorkbookVisibleItemIndex(indexes, 11), -1);
});
