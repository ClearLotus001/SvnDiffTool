import test from 'node:test';
import assert from 'node:assert/strict';

import { expandCollapseBlock, getExpandedHiddenCount } from '../src/utils/collapseState';

test('expandCollapseBlock reveals the full hidden range in one click', () => {
  const blockId = 'block-100-200';
  const nextState = expandCollapseBlock({}, blockId, 1024);

  assert.equal(getExpandedHiddenCount(nextState, blockId), 1024);
});

test('expandCollapseBlock keeps existing full expansion stable', () => {
  const blockId = 'block-100-200';
  const initialState = { [blockId]: 1024 };
  const nextState = expandCollapseBlock(initialState, blockId, 1024);

  assert.equal(nextState, initialState);
});
