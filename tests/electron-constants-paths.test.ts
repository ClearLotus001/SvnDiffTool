import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { APP_ROOT, resolveElectronAppRoot } from '../electron/main/constants';

test('APP_ROOT resolves to repo root when constants are loaded from source layout', () => {
  assert.equal(APP_ROOT, process.cwd());
});

test('resolveElectronAppRoot supports source, build, and packaged bundle layouts', () => {
  const repoRoot = process.cwd();

  assert.equal(
    resolveElectronAppRoot(path.join(repoRoot, 'electron', 'main')),
    repoRoot,
  );

  assert.equal(
    resolveElectronAppRoot(path.join(repoRoot, 'dist-electron', 'electron', 'main')),
    repoRoot,
  );

  const packagedAppRoot = path.resolve('C:/mock/Versora/resources/app.asar');
  assert.equal(
    resolveElectronAppRoot(path.join(packagedAppRoot, 'dist-electron', 'electron', 'main')),
    packagedAppRoot,
  );
});
