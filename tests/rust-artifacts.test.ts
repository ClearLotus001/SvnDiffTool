import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRustArtifactPaths,
  resolveCargoExecutable,
  runRustReleaseBuild,
} from '../scripts/rustArtifacts';

test('getRustArtifactPaths resolves the platform-specific parser artifact', () => {
  const paths = getRustArtifactPaths('E:\\Project\\SvnDiffTool', { platform: 'win32' });

  assert.equal(paths.parserName, 'svn_excel_parser.exe');
  assert.match(paths.parserPath, /rust[\\/]target[\\/]release[\\/]svn_excel_parser\.exe$/);
  assert.match(paths.manifestPath, /rust[\\/]Cargo\.toml$/);
});

test('resolveCargoExecutable reports missing cargo when all probes fail', () => {
  const result = resolveCargoExecutable({
    platform: 'win32',
    env: {
      PATH: '',
      USERPROFILE: 'C:\\Users\\NoRust',
    },
    existsSync: () => false,
    spawnSync: () => ({
      error: new Error('spawnSync cargo.exe ENOENT'),
      status: null,
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Rust cargo executable was not found/);
  assert.ok(result.attempted.includes('cargo.exe'));
});

test('runRustReleaseBuild returns missing-cargo instead of throwing', () => {
  const result = runRustReleaseBuild({
    repoRoot: 'E:\\Project\\SvnDiffTool',
    platform: 'win32',
    env: {
      PATH: '',
      USERPROFILE: 'C:\\Users\\NoRust',
    },
    existsSync: () => false,
    spawnSync: () => ({
      error: new Error('spawnSync cargo.exe ENOENT'),
      status: null,
    }),
    stdio: 'pipe',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-cargo');
  assert.match(result.message, /Rust cargo executable was not found/);
});

test('runRustReleaseBuild invokes cargo release build after a successful probe', () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const result = runRustReleaseBuild({
    repoRoot: 'E:\\Project\\SvnDiffTool',
    platform: 'win32',
    env: {
      PATH: '',
    },
    existsSync: () => false,
    spawnSync: (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    },
    stdio: 'pipe',
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.args, ['--version']);
  assert.deepEqual(calls[1]?.args, [
    'build',
    '--manifest-path',
    'E:\\Project\\SvnDiffTool\\rust\\Cargo.toml',
    '--release',
  ]);
});
