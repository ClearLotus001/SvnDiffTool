import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine } from '../src/types';
import {
  buildSelectAllLogicalTextSelection,
  buildLogicalTextSelectionCopyText,
  doesLogicalTextSelectionIntersectLineRange,
  expandLogicalTextSelectionToWord,
  getLogicalTextSelectionRangeForLine,
  getLogicalTextSelectionLineRange,
  moveLogicalTextSelectionPoint,
  resolveLogicalTextLineContentForSide,
  type LogicalTextSelection,
} from '../src/utils/diff/logicalTextSelection';

const DIFF_LINES: DiffLine[] = [
  {
    type: 'equal',
    base: 'alpha',
    mine: 'alpha',
    baseLineNo: 1,
    mineLineNo: 1,
    baseCharSpans: null,
    mineCharSpans: null,
  },
  {
    type: 'delete',
    base: 'bravo',
    mine: null,
    baseLineNo: 2,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  },
  {
    type: 'add',
    base: null,
    mine: 'charlie',
    baseLineNo: null,
    mineLineNo: 2,
    baseCharSpans: null,
    mineCharSpans: null,
  },
  {
    type: 'equal',
    base: 'delta',
    mine: 'delta',
    baseLineNo: 3,
    mineLineNo: 3,
    baseCharSpans: null,
    mineCharSpans: null,
  },
];

const DIFF_LINES_WITH_SPACES: DiffLine[] = [
  {
    type: 'equal',
    base: 'alpha beta gamma',
    mine: 'alpha beta gamma',
    baseLineNo: 1,
    mineLineNo: 1,
    baseCharSpans: null,
    mineCharSpans: null,
  },
];

test('getLogicalTextSelectionRangeForLine selects only one side when the anchor/focus stay in the same split lane', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'base', column: 1 },
    focus: { lineIdx: 3, side: 'base', column: 2 },
  };

  assert.deepEqual(getLogicalTextSelectionRangeForLine(selection, 0, 'base', 5), { start: 1, end: 5 });
  assert.deepEqual(getLogicalTextSelectionRangeForLine(selection, 1, 'base', 5), { start: 0, end: 5 });
  assert.equal(getLogicalTextSelectionRangeForLine(selection, 1, 'mine', 5), null);
  assert.deepEqual(getLogicalTextSelectionRangeForLine(selection, 3, 'base', 5), { start: 0, end: 2 });
});

test('buildLogicalTextSelectionCopyText copies partial endpoint content for display mode', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'both', column: 2 },
    focus: { lineIdx: 3, side: 'both', column: 3 },
  };

  assert.equal(
    buildLogicalTextSelectionCopyText(DIFF_LINES, selection, 'display'),
    [
      'pha',
      'bravo',
      'charlie',
      'del',
    ].join('\r\n'),
  );
});

test('buildLogicalTextSelectionCopyText respects auto mode and keeps base-only selection on the base lane', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'base', column: 1 },
    focus: { lineIdx: 3, side: 'base', column: 4 },
  };

  assert.equal(
    buildLogicalTextSelectionCopyText(DIFF_LINES, selection, 'auto'),
    [
      'lpha',
      'bravo',
      'delt',
    ].join('\r\n'),
  );
});

test('expandLogicalTextSelectionToWord expands identifier-like words and punctuation runs', () => {
  assert.deepEqual(expandLogicalTextSelectionToWord('print(value)', 2), { start: 0, end: 5 });
  assert.deepEqual(expandLogicalTextSelectionToWord('print(value)', 5), { start: 5, end: 6 });
  assert.deepEqual(expandLogicalTextSelectionToWord('print(value)', 7), { start: 6, end: 11 });
});

test('expanded word selections can be extended by one logical character', () => {
  const wordRange = expandLogicalTextSelectionToWord('alpha beta gamma', 7);
  assert.deepEqual(wordRange, { start: 6, end: 10 });

  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'both', column: wordRange.start },
    focus: { lineIdx: 0, side: 'both', column: wordRange.end },
  };
  const nextFocus = moveLogicalTextSelectionPoint(DIFF_LINES_WITH_SPACES, selection.focus, 'right');

  assert.deepEqual(nextFocus, { lineIdx: 0, side: 'both', column: 11 });
  assert.equal(
    buildLogicalTextSelectionCopyText(
      DIFF_LINES_WITH_SPACES,
      { anchor: selection.anchor, focus: nextFocus! },
      'display',
    ),
    'beta ',
  );
});

test('resolveLogicalTextLineContentForSide returns the visible lane content for each side', () => {
  assert.equal(resolveLogicalTextLineContentForSide(DIFF_LINES[1]!, 'base'), 'bravo');
  assert.equal(resolveLogicalTextLineContentForSide(DIFF_LINES[1]!, 'mine'), null);
  assert.equal(resolveLogicalTextLineContentForSide(DIFF_LINES[2]!, 'mine'), 'charlie');
  assert.equal(resolveLogicalTextLineContentForSide(DIFF_LINES[2]!, 'both'), 'charlie');
});

test('moveLogicalTextSelectionPoint keeps split-side navigation on the same visible lane', () => {
  assert.deepEqual(
    moveLogicalTextSelectionPoint(DIFF_LINES, { lineIdx: 0, side: 'base', column: 5 }, 'right'),
    { lineIdx: 1, side: 'base', column: 0 },
  );
  assert.deepEqual(
    moveLogicalTextSelectionPoint(DIFF_LINES, { lineIdx: 1, side: 'base', column: 0 }, 'down'),
    { lineIdx: 3, side: 'base', column: 0 },
  );
  assert.deepEqual(
    moveLogicalTextSelectionPoint(DIFF_LINES, { lineIdx: 2, side: 'mine', column: 7 }, 'left'),
    { lineIdx: 2, side: 'mine', column: 6 },
  );
});

test('buildLogicalTextSelectionCopyText collapses mixed-side drags onto the display stream for deterministic split copy', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'base', column: 1 },
    focus: { lineIdx: 2, side: 'mine', column: 4 },
  };

  assert.equal(
    buildLogicalTextSelectionCopyText(DIFF_LINES, selection, 'auto'),
    [
      'lpha',
      'bravo',
      'char',
    ].join('\r\n'),
  );
});

test('buildSelectAllLogicalTextSelection selects the full visible display stream for auto mode', () => {
  assert.deepEqual(
    buildSelectAllLogicalTextSelection(DIFF_LINES, 'auto'),
    {
      anchor: { lineIdx: 0, side: 'both', column: 0 },
      focus: { lineIdx: 3, side: 'both', column: 5 },
    },
  );
});

test('buildSelectAllLogicalTextSelection stays on the base lane for base mode', () => {
  assert.deepEqual(
    buildSelectAllLogicalTextSelection(DIFF_LINES, 'base'),
    {
      anchor: { lineIdx: 0, side: 'base', column: 0 },
      focus: { lineIdx: 3, side: 'base', column: 5 },
    },
  );
});

test('doesLogicalTextSelectionIntersectLineRange detects overlap across visible line intervals', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 0, side: 'both', column: 2 },
    focus: { lineIdx: 3, side: 'both', column: 3 },
  };

  assert.equal(doesLogicalTextSelectionIntersectLineRange(selection, 1, 2), true);
  assert.equal(doesLogicalTextSelectionIntersectLineRange(selection, 3, 5), true);
  assert.equal(doesLogicalTextSelectionIntersectLineRange(selection, 4, 8), false);
});

test('getLogicalTextSelectionLineRange normalizes reverse selections and counts covered lines', () => {
  const selection: LogicalTextSelection = {
    anchor: { lineIdx: 4, side: 'both', column: 3 },
    focus: { lineIdx: 1, side: 'both', column: 2 },
  };

  assert.deepEqual(getLogicalTextSelectionLineRange(selection), {
    startLineIdx: 1,
    endLineIdx: 4,
    count: 4,
  });
});
