import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const testsDir = path.join(repoRoot, 'tests');
const rustRequiredTests = new Set([
  'analysis-snapshot-service.test.ts',
  'local-diff-follow-up-loaders.test.ts',
]);
const skipRustRequired = process.argv.includes('--skip-rust-required');
const testFiles = readdirSync(testsDir)
  .filter((fileName) => /\.test\.tsx?$/.test(fileName))
  .filter((fileName) => !skipRustRequired || !rustRequiredTests.has(fileName))
  .sort()
  .map((fileName) => path.join('tests', fileName));

if (testFiles.length === 0) {
  console.error('No workbook test files matched.');
  process.exit(1);
}

const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const result = spawnSync(process.execPath, [tsxCliPath, '--test', ...testFiles], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.error) {
  console.error(`Failed to run ${tsxCliPath}.`);
  console.error(result.error.message);
  process.exit(1);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.signal) {
  console.error(`Workbook tests were terminated by signal ${result.signal}.`);
}

process.exit(1);
