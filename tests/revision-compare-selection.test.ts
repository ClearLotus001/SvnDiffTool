import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSkipSameRevisionCompare } from '../src/utils/navigation/revisionCompareSelection';

test('same-source revision compare skips identical non-empty revision ids', () => {
  assert.equal(shouldSkipSameRevisionCompare(false, ' r1925831 ', 'r1925831'), true);
  assert.equal(shouldSkipSameRevisionCompare(false, 'r1925830', 'r1925831'), false);
  assert.equal(shouldSkipSameRevisionCompare(false, '', ''), false);
});

test('two-file compare allows matching revision ids from independent sources', () => {
  assert.equal(shouldSkipSameRevisionCompare(true, 'r42', 'r42'), false);
});
