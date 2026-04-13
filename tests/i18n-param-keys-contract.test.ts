import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RENDERER_TRANSLATION_PARAM_KEYS } from '@/i18n/paramKeys';
import { ELECTRON_TRANSLATION_PARAM_KEYS } from '../electron/i18nParamKeys';
import { collectPlaceholderMap } from '../shared/i18n/common';

function readMessages(filePath: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
}

test('renderer translation param map stays in sync with locale placeholders', () => {
  const enUS = collectPlaceholderMap(readMessages(path.join(process.cwd(), 'src', 'locales', 'en-US.json')));
  const zhCN = collectPlaceholderMap(readMessages(path.join(process.cwd(), 'src', 'locales', 'zh-CN.json')));

  assert.deepEqual(enUS, RENDERER_TRANSLATION_PARAM_KEYS);
  assert.deepEqual(zhCN, RENDERER_TRANSLATION_PARAM_KEYS);
});

test('electron translation param map stays in sync with locale placeholders', () => {
  const enUS = collectPlaceholderMap(readMessages(path.join(process.cwd(), 'electron', 'locales', 'en-US.json')));
  const zhCN = collectPlaceholderMap(readMessages(path.join(process.cwd(), 'electron', 'locales', 'zh-CN.json')));

  assert.deepEqual(enUS, ELECTRON_TRANSLATION_PARAM_KEYS);
  assert.deepEqual(zhCN, ELECTRON_TRANSLATION_PARAM_KEYS);
});
