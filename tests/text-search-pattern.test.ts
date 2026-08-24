import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSearchPattern } from '../src/engine/text/search';

test('compileSearchPattern distinguishes empty, ready, and invalid expressions', () => {
  assert.deepEqual(
    compileSearchPattern('', { isRegex: true, isCaseSensitive: false }),
    { status: 'empty', pattern: null },
  );

  const ready = compileSearchPattern('budget', { isRegex: false, isCaseSensitive: false });
  assert.equal(ready.status, 'ready');
  assert.ok(ready.pattern);
  assert.equal(ready.pattern.test('Budget report'), true);

  assert.deepEqual(
    compileSearchPattern('[', { isRegex: true, isCaseSensitive: false }),
    { status: 'invalid', pattern: null },
  );
});
