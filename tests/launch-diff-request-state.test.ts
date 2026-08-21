import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumePendingLaunchDiffRequest,
  getHasPendingLaunchDiffRequest,
  setHasPendingLaunchDiffRequest,
} from '../electron/main/state';

test('launch diff request state is explicit and consumed after initial payload loading', () => {
  setHasPendingLaunchDiffRequest(false);
  assert.equal(getHasPendingLaunchDiffRequest(), false);

  setHasPendingLaunchDiffRequest(true);
  assert.equal(getHasPendingLaunchDiffRequest(), true);
  assert.equal(consumePendingLaunchDiffRequest(), true);
  assert.equal(getHasPendingLaunchDiffRequest(), false);
  assert.equal(consumePendingLaunchDiffRequest(), false);
});
