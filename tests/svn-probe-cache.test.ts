import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_CLI_ARGS } from '../electron/cliArgs';
import { setActiveCliArgs } from '../electron/main/state';
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
