import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isWorkbookCanvasTextTruncated,
  layoutWorkbookCanvasTextLines,
  splitWorkbookCanvasTextLines,
} from '../src/utils/workbook/workbookCanvasText';

test('splitWorkbookCanvasTextLines restores slash-normalized workbook line breaks', () => {
  assert.deepEqual(
    splitWorkbookCanvasTextLines('六人 个人竞速单局 / 我们恋爱吧 / 全魔法套装+A车'),
    ['六人 个人竞速单局', '我们恋爱吧', '全魔法套装+A车'],
  );
});

test('isWorkbookCanvasTextTruncated only flags text that exceeds the visible cell area', () => {
  const measureText = (value: string) => value.length * 10;
  assert.equal(isWorkbookCanvasTextTruncated({
    value: 'short',
    maxWidth: 60,
    measureText,
  }), false);
  assert.equal(isWorkbookCanvasTextTruncated({
    value: 'a much longer description',
    maxWidth: 60,
    measureText,
  }), true);
  assert.equal(isWorkbookCanvasTextTruncated({
    value: '第一行 / 第二行 / 第三行',
    maxWidth: 100,
    maxLines: 2,
    wrapText: true,
    measureText,
  }), true);
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

test('layoutWorkbookCanvasTextLines bounds measurements for very long merged-cell text', () => {
  let measurementCount = 0;
  const lines = layoutWorkbookCanvasTextLines({
    value: 'X'.repeat(50_000),
    maxWidth: 30,
    maxLines: 2,
    measureText: (value) => {
      measurementCount += 1;
      return value.length * 10;
    },
  });

  assert.deepEqual(lines, ['XXX', 'XX…']);
  assert.ok(measurementCount < 100);
});
