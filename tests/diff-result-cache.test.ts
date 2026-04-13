import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCachedDiffResult, rememberCachedDiffResult } from '../src/hooks/app/diffResultCache';

function buildResult(multiplier: number) {
  return buildCachedDiffResult({
    diffLines: [
      {
        type: 'equal',
        base: 'a'.repeat(multiplier),
        mine: 'b'.repeat(multiplier),
        baseLineNo: 1,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      },
    ],
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });
}

test('rememberCachedDiffResult evicts the least recently used entry when byte budget is exceeded', () => {
  const cache = new Map<string, ReturnType<typeof buildResult>>();
  const first = buildResult(20);
  const second = buildResult(20);

  rememberCachedDiffResult(cache, 'first', first, {
    limit: 5,
    maxBytes: first.memoryBytes + second.memoryBytes - 1,
  });
  rememberCachedDiffResult(cache, 'second', second, {
    limit: 5,
    maxBytes: first.memoryBytes + second.memoryBytes - 1,
  });

  assert.deepEqual([...cache.keys()], ['second']);
});

test('rememberCachedDiffResult skips caching entries larger than the configured budget', () => {
  const cache = new Map<string, ReturnType<typeof buildResult>>();
  const oversized = buildResult(100);

  rememberCachedDiffResult(cache, 'oversized', oversized, {
    limit: 5,
    maxBytes: oversized.memoryBytes - 1,
  });

  assert.equal(cache.size, 0);
});
