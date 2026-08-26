import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_CLI_ARGS } from '../electron/cliArgs';
import {
  fileEqualityCache,
  filePayloadCache,
  getSessionCacheGeneration,
  revisionPayloadCache,
  setActiveCliArgs,
  workbookCompareCache,
  workbookCompareInFlight,
  workbookMetadataCache,
  workbookMetadataInFlight,
} from '../electron/main/state';
import {
  localSvnUrlCache,
  localVersioningStatusCache,
} from '../electron/main/svnProbeCache';

test('setActiveCliArgs clears local SVN probe caches', () => {
  localSvnUrlCache.clear();
  localVersioningStatusCache.clear();

  localSvnUrlCache.set('C:\\wc\\sample.xlsx', Promise.resolve('http://repo/sample.xlsx'));
  localVersioningStatusCache.set('C:\\wc\\sample.xlsx', Promise.resolve('versioned'));

  setActiveCliArgs({
    ...EMPTY_CLI_ARGS,
    minePath: 'C:\\wc\\sample.xlsx',
  });

  assert.equal(localSvnUrlCache.size, 0);
  assert.equal(localVersioningStatusCache.size, 0);
});

test('setActiveCliArgs advances the session and releases every large main-process cache', () => {
  filePayloadCache.set('file', {} as never);
  revisionPayloadCache.set('revision', {} as never);
  fileEqualityCache.set('equality', {} as never);
  workbookCompareCache.set('compare', {} as never);
  workbookCompareInFlight.set('compare', Promise.resolve(null));
  workbookMetadataCache.set('metadata', {} as never);
  workbookMetadataInFlight.set('metadata', Promise.resolve({} as never));
  const previousGeneration = getSessionCacheGeneration();

  setActiveCliArgs({
    ...EMPTY_CLI_ARGS,
    minePath: 'C:\\wc\\next.xlsx',
  });

  assert.equal(getSessionCacheGeneration(), previousGeneration + 1);
  for (const cache of [
    filePayloadCache,
    revisionPayloadCache,
    fileEqualityCache,
    workbookCompareCache,
    workbookCompareInFlight,
    workbookMetadataCache,
    workbookMetadataInFlight,
  ]) {
    assert.equal(cache.size, 0);
  }
});
