import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function sortKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function assertStringValues(value: Record<string, unknown>, label: string): void {
  const invalidEntries = Object.entries(value).filter(([, entry]) => typeof entry !== 'string');
  assert.deepEqual(invalidEntries, [], `${label} should only contain string messages`);
}

test('renderer locale resources expose identical keys across languages', () => {
  const rendererZh = readJson(path.join(process.cwd(), 'src', 'locales', 'zh-CN.json'));
  const rendererEn = readJson(path.join(process.cwd(), 'src', 'locales', 'en-US.json'));

  assertStringValues(rendererZh, 'renderer zh-CN locale');
  assertStringValues(rendererEn, 'renderer en-US locale');
  assert.deepEqual(sortKeys(rendererZh), sortKeys(rendererEn));
});

test('electron locale resources expose identical keys across languages', () => {
  const electronZh = readJson(path.join(process.cwd(), 'electron', 'locales', 'zh-CN.json'));
  const electronEn = readJson(path.join(process.cwd(), 'electron', 'locales', 'en-US.json'));

  assertStringValues(electronZh, 'electron zh-CN locale');
  assertStringValues(electronEn, 'electron en-US locale');
  assert.deepEqual(sortKeys(electronZh), sortKeys(electronEn));
});
