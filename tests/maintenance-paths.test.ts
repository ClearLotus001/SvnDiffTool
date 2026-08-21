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
  migrateAndCleanupPreviousCacheRoot,
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
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');

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
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');

    await writeFile(path.join(previousCacheRoot, 'disk-cache', 'index'), 'cache');
    await writeFile(path.join(currentCacheRoot, 'session-data', 'CURRENT'), 'state');

    assert.equal(
      cleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      true,
    );

    assert.equal(fs.existsSync(previousCacheRoot), false);
    assert.equal(fs.existsSync(currentCacheRoot), true);
  });
});

test('cache migration treats canonical aliases of the same root as a no-op', async () => {
  await withSandbox('svn-diff-maintenance-alias-', async (sandboxDir) => {
    const cacheRoot = path.join(sandboxDir, 'cache-parent', 'Versora', 'Cache');
    const equivalentCacheRoot = path.join(cacheRoot, '..', 'Cache');
    const markerPath = path.join(cacheRoot, 'session-data', 'CURRENT');
    await writeFile(markerPath, 'state');

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(cacheRoot),
        createBootstrapConfig(equivalentCacheRoot),
      ),
      true,
    );
    assert.equal(fs.existsSync(markerPath), true);
  });
});

test('cache migration refuses overlapping roots without deleting the previous cache', async () => {
  await withSandbox('svn-diff-maintenance-overlap-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'cache-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(previousCacheRoot, 'nested', 'Versora', 'Cache');
    const markerPath = path.join(previousCacheRoot, 'session-data', 'CURRENT');
    await writeFile(markerPath, 'state');

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      false,
    );
    assert.equal(fs.existsSync(markerPath), true);
    assert.equal(fs.existsSync(currentCacheRoot), false);
  });
});

test('failed cache migration retains the complete previous cache for retry', async () => {
  await withSandbox('svn-diff-maintenance-failure-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');
    const previousMarkerPath = path.join(previousCacheRoot, 'session-data', 'CURRENT');
    await writeFile(previousMarkerPath, 'state');
    await writeFile(path.join(currentCacheRoot, 'session-data'), 'blocks directory creation');

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      false,
    );
    assert.equal(fs.existsSync(previousMarkerPath), true);
  });
});

test('cache migration does not follow nested directory links', async (t) => {
  await withSandbox('svn-diff-maintenance-link-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');
    const externalRoot = path.join(sandboxDir, 'external-payload');
    const externalMarkerPath = path.join(externalRoot, 'secret.txt');
    const linkedPath = path.join(previousCacheRoot, 'session-data', 'linked');

    await writeFile(path.join(previousCacheRoot, 'session-data', 'local.txt'), 'local');
    await writeFile(externalMarkerPath, 'external');
    try {
      fs.symlinkSync(externalRoot, linkedPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Directory links are not available in this environment.');
        return;
      }
      throw error;
    }

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      true,
    );
    assert.equal(fs.existsSync(path.join(currentCacheRoot, 'session-data', 'local.txt')), true);
    assert.equal(fs.existsSync(path.join(currentCacheRoot, 'session-data', 'linked')), false);
    assert.equal(fs.existsSync(externalMarkerPath), true);
  });
});

test('cache cleanup refuses roots reached through a directory link', async (t) => {
  await withSandbox('svn-diff-maintenance-root-link-', async (sandboxDir) => {
    const externalContainer = path.join(sandboxDir, 'external', 'Versora');
    const externalMarkerPath = path.join(externalContainer, 'Cache', 'session-data', 'CURRENT');
    const linkedContainer = path.join(sandboxDir, 'linked-parent', 'Versora');
    const previousCacheRoot = path.join(linkedContainer, 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');

    await writeFile(externalMarkerPath, 'external');
    await fsp.mkdir(path.dirname(linkedContainer), { recursive: true });
    try {
      fs.symlinkSync(externalContainer, linkedContainer, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Directory links are not available in this environment.');
        return;
      }
      throw error;
    }

    assert.equal(
      cleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      false,
    );
    assert.equal(fs.existsSync(externalMarkerPath), true);
  });
});

test('cache migration refuses a destination reached through a nested directory link', async (t) => {
  await withSandbox('svn-diff-maintenance-destination-link-', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');
    const externalRoot = path.join(sandboxDir, 'external-destination');
    const destinationLink = path.join(currentCacheRoot, 'session-data', 'Local Storage');
    const previousMarkerPath = path.join(previousCacheRoot, 'session-data', 'Local Storage', 'copied.txt');
    const externalMarkerPath = path.join(externalRoot, 'existing.txt');

    await writeFile(previousMarkerPath, 'previous');
    await writeFile(externalMarkerPath, 'external');
    await fsp.mkdir(path.dirname(destinationLink), { recursive: true });
    try {
      fs.symlinkSync(externalRoot, destinationLink, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Directory links are not available in this environment.');
        return;
      }
      throw error;
    }

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(previousCacheRoot),
        createBootstrapConfig(currentCacheRoot),
      ),
      false,
    );
    assert.equal(fs.existsSync(previousMarkerPath), true);
    assert.equal(fs.existsSync(path.join(externalRoot, 'copied.txt')), false);
    assert.equal(fs.existsSync(externalMarkerPath), true);
  });
});

test('cache migration treats case-only Windows path differences as the same root', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows paths are case-insensitive.');
    return;
  }

  await withSandbox('svn-diff-maintenance-case-', async (sandboxDir) => {
    const cacheRoot = path.join(sandboxDir, 'cache-parent', 'Versora', 'Cache');
    const markerPath = path.join(cacheRoot, 'session-data', 'CURRENT');
    await writeFile(markerPath, 'state');

    assert.equal(
      migrateAndCleanupPreviousCacheRoot(
        createBootstrapConfig(cacheRoot),
        createBootstrapConfig(cacheRoot.toUpperCase()),
      ),
      true,
    );
    assert.equal(fs.existsSync(markerPath), true);
  });
});

test('cleanupRuntimeArtifactsForUninstall removes user data, session data and managed caches', async () => {
  await withSandbox('svn-diff-maintenance-uninstall-', async (sandboxDir) => {
    const userDataPath = path.join(sandboxDir, 'user-data');
    const sessionDataPath = path.join(sandboxDir, 'session-data');
    const currentCacheRoot = path.join(sandboxDir, 'current-parent', 'Versora', 'Cache');
    const previousCacheRoot = path.join(sandboxDir, 'previous-parent', 'Versora', 'Cache');

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
