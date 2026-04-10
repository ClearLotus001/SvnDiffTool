import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function collectSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

test('renderer source does not branch UI copy directly on locale', () => {
  const roots = [
    path.join(process.cwd(), 'src', 'components'),
    path.join(process.cwd(), 'src', 'hooks'),
  ];

  const violations = roots
    .flatMap(collectSourceFiles)
    .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('locale ==='));

  assert.deepEqual(violations, []);
});
