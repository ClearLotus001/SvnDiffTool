import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CACHE_CONTAINER_DIR_NAME,
  CACHE_LEAF_DIR_NAME,
  clearInstallerMaintenancePendingSync,
  getDefaultInstallerCacheRoot,
  getInstallerMaintenancePendingPath,
  getPreviousInstallerBootstrapPath,
  hasInstallerMaintenancePendingSync,
  isControlledCacheRoot,
  normalizeInstallerBootstrapConfig,
  toInstallerBootstrapContent,
} from '../electron/installerBootstrap';
import {
  getMaintenanceModeFromArgv,
  hasPendingPostInstallMaintenance,
  shouldDeleteAppDataFromArgv,
} from '../electron/maintenance';

test('normalizeInstallerBootstrapConfig falls back to safe defaults', () => {
  const normalized = normalizeInstallerBootstrapConfig({
    version: Number.NaN,
    diffViewerMode: 'unexpected' as 'keep',
    cacheRoot: '',
  });

  assert.equal(normalized.diffViewerMode, 'keep');
  assert.equal(normalized.cacheRoot, getDefaultInstallerCacheRoot());
});

test('controlled cache root requires the managed SvnDiffTool cache suffix', () => {
  assert.equal(
    isControlledCacheRoot(String.raw`C:\Users\me\AppData\Local\SvnDiffTool\Cache`),
    true,
  );
  assert.equal(
    isControlledCacheRoot(String.raw`D:\Custom\Cache`),
    false,
  );
});

test('installer bootstrap content keeps the expected key-value structure', () => {
  const content = toInstallerBootstrapContent({
    version: 1,
    diffViewerMode: 'excel-only',
    cacheRoot: String.raw`D:\TempRoot\SvnDiffTool\Cache`,
  });

  assert.match(content, /^version=1/m);
  assert.match(content, /^diffViewerMode=excel-only/m);
  assert.match(content, /^cacheRoot=D:\\TempRoot\\SvnDiffTool\\Cache/m);
  assert.equal(content.includes(`${CACHE_CONTAINER_DIR_NAME}\\${CACHE_LEAF_DIR_NAME}`), true);
});

test('getMaintenanceModeFromArgv supports equals and split argument forms', () => {
  assert.equal(
    getMaintenanceModeFromArgv(['SvnDiffTool.exe', '--maintenance=post-install']),
    'post-install',
  );
  assert.equal(
    getMaintenanceModeFromArgv(['SvnDiffTool.exe', '--maintenance', 'prepare-uninstall']),
    'prepare-uninstall',
  );
  assert.equal(
    getMaintenanceModeFromArgv(['SvnDiffTool.exe', '--maintenance=unknown']),
    null,
  );
});

test('shouldDeleteAppDataFromArgv only enables explicit personal-data cleanup', () => {
  assert.equal(
    shouldDeleteAppDataFromArgv(['Uninstall SvnDiffTool.exe', '--delete-app-data']),
    true,
  );
  assert.equal(
    shouldDeleteAppDataFromArgv(['Uninstall SvnDiffTool.exe', '/S']),
    false,
  );
});

test('post-install maintenance markers are detected and can be cleared', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-diff-tool-installer-'));
  const execPath = path.join(tempDir, 'SvnDiffTool.exe');
  const markerPath = getInstallerMaintenancePendingPath(execPath);
  const previousBootstrapPath = getPreviousInstallerBootstrapPath(execPath);

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, '', 'utf-8');

    assert.equal(hasInstallerMaintenancePendingSync(execPath), true);
    assert.equal(hasPendingPostInstallMaintenance(execPath), true);

    clearInstallerMaintenancePendingSync(execPath);
    assert.equal(hasInstallerMaintenancePendingSync(execPath), false);
    assert.equal(hasPendingPostInstallMaintenance(execPath), false);

    fs.writeFileSync(previousBootstrapPath, 'version=1\n', 'utf-8');
    assert.equal(hasPendingPostInstallMaintenance(execPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
