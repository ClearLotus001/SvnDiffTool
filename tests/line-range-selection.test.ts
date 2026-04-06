import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSelectedLineCount,
  isLineIdxWithinSelection,
  normalizeLineRangeSelection,
  updateLineRangeSelection,
} from '../src/utils/diff/lineRangeSelection';

test('normalizeLineRangeSelection sorts anchor and focus into start/end order', () => {
  assert.deepEqual(
    normalizeLineRangeSelection({
      anchorLineIdx: 12,
      focusLineIdx: 4,
    }),
    {
      anchorLineIdx: 12,
      focusLineIdx: 4,
      startLineIdx: 4,
      endLineIdx: 12,
    },
  );
});

test('updateLineRangeSelection resets the anchor on plain click', () => {
  assert.deepEqual(
    updateLineRangeSelection(
      {
        anchorLineIdx: 10,
        focusLineIdx: 18,
      },
      24,
      false,
    ),
    {
      anchorLineIdx: 24,
      focusLineIdx: 24,
    },
  );
});

test('updateLineRangeSelection preserves the original anchor on shift click', () => {
  assert.deepEqual(
    updateLineRangeSelection(
      {
        anchorLineIdx: 10,
        focusLineIdx: 10,
      },
      24,
      true,
    ),
    {
      anchorLineIdx: 10,
      focusLineIdx: 24,
    },
  );
});

test('updateLineRangeSelection clears a single-line selection when clicking the same line again', () => {
  assert.equal(
    updateLineRangeSelection(
      {
        anchorLineIdx: 24,
        focusLineIdx: 24,
      },
      24,
      false,
    ),
    null,
  );
});

test('getSelectedLineCount counts inclusive line ranges', () => {
  assert.equal(
    getSelectedLineCount({
      anchorLineIdx: 8,
      focusLineIdx: 11,
    }),
    4,
  );
});

test('isLineIdxWithinSelection matches any line inside the normalized range', () => {
  const selection = {
    anchorLineIdx: 20,
    focusLineIdx: 16,
  };

  assert.equal(isLineIdxWithinSelection(selection, 15), false);
  assert.equal(isLineIdxWithinSelection(selection, 16), true);
  assert.equal(isLineIdxWithinSelection(selection, 18), true);
  assert.equal(isLineIdxWithinSelection(selection, 20), true);
  assert.equal(isLineIdxWithinSelection(selection, 21), false);
});
