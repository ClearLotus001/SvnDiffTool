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

function readWindowsUpdaterSource(): string {
  return fs.readFileSync(path.join(process.cwd(), 'electron', 'updater', 'windowsUpdater.ts'), 'utf-8');
}

function readElectronMainSource(): string {
  return fs.readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf-8');
}

function readElectronLifecycleSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src', 'hooks', 'app', 'useElectronLifecycleEffects.ts'),
    'utf-8',
  );
}

function readReleaseWorkflow(): string {
  return fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'release.yml'), 'utf-8');
}

function readPackageJson(): {
  build?: { nsis?: { allowToChangeInstallationDirectory?: boolean; installerHeader?: string | null } };
} {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as {
    build?: { nsis?: { allowToChangeInstallationDirectory?: boolean; installerHeader?: string | null } };
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

test('controlled cache root accepts current and legacy managed cache suffixes', () => {
  assert.equal(
    isControlledCacheRoot(String.raw`C:\Users\me\AppData\Local\Versora\Cache`),
    true,
  );
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
    cacheRoot: String.raw`D:\TempRoot\Versora\Cache`,
  });

  assert.match(content, /^version=1/m);
  assert.match(content, /^diffViewerMode=workbook-only/m);
  assert.match(content, /^cacheRoot=D:\\TempRoot\\Versora\\Cache/m);
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
  assert.match(script, /Function InstallerLocationPageCreate[\s\S]*Call NormalizeSelectedInstallDir/);
});

test('installer splits location and integration settings into compact custom pages', () => {
  const packageJson = readPackageJson();
  const script = readInstallerScript();

  assert.equal(packageJson.build?.nsis?.allowToChangeInstallationDirectory, false);
  assert.equal(packageJson.build?.nsis?.installerHeader, null);
  assert.match(script, /Page custom InstallerLocationPageCreate InstallerLocationPageLeave/);
  assert.match(script, /Page custom InstallerIntegrationPageCreate InstallerIntegrationPageLeave/);
  assert.match(script, /Function InstallerLocationPageCreate[\s\S]*CreateInstallerBrandRail "02 \/ 03"/);
  assert.match(script, /Function InstallerLocationPageCreate[\s\S]*\$\{NSD_CreateButton\} 84% 45u 12% 22u/);
  assert.match(script, /Function InstallerIntegrationPageCreate[\s\S]*CreateInstallerBrandRail "03 \/ 03"/);
  assert.match(script, /Function InstallerIntegrationPageCreate[\s\S]*\$\{NSD_CreateRadioButton\}/);
  assert.match(script, /Function InstallerIntegrationPageCreate[\s\S]*CreateInstallerCard 32% 138u 68% 92u/);
});

test('installer enlarges and anchors every native page without a header image gap', () => {
  const script = readInstallerScript();

  assert.match(script, /!define MUI_CUSTOMFUNCTION_GUIINIT InstallerGuiInit/);
  assert.match(script, /IntOp \$7 \$5 \* 500[\s\S]*IntOp \$8 \$6 \* 315/);
  assert.match(script, /SystemParametersInfo\(i0x30[\s\S]*IntOp \$5 \$5 - 40[\s\S]*IntOp \$6 \$6 - 40/);
  assert.match(script, /GetDlgItem \$0 \$HWNDPARENT 1018[\s\S]*\$InstallerWidthDelta \$InstallerHeightDelta/);
  assert.match(script, /GetDlgItem \$0 \$HWNDPARENT 1[\s\S]*\$InstallerWidthDelta \$InstallerHeightDelta 0 0/);
  assert.match(script, /CreateFont \$InstallerFontBody "Microsoft YaHei UI" "9" "400"/);
  assert.match(script, /CreateFont \$InstallerFontMono "Consolas" "9" "400"/);
  assert.match(script, /GetDlgItem \$0 \$HWNDPARENT 1037[\s\S]*0 -2 \$InstallerWidthDelta 8/);
  assert.match(script, /!define MUI_PAGE_CUSTOMFUNCTION_SHOW InstallerProgressPageShow/);
  assert.match(script, /Function InstallerProgressPageShow[\s\S]*GetDlgItem \$1 \$0 1004/);
});

test('installer consumes generated app-aligned theme and branded panel assets', () => {
  const script = readInstallerScript();
  const theme = fs.readFileSync(path.join(process.cwd(), 'build', 'installer-theme.nsh'), 'utf-8');
  const panelPath = path.join(process.cwd(), 'build', 'installerPanel.bmp');

  assert.match(script, /!include "\$\{BUILD_RESOURCES_DIR\}\\installer-theme\.nsh"/);
  assert.match(script, /File \/oname=\$PLUGINSDIR\\installerPanel\.bmp/);
  assert.match(theme, /!define COLOR_BG "F5F7FB"/);
  assert.match(theme, /!define COLOR_TEXT "09090B"/);
  assert.match(theme, /!define COLOR_ACCENT "3B82F6"/);
  assert.equal(fs.statSync(panelPath).size > 100_000, true);
});

test('installer script keeps upgrade installs in the existing install directory', () => {
  const script = readInstallerScript();

  assert.match(script, /StrCpy \$IsUpgradeInstall "1"\s+StrCpy \$INSTDIR \$ExistingInstallDir/);
});

test('installer script waits for post-install maintenance before relaunching after update', () => {
  const script = readInstallerScript();

  assert.match(script, /StrCpy \$launchLink "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"/);
  assert.match(script, /ExecWait '"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" "--maintenance=post-install"' \$0/);
  assert.match(script, /SetDetailsPrint textonly\s+DetailPrint "\$\(INSTALL_PROGRESS_FINALIZING\)"/);
  assert.match(script, /\$\{If\} \$0 != 0[\s\S]*SetErrorLevel 2\s+Abort/);
});

test('installer gives app and helper processes time to close before retrying with a forceful process-tree cleanup', () => {
  const script = readInstallerScript();

  assert.match(script, /!macro customCheckAppRunning/);
  assert.match(script, /versora_close_graceful_wait:[\s\S]*Sleep 250[\s\S]*\$R3 < 16/);
  assert.match(script, /versora_close_force:[\s\S]*KILL_PROCESS "\$\{APP_EXECUTABLE_FILENAME\}" 1/);
  assert.match(script, /taskkill \/F \/T \/IM "\$\{APP_EXECUTABLE_FILENAME\}"/);
  assert.match(script, /versora_close_force_wait:[\s\S]*Sleep 500[\s\S]*\$R3 < 20/);
  assert.match(script, /INSTALL_CLOSE_FAILED[\s\S]*IDRETRY versora_close_force/);
});

test('in-app updates open the visible installer and never force an automatic relaunch', () => {
  const source = readWindowsUpdaterSource();

  assert.match(source, /autoUpdater\.autoRunAppAfterInstall = false;/);
  assert.match(source, /autoUpdater\.quitAndInstall\(false, false\);/);
  assert.doesNotMatch(source, /autoUpdater\.quitAndInstall\(true, true\);/);
});

test('every packaged app startup checks for updates once from the main process', () => {
  const mainSource = readElectronMainSource();
  const updaterSource = readWindowsUpdaterSource();
  const lifecycleSource = readElectronLifecycleSource();

  assert.match(
    mainSource,
    /updater\.initialize\(\);\s+createWindow\(\);\s+void updater\.checkForUpdates\(\{ manual: false \}\);/,
  );
  assert.doesNotMatch(updaterSource, /AUTO_CHECK_INTERVAL_MS|wasCheckedRecently/);
  assert.doesNotMatch(lifecycleSource, /checkForAppUpdate\?\.\(\{ manual: false \}\)/);
});

test('release workflow publishes commit notes for the in-app updater', () => {
  const workflow = readReleaseWorkflow();

  assert.match(workflow, /build-and-publish-win-release:[\s\S]*fetch-depth: 0/);
  assert.match(workflow, /git log \$range --no-merges --pretty=format:/);
  assert.match(workflow, /gh release edit \$currentTag --notes-file -/);
});

test('installer uses a visible manual-overwrite summary without double-confirming in-app updates', () => {
  const script = readInstallerScript();

  assert.match(script, /\$\{If\} \$IsUpgradeInstall == "1"\s+\$\{AndIf\} \$IsInAppUpdate == "1"\s+Abort/);
  assert.match(script, /\$\{GetOptions\} \$0 "--updated" \$1[\s\S]*StrCpy \$IsInAppUpdate "1"/);
  assert.match(script, /\$\{If\} \$IsUpgradeInstall == "1"[\s\S]*INSTALL_UPGRADE_TITLE/);
  assert.match(script, /!macro customInstallMode[\s\S]*StrCpy \$isForceMachineInstall "1"[\s\S]*StrCpy \$isForceCurrentInstall "1"/);
});

test('finish page requires an explicit choice before opening the app', () => {
  const script = readInstallerScript();

  assert.match(script, /Page custom InstallerFinishPageCreate InstallerFinishPageLeave/);
  assert.match(script, /Function InstallerFinishPageCreate[\s\S]*INSTALL_FINISH_AFTER_TITLE/);
  assert.match(script, /\$\{NSD_SetState\} \$InstallerFinishRunCheckbox \$\{BST_UNCHECKED\}/);
  assert.match(script, /ShowWindow \$InstallerFinishRunCheckbox \$\{SW_SHOW\}/);
  assert.match(script, /SetWindowPos\(p\$InstallerFinishRunCheckbox,p0/);
  assert.match(script, /Function InstallerFinishPageLeave[\s\S]*\$\{If\} \$0 == \$\{BST_CHECKED\}[\s\S]*Call StartApp/);
});

test('installer footer buttons use explicit equal-width right-aligned layout', () => {
  const script = readInstallerScript();

  assert.match(script, /Function InstallerLayoutFooterButtons/);
  assert.match(script, /IntOp \$R8 \$R8 \+ 20/);
  assert.match(script, /IntOp \$R4 \$R4 - 12[\s\S]*IntOp \$R3 \$R3 - 12/);
  assert.match(script, /GetDlgItem \$0 \$HWNDPARENT 2[\s\S]*SetWindowPos\(p\$0,p0,i\$R5/);
  assert.match(script, /Call InstallerLayoutFooterButtons/);
});

test('installer script leaves the install directory before overwrite cleanup removes it', () => {
  const script = readInstallerScript();

  assert.match(script, /SetOutPath "\$TEMP"\s+RMDir \/r "\$INSTDIR"/);
});
