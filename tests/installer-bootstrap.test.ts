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
  wasLaunchedAfterUpdateFromArgv,
} from '../electron/maintenance';

function readInstallerScript(): string {
  return fs.readFileSync(path.join(process.cwd(), 'build', 'installer.nsh'), 'utf-8');
}

function readPackageJson(): { build?: { nsis?: { allowToChangeInstallationDirectory?: boolean } } } {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as {
    build?: { nsis?: { allowToChangeInstallationDirectory?: boolean } };
  };
}

test('normalizeInstallerBootstrapConfig falls back to safe defaults', () => {
  const normalized = normalizeInstallerBootstrapConfig({
    version: Number.NaN,
    diffViewerMode: 'unexpected' as 'keep',
    cacheRoot: '',
  });

  assert.equal(normalized.diffViewerMode, 'keep');
  assert.equal(normalized.cacheRoot, getDefaultInstallerCacheRoot());
});

test('normalizeInstallerBootstrapConfig preserves the text-only diff mode', () => {
  const normalized = normalizeInstallerBootstrapConfig({
    version: 1,
    diffViewerMode: 'text-only',
    cacheRoot: String.raw`D:\TempRoot\SvnDiffTool\Cache`,
  });

  assert.equal(normalized.diffViewerMode, 'text-only');
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
    diffViewerMode: 'workbook-only',
    cacheRoot: String.raw`D:\TempRoot\SvnDiffTool\Cache`,
  });

  assert.match(content, /^version=1/m);
  assert.match(content, /^diffViewerMode=workbook-only/m);
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

test('wasLaunchedAfterUpdateFromArgv detects update relaunch marker', () => {
  assert.equal(
    wasLaunchedAfterUpdateFromArgv(['SvnDiffTool.exe', '--updated']),
    true,
  );
  assert.equal(
    wasLaunchedAfterUpdateFromArgv(['SvnDiffTool.exe', '--maintenance=post-install']),
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

test('installer script normalizes fresh custom install directories before install', () => {
  const script = readInstallerScript();

  assert.match(script, /Function NormalizeSelectedInstallDir/);
  assert.match(script, /\$\{GetFileName\} "\$INSTDIR" \$0/);
  assert.match(script, /StrCpy \$INSTDIR "\$INSTDIR\\\$\{APP_FILENAME\}"/);
  assert.match(script, /Function InstallerOptionsBrowseInstallDir[\s\S]*Call NormalizeSelectedInstallDir/);
  assert.match(script, /Call NormalizeSelectedInstallDir[\s\S]*Call EnsureSelectedInstallDefaults/);
  assert.match(script, /Function InstallerOptionsPageCreate[\s\S]*Call NormalizeSelectedInstallDir/);
});

test('installer uses the custom options page instead of the default directory page', () => {
  const packageJson = readPackageJson();
  const script = readInstallerScript();

  assert.equal(packageJson.build?.nsis?.allowToChangeInstallationDirectory, false);
  assert.match(script, /\$\{NSD_CreateGroupBox\} 0 38u 100% 44u "\$\(INSTALL_OPTIONS_INSTALL_DIR\)"/);
  assert.match(script, /\$\{NSD_CreateButton\} 80% 52u 18% 14u "\$\(INSTALL_OPTIONS_INSTALL_BROWSE\)"/);
});

test('installer script keeps upgrade installs in the existing install directory', () => {
  const script = readInstallerScript();

  assert.match(script, /StrCpy \$IsUpgradeInstall "1"\s+StrCpy \$INSTDIR \$ExistingInstallDir/);
});

test('installer script waits for post-install maintenance before relaunching after update', () => {
  const script = readInstallerScript();

  assert.match(script, /StrCpy \$launchLink "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"/);
  assert.match(script, /ExecWait '"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" "--maintenance=post-install"' \$0/);
});

test('installer script leaves the install directory before overwrite cleanup removes it', () => {
  const script = readInstallerScript();

  assert.match(script, /SetOutPath "\$TEMP"\s+RMDir \/r "\$INSTDIR"/);
});
