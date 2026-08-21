import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve('.');
const RUNTIME_IDENTITY_FILES = [
  'package.json',
  'index.html',
  'electron/installerBootstrap.ts',
  'electron/main/windowManager.ts',
  'rust/src/bin/svn_diff_launcher.rs',
  'src/components/diff/CollapseJumpButton.tsx',
  'src/i18n/core.ts',
  'src/utils/app/settings.ts',
] as const;

test('Windows packaging and the SVN launcher use the same Versora executable name', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'),
  ) as {
    build?: {
      appId?: string;
      productName?: string;
      win?: { executableName?: string };
    };
  };
  const executableName = packageJson.build?.win?.executableName;
  const launcherSource = fs.readFileSync(
    path.join(REPO_ROOT, 'rust/src/bin/svn_diff_launcher.rs'),
    'utf-8',
  );
  const configuredLauncherName = launcherSource.match(
    /const APP_EXECUTABLE_NAME: &str = "([^"]+)";/,
  )?.[1];

  assert.equal(packageJson.build?.appId, 'com.versora.app');
  assert.equal(packageJson.build?.productName, 'Versora');
  assert.equal(executableName, 'Versora');
  assert.equal(configuredLauncherName, `${executableName}.exe`);
});

test('runtime identity files do not retain retired product identifiers', () => {
  const retiredIdentifiers = [
    ['Svn', 'Diff', 'Tool'].join(''),
    ['svn', 'excel', 'diff', 'tool'].join('-'),
    ['svn', 'diff', 'tool'].join('-'),
    ['com', 'svnexceldifftool', 'app'].join('.'),
  ].map((value) => value.toLowerCase());

  for (const relativePath of RUNTIME_IDENTITY_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8').toLowerCase();
    for (const retiredIdentifier of retiredIdentifiers) {
      assert.equal(
        source.includes(retiredIdentifier),
        false,
        `${relativePath} still contains ${retiredIdentifier}`,
      );
    }
  }
});
