import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookCanvasRuns } from '../src/utils/workbook/workbookCanvasRuns';

test('buildWorkbookCanvasRuns batches contiguous groups up to the height budget', () => {
  const runs = buildWorkbookCanvasRuns([
    { key: 'a', height: 10 },
    { key: 'b', height: 12 },
    { key: 'c', height: 14 },
  ], {
    keyPrefix: 'probe',
    maxRunHeight: 24,
  });

  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((run) => ({
    top: run.top,
    height: run.height,
    keys: run.groups.map((group) => group.key),
  })), [
    { top: 0, height: 22, keys: ['a', 'b'] },
    { top: 22, height: 14, keys: ['c'] },
  ]);
});

test('buildWorkbookCanvasRuns preserves explicit gaps between non-contiguous groups', () => {
  const runs = buildWorkbookCanvasRuns([
    { key: 'a', top: 0, height: 10 },
    { key: 'b', top: 30, height: 12 },
    { key: 'c', top: 42, height: 14 },
  ], {
    keyPrefix: 'probe',
    maxRunHeight: 64,
  });

  assert.deepEqual(runs.map((run) => ({
    top: run.top,
    height: run.height,
    keys: run.groups.map((group) => group.key),
  })), [
    { top: 0, height: 10, keys: ['a'] },
    { top: 30, height: 26, keys: ['b', 'c'] },
  ]);
});
