import test from 'node:test';
import assert from 'node:assert/strict';

import { getCollapseJumpBadgeWidth } from '../src/components/diff/CollapseJumpButton';

test('collapse jump badge expands to contain long progress text', () => {
  assert.equal(getCollapseJumpBadgeWidth('1/9', false), 24);
  assert.equal(getCollapseJumpBadgeWidth('12/405', false), 45);
  assert.equal(getCollapseJumpBadgeWidth('405/405', false), 51);
});

test('docked collapse jump badge stays circular unless its index needs more room', () => {
  assert.equal(getCollapseJumpBadgeWidth('405', true), 24);
  assert.ok(getCollapseJumpBadgeWidth('1000', true) > 24);
});
