import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateLogicalTextColumnFromClientX } from '../src/utils/diff/logicalTextSelectionDom';

test('estimateLogicalTextColumnFromClientX maps horizontal position into a text column', () => {
  assert.equal(estimateLogicalTextColumnFromClientX(100, 100, 260, 16), 0);
  assert.equal(estimateLogicalTextColumnFromClientX(180, 100, 260, 16), 8);
  assert.equal(estimateLogicalTextColumnFromClientX(252, 100, 260, 16), 15);
});

test('estimateLogicalTextColumnFromClientX clamps to the available range', () => {
  assert.equal(estimateLogicalTextColumnFromClientX(20, 100, 260, 16), 0);
  assert.equal(estimateLogicalTextColumnFromClientX(400, 100, 260, 16), 16);
});
