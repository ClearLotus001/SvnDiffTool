import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import {
  areDevElectronResourcesFresh,
  resolveDevElectronProfileDir,
} from '../scripts/devElectronStartup';

test('dev Electron waits for bundles emitted by the current dev run', () => {
  assert.equal(areDevElectronResourcesFresh([1_100, 1_200], 1_000), true);
  assert.equal(areDevElectronResourcesFresh([900, 1_200], 1_000), false);
  assert.equal(areDevElectronResourcesFresh([900, 1_200], null), true);
  assert.equal(areDevElectronResourcesFresh([0, 1_200], null), false);
});

test('dev Electron isolates recovery sessions when the stable profile is locked', () => {
  const devRootDir = path.join('C:', 'Temp', 'Versora-dev');
  assert.equal(resolveDevElectronProfileDir({
    devRootDir,
    profileHash: 'workspace',
    runnerPid: 42,
    stableProfileLocked: false,
  }), path.join(devRootDir, 'workspace'));
  assert.equal(resolveDevElectronProfileDir({
    devRootDir,
    profileHash: 'workspace',
    runnerPid: 42,
    stableProfileLocked: true,
  }), path.join(devRootDir, 'workspace-recovery-42'));
});
