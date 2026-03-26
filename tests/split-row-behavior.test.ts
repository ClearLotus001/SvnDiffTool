import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import { getTextVerticalRenderMode } from '../src/utils/splitRowBehavior';

test('getTextVerticalRenderMode collapses pure delete rows into a single line', () => {
  const row: SplitRow = {
    left: {
      type: 'delete',
      base: 'removed',
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

  assert.equal(getTextVerticalRenderMode(row), 'single-left');
});

test('getTextVerticalRenderMode collapses pure add rows into a single line', () => {
  const row: SplitRow = {
    left: null,
    right: {
      type: 'add',
      base: null,
      mine: 'added',
      baseLineNo: null,
      mineLineNo: 12,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 2,
    lineIdxs: [2],
  };

  assert.equal(getTextVerticalRenderMode(row), 'single-right');
});

test('getTextVerticalRenderMode collapses identical equal rows into a single line', () => {
  const line = {
    type: 'equal' as const,
    base: 'same line',
    mine: 'same line',
    baseLineNo: 3,
    mineLineNo: 3,
    baseCharSpans: null,
    mineCharSpans: null,
  };
  const row: SplitRow = {
    left: line,
    right: line,
    lineIdx: 3,
    lineIdxs: [3],
  };

  assert.equal(getTextVerticalRenderMode(row), 'single-equal');
});

test('getTextVerticalRenderMode keeps modified pairs as double rows', () => {
  const row: SplitRow = {
    left: {
      type: 'delete',
      base: 'before',
      mine: null,
      baseLineNo: 4,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'add',
      base: null,
      mine: 'after',
      baseLineNo: null,
      mineLineNo: 4,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 4,
    lineIdxs: [4, 5],
  };

  assert.equal(getTextVerticalRenderMode(row), 'double');
});
