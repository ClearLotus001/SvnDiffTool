import test from 'node:test';
import assert from 'node:assert/strict';

import {
  layoutWorkbookCanvasTextLines,
  splitWorkbookCanvasTextLines,
} from '../src/utils/workbook/workbookCanvasText';

test('splitWorkbookCanvasTextLines restores slash-normalized workbook line breaks', () => {
  assert.deepEqual(
    splitWorkbookCanvasTextLines('六人 个人竞速单局 / 我们恋爱吧 / 全魔法套装+A车'),
    ['六人 个人竞速单局', '我们恋爱吧', '全魔法套装+A车'],
  );
});

test('layoutWorkbookCanvasTextLines wraps long workbook text by visible width', () => {
  const lines = layoutWorkbookCanvasTextLines({
    value: 'ABCDEFGHIJ',
    maxWidth: 30,
    maxLines: 4,
    measureText: (value) => value.length * 10,
  });

  assert.deepEqual(lines, ['ABC', 'DEF', 'GHI', 'J']);
});

test('layoutWorkbookCanvasTextLines truncates overflow with ellipsis when max lines are exhausted', () => {
  const lines = layoutWorkbookCanvasTextLines({
    value: '第一行 / 第二行 / 第三行 / 第四行',
    maxWidth: 200,
    maxLines: 3,
    measureText: (value) => value.length * 10,
  });

  assert.deepEqual(lines, ['第一行', '第二行', '第三行…']);
});
