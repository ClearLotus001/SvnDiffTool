import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { findAvailableE2EPort } from '../scripts/run-e2e';

test('E2E runner selects an available port and never reuses an unknown preview server', async () => {
  const port = await findAvailableE2EPort(49_180);
  const config = fs.readFileSync('playwright.config.ts', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.ok(port >= 49_180);
  assert.match(config, /workers: 4/);
  assert.match(config, /reuseExistingServer: false/);
  assert.equal(packageJson.scripts['test:e2e'], 'tsx scripts/run-e2e.ts');
});
