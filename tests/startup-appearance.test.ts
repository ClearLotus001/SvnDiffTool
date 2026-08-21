import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  getStartupPalette,
  readStartupAppearance,
} from '../electron/main/startupAppearance';

test('native and inline startup backgrounds match the renderer theme surfaces', () => {
  const indexSource = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

  assert.equal(getStartupPalette('dark').backgroundColor, '#08090d');
  assert.equal(getStartupPalette('light').backgroundColor, '#f5f7fb');
  assert.equal(getStartupPalette('hc').backgroundColor, '#000000');
  assert.match(indexSource, /dark: '#08090D'/);
  assert.match(indexSource, /light: '#F5F7FB'/);
  assert.match(indexSource, /var\(--boot-bg, #08090D\)/);
});

test('first launch uses the same dark fallback as renderer settings', () => {
  assert.equal(readStartupAppearance().themeKey, 'dark');
});
