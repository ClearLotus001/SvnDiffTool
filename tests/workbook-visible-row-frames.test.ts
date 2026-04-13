import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkbookSectionRowIndexByKey,
  buildWorkbookVisibleRowFramesCacheKey,
  collectWorkbookRowFramesByKey,
  resolveWorkbookVisibleRowFrames,
} from '../src/utils/workbook/workbookVisibleRowFrames';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

function createRow(lineIdx: number, rowNumber: number, value: string) {
  return {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(rowNumber, [value]),
      mine: createWorkbookRowLine(rowNumber, [value]),
      baseLineNo: rowNumber,
      mineLineNo: rowNumber,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(rowNumber, [value]),
      mine: createWorkbookRowLine(rowNumber, [value]),
      baseLineNo: rowNumber,
      mineLineNo: rowNumber,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx,
    lineIdxs: [lineIdx],
  };
}

test('buildWorkbookSectionRowIndexByKey reuses cached row index for the same section rows owner', () => {
  const rows = [
    createRow(10, 2, 'A'),
    createRow(11, 3, 'B'),
  ];

  const first = buildWorkbookSectionRowIndexByKey(rows);
  const second = buildWorkbookSectionRowIndexByKey(rows);

  assert.equal(first, second);
  assert.deepEqual([...first.entries()], [
    ['10', 0],
    ['11', 1],
  ]);
});

test('collectWorkbookRowFramesByKey reuses cached row frames for the same items owner and cache key', () => {
  const items = [
    { row: createRow(10, 2, 'A'), height: 24 },
    { row: createRow(11, 3, 'B'), height: 36 },
  ];

  const first = collectWorkbookRowFramesByKey(items, {
    getRowKey: (item) => item.row.lineIdxs.join(':'),
    getItemHeight: (item) => item.height,
    cacheKey: 'visible-row-frames:test',
  });
  const second = collectWorkbookRowFramesByKey(items, {
    getRowKey: (item) => item.row.lineIdxs.join(':'),
    getItemHeight: (item) => item.height,
    cacheKey: 'visible-row-frames:test',
  });

  assert.equal(first, second);
  assert.deepEqual([...first.values()], [
    { top: 0, height: 24 },
    { top: 24, height: 36 },
  ]);
});

test('buildWorkbookVisibleRowFramesCacheKey keeps source map identities and offsets isolated', () => {
  const framesA = new Map([['10', { top: 0, height: 24 }]]);
  const framesB = new Map([['10', { top: 0, height: 24 }]]);

  const keyA = buildWorkbookVisibleRowFramesCacheKey([
    { framesByKey: framesA, topOffset: 24 },
  ]);
  const keyB = buildWorkbookVisibleRowFramesCacheKey([
    { framesByKey: framesA, topOffset: 48 },
  ]);
  const keyC = buildWorkbookVisibleRowFramesCacheKey([
    { framesByKey: framesB, topOffset: 24 },
  ]);

  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyC);
});

test('resolveWorkbookVisibleRowFrames reuses cached projected frames for the same section rows and sources', () => {
  const rows = [
    createRow(10, 2, 'A'),
    createRow(11, 3, 'B'),
  ];
  const frozenFrames = new Map([
    ['10', { top: 0, height: 24 }],
  ]);
  const bodyFrames = new Map([
    ['11', { top: 24, height: 24 }],
  ]);

  const first = resolveWorkbookVisibleRowFrames(rows, [
    { framesByKey: frozenFrames, topOffset: 24 },
    { framesByKey: bodyFrames, topOffset: 90 },
  ]);
  const second = resolveWorkbookVisibleRowFrames(rows, [
    { framesByKey: frozenFrames, topOffset: 24 },
    { framesByKey: bodyFrames, topOffset: 90 },
  ]);

  assert.equal(first, second);
  assert.deepEqual([...first.entries()], [
    [0, { top: 24, height: 24 }],
    [1, { top: 114, height: 24 }],
  ]);
});
