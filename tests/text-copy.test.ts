import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDisplayCopyText,
  buildDisplayRangeCopyText,
  buildDiffCopyText,
  buildDiffRangeCopyText,
  buildHunkCopyText,
  buildVersionCopyText,
  buildVersionRangeCopyText,
  hasVersionContentInRange,
} from '../src/utils/diff/textCopy';
import type { DiffLine } from '../src/types';

const DIFF_LINES: DiffLine[] = [
  {
    type: 'equal',
    base: 'const a = 1;',
    mine: 'const a = 1;',
    baseLineNo: 1,
    mineLineNo: 1,
    baseCharSpans: null,
    mineCharSpans: null,
  },
  {
    type: 'delete',
    base: 'const oldValue = 2;',
    mine: null,
    baseLineNo: 2,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  },
  {
    type: 'add',
    base: null,
    mine: 'const newValue = 3;',
    baseLineNo: null,
    mineLineNo: 2,
    baseCharSpans: null,
    mineCharSpans: null,
  },
];

test('buildDiffCopyText formats the full diff in unified text form', () => {
  assert.equal(
    buildDiffCopyText(DIFF_LINES),
    [
      ' const a = 1;',
      '-const oldValue = 2;',
      '+const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildDisplayCopyText formats the displayed text without diff prefixes', () => {
  assert.equal(
    buildDisplayCopyText(DIFF_LINES),
    [
      'const a = 1;',
      'const oldValue = 2;',
      'const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildDiffRangeCopyText clamps and normalizes the requested line range', () => {
  assert.equal(
    buildDiffRangeCopyText(DIFF_LINES, 2, 1),
    [
      '-const oldValue = 2;',
      '+const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildDisplayRangeCopyText copies the visible text range without diff prefixes', () => {
  assert.equal(
    buildDisplayRangeCopyText(DIFF_LINES, 1, 2),
    [
      'const oldValue = 2;',
      'const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildHunkCopyText returns an empty string when the hunk is missing', () => {
  assert.equal(buildHunkCopyText(DIFF_LINES, null), '');
});

test('buildHunkCopyText copies only the requested hunk range', () => {
  assert.equal(
    buildHunkCopyText(DIFF_LINES, { startIdx: 1, endIdx: 2 }),
    [
      '-const oldValue = 2;',
      '+const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildVersionCopyText copies only the requested version lines', () => {
  assert.equal(
    buildVersionCopyText(DIFF_LINES, 'base'),
    [
      'const a = 1;',
      'const oldValue = 2;',
    ].join('\r\n'),
  );
  assert.equal(
    buildVersionCopyText(DIFF_LINES, 'mine'),
    [
      'const a = 1;',
      'const newValue = 3;',
    ].join('\r\n'),
  );
});

test('buildVersionRangeCopyText copies the selected range for a given version', () => {
  assert.equal(
    buildVersionRangeCopyText(DIFF_LINES, 'mine', 1, 2),
    'const newValue = 3;',
  );
});

test('hasVersionContentInRange detects whether a version exists in the selected range', () => {
  assert.equal(hasVersionContentInRange(DIFF_LINES, 'base', 2, 2), false);
  assert.equal(hasVersionContentInRange(DIFF_LINES, 'mine', 2, 2), true);
});
