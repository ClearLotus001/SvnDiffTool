import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDialogTabIndex } from '../src/utils/app/dialogFocus';

test('dialog tab navigation wraps in both directions', () => {
  assert.equal(resolveDialogTabIndex(3, 0, false), 1);
  assert.equal(resolveDialogTabIndex(3, 2, false), 0);
  assert.equal(resolveDialogTabIndex(3, 0, true), 2);
  assert.equal(resolveDialogTabIndex(3, 1, true), 0);
  assert.equal(resolveDialogTabIndex(0, -1, false), null);
});
