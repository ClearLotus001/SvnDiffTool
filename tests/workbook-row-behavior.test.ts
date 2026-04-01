import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import {
  getWorkbookStackedBandDisplayRowNumber,
  getWorkbookColumnsRenderMode,
  getWorkbookCompactRenderMode,
  getWorkbookStackedRenderMode,
  getWorkbookStackedVisibleBands,
  shouldRenderSingleBaseStackedRow,
  shouldRenderSingleEqualStackedRow,
  shouldRenderSingleMineStackedRow,
} from '../src/utils/workbook/workbookRowBehavior';
import { ROW_H } from '../src/hooks/virtualization/useVirtual';

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

test('getWorkbookCompactRenderMode reuses the compact render rules', () => {
  const equalRow: SplitRow = {
    left: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 8,
    lineIdxs: [8],
  };

  const modifiedRow: SplitRow = {
    left: {
      type: 'delete',
      base: '@@row\t9\t10001\tA',
      mine: null,
      baseLineNo: 9,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'add',
      base: null,
      mine: '@@row\t9\t10001\tB',
      baseLineNo: null,
      mineLineNo: 9,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 9,
    lineIdxs: [9, 10],
  };

  assert.equal(getWorkbookCompactRenderMode(equalRow), 'single-equal');
  assert.equal(getWorkbookCompactRenderMode(modifiedRow), 'double');
});

test('getWorkbookColumnsRenderMode always keeps workbook rows split by side', () => {
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
    lineIdx: 10,
    lineIdxs: [10],
  };

  assert.equal(getWorkbookColumnsRenderMode(pureDeleteRow), 'double');
});

test('getWorkbookColumnsRenderMode keeps equal workbook rows split for column compare layout', () => {
  const equalRow: SplitRow = {
    left: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 8,
    lineIdxs: [8],
  };

  assert.equal(getWorkbookColumnsRenderMode(equalRow), 'double');
});

test('getWorkbookStackedRenderMode keeps pure delete rows expanded so the blank counterpart stays visible', () => {
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
    lineIdx: 10,
    lineIdxs: [10],
  };

  const equalRow: SplitRow = {
    left: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal',
      base: '@@row\t8\t10001\tA',
      mine: '@@row\t8\t10001\tA',
      baseLineNo: 8,
      mineLineNo: 8,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 8,
    lineIdxs: [8],
  };

  assert.equal(getWorkbookStackedRenderMode(pureDeleteRow), 'double');
  assert.equal(getWorkbookStackedRenderMode(equalRow), 'single-equal');
});

test('getWorkbookStackedRenderMode keeps pure add rows expanded so the blank counterpart stays visible', () => {
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
    lineIdx: 10,
    lineIdxs: [10],
  };

  assert.equal(getWorkbookStackedRenderMode(pureAddRow), 'double');
});

test('getWorkbookStackedVisibleBands keeps both sides visible for expanded delete/add rows', () => {
  assert.deepEqual(getWorkbookStackedVisibleBands(true, false, ROW_H * 2), {
    base: true,
    mine: true,
  });
  assert.deepEqual(getWorkbookStackedVisibleBands(false, true, ROW_H * 2), {
    base: true,
    mine: true,
  });
});

test('getWorkbookStackedVisibleBands compresses only equal rows to a single visible band', () => {
  assert.deepEqual(getWorkbookStackedVisibleBands(true, true, ROW_H), {
    base: true,
    mine: false,
  });
  assert.deepEqual(getWorkbookStackedVisibleBands(false, true, ROW_H), {
    base: false,
    mine: true,
  });
});

test('getWorkbookStackedBandDisplayRowNumber falls back to the opposite side for placeholder bands', () => {
  assert.equal(getWorkbookStackedBandDisplayRowNumber('mine', 71289, null), 71289);
  assert.equal(getWorkbookStackedBandDisplayRowNumber('base', null, 71289), 71289);
  assert.equal(getWorkbookStackedBandDisplayRowNumber('base', 71289, 71289), 71289);
});
