import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMiniMapTargetScrollTop } from '../src/components/WorkbookMiniMap';

test('computeMiniMapTargetScrollTop centers the clicked position and clamps bounds', () => {
  assert.equal(computeMiniMapTargetScrollTop(0, 1000, 200), 0);
  assert.equal(computeMiniMapTargetScrollTop(0.5, 1000, 200), 400);
  assert.equal(computeMiniMapTargetScrollTop(1, 1000, 200), 800);
});
