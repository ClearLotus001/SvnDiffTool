import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  getSvnDiffViewerPreferencePath,
  readSvnDiffViewerPreferenceSync,
  resolveEffectiveSvnDiffViewerPreference,
  writeSvnDiffViewerPreference,
} from '../electron/svnDiffViewerPreferences';
import {
  readInstallerBootstrapSync,
  updateInstallerBootstrapDiffViewerMode,
} from '../electron/installerBootstrap';
import type { InstallerBootstrapConfig } from '../electron/installerBootstrap';

function withTempDir(run: (dir: string) => void | Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-diff-viewer-pref-'));
  return Promise.resolve(run(dir)).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function createInstallerConfig(diffViewerMode: InstallerBootstrapConfig['diffViewerMode']): InstallerBootstrapConfig {
  return {
    version: 1,
    diffViewerMode,
    cacheRoot: String.raw`D:\TempRoot\SvnDiffTool\Cache`,
  };
}

test('effective SVN diff viewer preference falls back to installer bootstrap mode', () => {
  const resolved = resolveEffectiveSvnDiffViewerPreference(
    String.raw`C:\missing-user-data`,
    createInstallerConfig('workbook-only'),
  );

  assert.deepEqual(resolved, {
    desiredScope: 'workbook-only',
    source: 'installer-bootstrap',
  });
});

test('explicit default preference suppresses installer bootstrap reapply', async () => {
  await withTempDir(async (dir) => {
    await writeSvnDiffViewerPreference(dir, null);

    assert.deepEqual(readSvnDiffViewerPreferenceSync(dir), {
      hasPreference: true,
      desiredScope: null,
    });
    assert.deepEqual(resolveEffectiveSvnDiffViewerPreference(dir, createInstallerConfig('all-files')), {
      desiredScope: null,
      source: 'user-preference',
    });
  });
});

test('user SVN diff viewer preference wins over installer bootstrap mode', async () => {
  await withTempDir(async (dir) => {
    await writeSvnDiffViewerPreference(dir, 'text-only');

    assert.deepEqual(resolveEffectiveSvnDiffViewerPreference(dir, createInstallerConfig('workbook-only')), {
      desiredScope: 'text-only',
      source: 'user-preference',
    });
  });
});

test('invalid SVN diff viewer preference is ignored', async () => {
  await withTempDir((dir) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      getSvnDiffViewerPreferencePath(dir),
      JSON.stringify({ version: 1, desiredScope: 'surprise-me' }),
      'utf-8',
    );

    assert.deepEqual(resolveEffectiveSvnDiffViewerPreference(dir, createInstallerConfig('text-only')), {
      desiredScope: 'text-only',
      source: 'installer-bootstrap',
    });
  });
});

test('updating installer bootstrap diff mode preserves the cache root', async () => {
  await withTempDir(async (dir) => {
    const execPath = path.join(dir, 'SvnDiffTool.exe');
    const bootstrapPath = path.join(dir, 'installer-bootstrap.properties');
    fs.writeFileSync(
      bootstrapPath,
      [
        'version=1',
        'diffViewerMode=keep',
        String.raw`cacheRoot=D:\Custom\SvnDiffTool\Cache`,
        '',
      ].join('\n'),
      'utf-8',
    );

    await updateInstallerBootstrapDiffViewerMode('all-files', execPath);
    const updated = readInstallerBootstrapSync(execPath);

    assert.equal(updated?.diffViewerMode, 'all-files');
    assert.equal(updated?.cacheRoot, String.raw`D:\Custom\SvnDiffTool\Cache`);
  });
});
