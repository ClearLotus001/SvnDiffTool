import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTextSearchDecorations } from '../src/utils/diff/textSearchDecorations';

test('buildTextSearchDecorations groups token ranges by line and marks the active hit', () => {
  const result = buildTextSearchDecorations([
    { lineIdx: 3, start: 1, end: 4, workbookTarget: null },
    { lineIdx: 3, start: 6, end: 8, workbookTarget: null },
    { lineIdx: 5, start: 2, end: 7, workbookTarget: null },
  ], 1);

  assert.deepEqual([...result.searchMatchSet], [3, 5]);
  assert.equal(result.activeSearchLineIdx, 3);
  assert.deepEqual(result.searchRangesByLineIdx.get(3), [
    { start: 1, end: 4, active: false },
    { start: 6, end: 8, active: true },
  ]);
  assert.deepEqual(result.searchRangesByLineIdx.get(5), [
    { start: 2, end: 7, active: false },
  ]);
});

test('buildTextSearchDecorations returns -1 when there is no active search hit', () => {
  const result = buildTextSearchDecorations([
    { lineIdx: 1, start: 0, end: 1, workbookTarget: null },
  ], -1);

  assert.equal(result.activeSearchLineIdx, -1);
});
