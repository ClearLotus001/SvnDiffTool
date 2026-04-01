import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { InstallerBootstrapConfig } from '../electron/installerBootstrap';
import {
  cleanupPreviousCacheRoot,
  cleanupRuntimeArtifactsForUninstall,
  migratePreviousCacheRoot,
} from '../electron/maintenancePaths';

function createBootstrapConfig(cacheRoot: string): InstallerBootstrapConfig {
  return {
    version: 1,
    diffViewerMode: 'keep',
    cacheRoot,
  };
}

async function withSandbox<T>(prefix: string, run: (sandboxDir: string) => Promise<T>): Promise<T> {
  const sandboxDir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await run(sandboxDir);
  } finally {
    await fsp.rm(sandboxDir, { recursive: true, force: true });
  }
}

async function writeFile(targetPath: string, contents: string) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, contents, 'utf8');
}

test('migratePreviousCacheRoot copies reusable session and disk cache data only', async () => {
  await withSandbox('svn-diff-maintenance-paths-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'SvnDiffTool', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'SvnDiffTool', 'Cache');

    await writeFile(path.join(previousCacheRoot, 'session-data', 'Local Storage', 'leveldb', '000003.log'), 'session');
    await writeFile(path.join(previousCacheRoot, 'disk-cache', 'index'), 'cache');
    await writeFile(path.join(previousCacheRoot, 'temp', 'stale.bin'), 'temp');

    const previousConfig = createBootstrapConfig(previousCacheRoot);
    const currentConfig = createBootstrapConfig(currentCacheRoot);

    migratePreviousCacheRoot(previousConfig, currentConfig);

    assert.equal(fs.existsSync(path.join(currentCacheRoot, 'session-data', 'Local Storage', 'leveldb', '000003.log')), true);
    assert.equal(fs.existsSync(path.join(currentCacheRoot, 'disk-cache', 'index')), true);
    assert.equal(fs.existsSync(path.join(currentCacheRoot, 'temp', 'stale.bin')), false);
  });
});

test('cleanupPreviousCacheRoot removes only the previous managed cache root', async () => {
  await withSandbox('svn-diff-maintenance-cleanup-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'SvnDiffTool', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'SvnDiffTool', 'Cache');

    await writeFile(path.join(previousCacheRoot, 'disk-cache', 'index'), 'cache');
    await writeFile(path.join(currentCacheRoot, 'session-data', 'CURRENT'), 'state');

    cleanupPreviousCacheRoot(
      createBootstrapConfig(previousCacheRoot),
      createBootstrapConfig(currentCacheRoot),
    );

    assert.equal(fs.existsSync(previousCacheRoot), false);
    assert.equal(fs.existsSync(currentCacheRoot), true);
  });
});

test('cleanupRuntimeArtifactsForUninstall removes user data, session data and managed caches', async () => {
  await withSandbox('svn-diff-maintenance-uninstall-', async (sandboxDir) => {
    const userDataPath = path.join(sandboxDir, 'user-data');
    const sessionDataPath = path.join(sandboxDir, 'session-data');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'SvnDiffTool', 'Cache');
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'SvnDiffTool', 'Cache');

    await writeFile(path.join(userDataPath, 'settings.json'), '{}');
    await writeFile(path.join(sessionDataPath, 'Local Storage', 'leveldb', 'CURRENT'), 'state');
    await writeFile(path.join(currentCacheRoot, 'temp', 'payload.bin'), 'payload');
    await writeFile(path.join(previousCacheRoot, 'disk-cache', 'index'), 'cache');

    cleanupRuntimeArtifactsForUninstall({
      userDataPath,
      sessionDataPath,
      currentCacheRoot,
      previousCacheRoot,
    });

    assert.equal(fs.existsSync(userDataPath), false);
    assert.equal(fs.existsSync(sessionDataPath), false);
    assert.equal(fs.existsSync(currentCacheRoot), false);
    assert.equal(fs.existsSync(previousCacheRoot), false);
  });
});
