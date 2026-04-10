import test from 'node:test';
import assert from 'node:assert/strict';

import { workbookBytesToText } from '../src/utils/diff/diffSource';

test('workbookBytesToText localizes unsupported workbook format errors by locale', () => {
  const bytes = new Uint8Array([0x50, 0x4b]);

  const english = workbookBytesToText(bytes, 'legacy.xls', 'en-US');
  const chinese = workbookBytesToText(bytes, 'legacy.xls', 'zh-CN');

  assert.match(english, /Unsupported workbook format: \.xls/);
  assert.doesNotMatch(english, /不支持的工作簿格式/);

  assert.match(chinese, /不支持的工作簿格式：\.xls/);
  assert.doesNotMatch(chinese, /Unsupported workbook format/);
});
