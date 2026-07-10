import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { InstallerBootstrapConfig } from '../electron/installerBootstrap';
import {
  cleanupRuntimeArtifactsForUninstall,
  migrateAndCleanupPreviousCacheRoot,
} from '../electron/maintenancePaths';

function createBootstrapConfig(cacheRoot: string): InstallerBootstrapConfig {
  return {
    version: 1,
    diffViewerMode: 'keep',
    cacheRoot,
  };
}

async function writeFile(targetPath: string, contents: string) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, contents, 'utf8');
}

function exists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

async function withSandbox<T>(name: string, run: (sandboxDir: string) => Promise<T>): Promise<T> {
  const sandboxDir = await fsp.mkdtemp(path.join(os.tmpdir(), `svn-diff-${name}-`));
  try {
    return await run(sandboxDir);
  } finally {
    await fsp.rm(sandboxDir, { recursive: true, force: true });
  }
}

async function scenarioUpgradeMigratesReusableCache() {
  return withSandbox('install-upgrade-migrate', async (sandboxDir) => {
    const previousCacheRoot = path.join(sandboxDir, 'cache-old-parent', 'SvnDiffTool', 'Cache');
    const currentCacheRoot = path.join(sandboxDir, 'cache-new-parent', 'SvnDiffTool', 'Cache');

    const previousSessionMarker = path.join(previousCacheRoot, 'session-data', 'Local Storage', 'leveldb', '000003.log');
    const previousDiskCacheMarker = path.join(previousCacheRoot, 'disk-cache', 'index');
    const previousTempMarker = path.join(previousCacheRoot, 'temp', 'stale.bin');
    const currentSessionMarker = path.join(currentCacheRoot, 'session-data', 'existing.txt');

    await writeFile(previousSessionMarker, 'session payload');
    await writeFile(previousDiskCacheMarker, 'disk cache payload');
    await writeFile(previousTempMarker, 'temporary payload');
    await writeFile(currentSessionMarker, 'current payload');

    const previousConfig = createBootstrapConfig(previousCacheRoot);
    const currentConfig = createBootstrapConfig(currentCacheRoot);

    assert.equal(migrateAndCleanupPreviousCacheRoot(previousConfig, currentConfig), true);

    assert.equal(exists(path.join(currentCacheRoot, 'session-data', 'Local Storage', 'leveldb', '000003.log')), true);
    assert.equal(exists(path.join(currentCacheRoot, 'disk-cache', 'index')), true);
    assert.equal(exists(path.join(currentCacheRoot, 'temp', 'stale.bin')), false);
    assert.equal(exists(currentSessionMarker), true);
    assert.equal(exists(previousCacheRoot), false);

    return [
      `旧 cacheRoot 已迁移到新目录: ${currentCacheRoot}`,
      '仅迁移 session-data / disk-cache，temp 不迁移',
      '旧 cacheRoot 已清理',
    ];
  });
}

async function scenarioUpgradeWithSameCacheRootIsNoOp() {
  return withSandbox('install-upgrade-same-cache', async (sandboxDir) => {
    const cacheRoot = path.join(sandboxDir, 'cache-parent', 'SvnDiffTool', 'Cache');
    const sessionMarker = path.join(cacheRoot, 'session-data', 'Local Storage', 'leveldb', '000007.log');
    await writeFile(sessionMarker, 'session payload');

    const config = createBootstrapConfig(cacheRoot);
    assert.equal(migrateAndCleanupPreviousCacheRoot(config, config), true);

    assert.equal(exists(sessionMarker), true);
    assert.equal(exists(cacheRoot), true);

    return [
      '新旧 cacheRoot 相同场景不会误删现有目录',
    ];
  });
}

async function scenarioPrepareUninstallCleansManagedArtifacts() {
  return withSandbox('install-upgrade-uninstall', async (sandboxDir) => {
    const userDataPath = path.join(sandboxDir, 'user-data');
    const sessionDataPath = path.join(sandboxDir, 'session-data');
    const currentCacheRoot = path.join(sandboxDir, 'cache-current-parent', 'SvnDiffTool', 'Cache');
    const previousCacheRoot = path.join(sandboxDir, 'cache-previous-parent', 'SvnDiffTool', 'Cache');

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

    assert.equal(exists(userDataPath), false);
    assert.equal(exists(sessionDataPath), false);
    assert.equal(exists(currentCacheRoot), false);
    assert.equal(exists(previousCacheRoot), false);

    return [
      'prepare-uninstall 会删除 userData / sessionData / 当前与历史 cacheRoot',
    ];
  });
}

async function main() {
  const scenarios = [
    {
      name: '升级迁移受控缓存',
      run: scenarioUpgradeMigratesReusableCache,
    },
    {
      name: '相同缓存目录升级不误删',
      run: scenarioUpgradeWithSameCacheRootIsNoOp,
    },
    {
      name: '卸载前清理受控数据',
      run: scenarioPrepareUninstallCleansManagedArtifacts,
    },
  ] as const;

  console.log('Running install/upgrade verification scenarios...\n');

  for (const scenario of scenarios) {
    const details = await scenario.run();
    console.log(`✔ ${scenario.name}`);
    details.forEach((detail) => {
      console.log(`  - ${detail}`);
    });
    console.log('');
  }

  console.log('All install/upgrade verification scenarios passed.');
}

void main().catch((error) => {
  console.error('Install/upgrade verification failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
