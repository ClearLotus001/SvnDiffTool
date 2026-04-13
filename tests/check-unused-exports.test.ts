import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { analyzeUnusedExports } from '../scripts/check-unused-exports';

test('analyzeUnusedExports reports stale allowlist entries separately from real unused exports', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-exports-audit-'));
  const srcDir = path.join(tempDir, 'src');
  const testsDir = path.join(tempDir, 'tests');
  const allowlistPath = path.join(tempDir, 'allowlist.txt');

  try {
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'values.ts'),
      [
        'export const liveValue = 1;',
        'export const deadValue = 2;',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(srcDir, 'consumer.ts'),
      [
        "import { liveValue } from './values';",
        'export const seenValue = liveValue;',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(testsDir, 'consumer.test.ts'),
      "import { seenValue } from '../src/consumer';\nvoid seenValue;\n",
      'utf8',
    );
    fs.writeFileSync(
      allowlistPath,
      [
        'src/values.ts::liveValue',
        'src/values.ts::ghostValue',
      ].join('\n'),
      'utf8',
    );

    const result = analyzeUnusedExports({
      repoRoot: tempDir,
      exportTargetDirs: ['src'],
      consumerDirs: ['src', 'tests'],
      entryPoints: [],
      allowlistPath,
    });

    assert.deepEqual(
      result.unusedExports.map((issue) => issue.id),
      ['src/values.ts::deadValue'],
    );
    assert.deepEqual(result.staleAllowlistEntries, [
      'src/values.ts::ghostValue',
      'src/values.ts::liveValue',
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
