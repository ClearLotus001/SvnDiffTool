import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_CLI_ARGS } from '../electron/cliArgs';
import {
  resolveCliSourceIdentityKind,
  shouldResolveSvnRuntimeContext,
} from '../electron/main/svnHelpers';
import { setActiveCliArgs } from '../electron/main/state';

function applyCliArgs(overrides: Partial<typeof EMPTY_CLI_ARGS>) {
  setActiveCliArgs({
    ...EMPTY_CLI_ARGS,
    ...overrides,
  });
}

test.afterEach(() => {
  setActiveCliArgs(EMPTY_CLI_ARGS);
});

test('plain local compare keeps svn runtime context disabled and uses local-dev identity kind', () => {
  applyCliArgs({
    basePath: 'C:\\temp\\left.txt',
    minePath: 'C:\\temp\\right.txt',
    baseName: 'left.txt',
    mineName: 'right.txt',
    fileName: 'right.txt',
  });

  assert.equal(shouldResolveSvnRuntimeContext(), false);
  assert.equal(resolveCliSourceIdentityKind(), 'local-dev');
});

test('explicit repository urls keep svn runtime context enabled for cli launches', () => {
  applyCliArgs({
    basePath: 'C:\\temp\\left.txt',
    minePath: 'C:\\temp\\right.txt',
    baseName: 'left.txt',
    mineName: 'right.txt',
    fileName: 'right.txt',
    baseUrl: 'https://svn.example.com/project/file.txt',
    mineUrl: 'https://svn.example.com/project/file.txt',
  });

  assert.equal(shouldResolveSvnRuntimeContext(), true);
  assert.equal(resolveCliSourceIdentityKind(), 'cli');
});

test('working-copy startup hints keep svn runtime context enabled for cli launches', () => {
  applyCliArgs({
    basePath: 'C:\\temp\\left.txt',
    minePath: 'C:\\temp\\right.txt',
    baseName: 'left.txt',
    mineName: 'right.txt',
    fileName: 'right.txt',
    baseRevision: 'BASE',
    mineRevision: 'WC',
  });

  assert.equal(shouldResolveSvnRuntimeContext(), true);
  assert.equal(resolveCliSourceIdentityKind(), 'cli');
});

test('requested revision switches force revision-switch identity kind even without startup svn hints', () => {
  applyCliArgs({
    basePath: 'C:\\temp\\left.txt',
    minePath: 'C:\\temp\\right.txt',
    baseName: 'left.txt',
    mineName: 'right.txt',
    fileName: 'right.txt',
  });

  assert.equal(shouldResolveSvnRuntimeContext('r12', undefined), true);
  assert.equal(resolveCliSourceIdentityKind('r12', undefined), 'revision-switch');
});
