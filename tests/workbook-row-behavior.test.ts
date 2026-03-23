import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import {
  shouldRenderSingleBaseStackedRow,
  shouldRenderSingleEqualStackedRow,
  shouldRenderSingleMineStackedRow,
} from '../src/utils/workbookRowBehavior';

test('shouldRenderSingleMineStackedRow only matches pure added rows', () => {
  const pureAddRow: SplitRow = {
    left: null,
    right: {
      type: 'add',
      base: null,
      mine: '@@row\t10\t10001\tA',
      baseLineNo: null,
      mineLineNo: 10,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 1,
    lineIdxs: [1],
  };

  const modifiedRow: SplitRow = {
    left: {
      type: 'delete',
      base: '@@row\t10\t10001\tA',
      mine: null,
      baseLineNo: 10,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'add',
      base: null,
      mine: '@@row\t10\t10001\tB',
      baseLineNo: null,
      mineLineNo: 10,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 2,
    lineIdxs: [2, 3],
  };

  assert.equal(shouldRenderSingleMineStackedRow(pureAddRow), true);
  assert.equal(shouldRenderSingleMineStackedRow(modifiedRow), false);
});

test('shouldRenderSingleBaseStackedRow only matches pure deleted rows', () => {
  const pureDeleteRow: SplitRow = {
    left: {
      type: 'delete',
      base: '@@row\t10\t10001\tA',
      mine: null,
      baseLineNo: 10,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: null,
    lineIdx: 1,
    lineIdxs: [1],
  };

  assert.equal(shouldRenderSingleBaseStackedRow(pureDeleteRow), true);
});

test('shouldRenderSingleEqualStackedRow only matches identical equal workbook rows', () => {
  const equalHeaderRow: SplitRow = {
    left: {
      type: 'equal',
      base: '@@row\t1\tID\t名称',
      mine: '@@row\t1\tID\t名称',
      baseLineNo: 1,
      mineLineNo: 1,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal',
      base: '@@row\t1\tID\t名称',
      mine: '@@row\t1\tID\t名称',
      baseLineNo: 1,
      mineLineNo: 1,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 1,
    lineIdxs: [1],
  };

  const diffHeaderRow: SplitRow = {
    ...equalHeaderRow,
    right: {
      ...equalHeaderRow.right!,
      mine: '@@row\t1\tID\t名称2',
    },
  };

  assert.equal(shouldRenderSingleEqualStackedRow(equalHeaderRow), true);
  assert.equal(shouldRenderSingleEqualStackedRow(diffHeaderRow), false);
});
