import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkbookCompareLayoutSnapshot,
  buildWorkbookHorizontalLayoutSnapshot,
  cloneCollapseExpansionState,
  shouldRestoreWorkbookLayoutSnapshot,
} from '../src/utils/workbookLayoutSnapshot';

test('cloneCollapseExpansionState deep-clones reveal ranges', () => {
  const original = {
    blockA: [{ start: 1, end: 3 }],
  };

  const cloned = cloneCollapseExpansionState(original);
  cloned.blockA![0]!.start = 9;

  assert.equal(original.blockA![0]!.start, 1);
  assert.equal(cloned.blockA![0]!.start, 9);
});

test('shouldRestoreWorkbookLayoutSnapshot only restores the active region on the active sheet', () => {
  const snapshot = buildWorkbookCompareLayoutSnapshot(
    'unified',
    'Items',
    'Items:4:2:0',
    120,
    64,
    {},
  );

  assert.equal(
    shouldRestoreWorkbookLayoutSnapshot(snapshot, 'Items:4:2:0', 'Items'),
    true,
  );
  assert.equal(
    shouldRestoreWorkbookLayoutSnapshot(snapshot, 'Items:4:2:1', 'Items'),
    false,
  );
  assert.equal(
    shouldRestoreWorkbookLayoutSnapshot(snapshot, 'Items:4:2:0', 'Other'),
    false,
  );
});

test('buildWorkbookHorizontalLayoutSnapshot preserves per-pane scroll positions', () => {
  const snapshot = buildWorkbookHorizontalLayoutSnapshot(
    'Items',
    'Items:4:2:0',
    200,
    48,
    200,
    96,
    { blockA: [{ start: 0, end: 2 }] },
  );

  assert.equal(snapshot.layout, 'split-h');
  assert.equal(snapshot.leftScrollTop, 200);
  assert.equal(snapshot.leftScrollLeft, 48);
  assert.equal(snapshot.rightScrollTop, 200);
  assert.equal(snapshot.rightScrollLeft, 96);
  assert.notEqual(snapshot.expandedBlocks, undefined);
});
