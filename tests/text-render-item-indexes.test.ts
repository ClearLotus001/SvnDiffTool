import test from 'node:test';
import assert from 'node:assert/strict';

import type { RenderItem, SplitRenderItem, SplitRow } from '../src/types';
import {
  buildTextRenderItemIndexes,
  findNearestTextRenderItemIndex,
} from '../src/utils/diff/textRenderItemIndexes';

function createSplitRow(lineIdxs: number[]): SplitRow {
  return {
    left: null,
    right: null,
    lineIdx: lineIdxs[0] ?? -1,
    lineIdxs,
  };
}

test('buildTextRenderItemIndexes reuses cached indexes for the same items owner and cache key', () => {
  const items: RenderItem[] = [
    { kind: 'line', line: { type: 'equal', base: 'A', mine: 'A', baseLineNo: 1, mineLineNo: 1, baseCharSpans: null, mineCharSpans: null }, lineIdx: 1 },
    { kind: 'collapse', count: 2, blockId: 'b', hiddenStart: 0, hiddenEnd: 1, expandStep: 2, fromIdx: 2, toIdx: 3 },
  ];

  const first = buildTextRenderItemIndexes(items, {
    cacheKey: 'text:cache:a',
    getLineIdxs: (item) => item.kind === 'line' ? [item.lineIdx] : null,
  });
  const second = buildTextRenderItemIndexes(items, {
    cacheKey: 'text:cache:a',
    getLineIdxs: (item) => item.kind === 'line' ? [item.lineIdx] : null,
  });
  const differentKey = buildTextRenderItemIndexes(items, {
    cacheKey: 'text:cache:b',
    getLineIdxs: (item) => item.kind === 'line' ? [item.lineIdx] : null,
  });

  assert.equal(first, second);
  assert.notEqual(first, differentKey);
});

test('buildTextRenderItemIndexes collects exact and nearest indexes for unified items', () => {
  const items: RenderItem[] = [
    { kind: 'line', line: { type: 'equal', base: 'A', mine: 'A', baseLineNo: 1, mineLineNo: 1, baseCharSpans: null, mineCharSpans: null }, lineIdx: 1 },
    { kind: 'collapse', count: 2, blockId: 'b', hiddenStart: 0, hiddenEnd: 1, expandStep: 2, fromIdx: 2, toIdx: 3 },
    { kind: 'line', line: { type: 'equal', base: 'B', mine: 'B', baseLineNo: 4, mineLineNo: 4, baseCharSpans: null, mineCharSpans: null }, lineIdx: 4 },
  ];

  const indexes = buildTextRenderItemIndexes(items, {
    cacheKey: 'text:unified:v1',
    getLineIdxs: (item) => item.kind === 'line' ? [item.lineIdx] : null,
  });

  assert.equal(indexes.visibleItemIndexByLineIdx.get(1), 0);
  assert.equal(indexes.visibleItemIndexByLineIdx.get(4), 2);
  assert.equal(findNearestTextRenderItemIndex(indexes, 0), 0);
  assert.equal(findNearestTextRenderItemIndex(indexes, 2), 2);
  assert.equal(findNearestTextRenderItemIndex(indexes, 5), -1);
});

test('findNearestTextRenderItemIndex preserves first-match semantics for unordered split row ranges', () => {
  const items: SplitRenderItem[] = [
    { kind: 'split-line', row: createSplitRow([10]), lineIdx: 10 },
    { kind: 'split-line', row: createSplitRow([5, 6]), lineIdx: 5 },
  ];

  const indexes = buildTextRenderItemIndexes(items, {
    cacheKey: 'text:split:unordered:v1',
    getLineIdxs: (item) => item.kind === 'split-line' ? item.row.lineIdxs : null,
  });

  assert.equal(indexes.hasOrderedLineRanges, false);
  assert.equal(indexes.visibleItemIndexByLineIdx.get(10), 0);
  assert.equal(indexes.visibleItemIndexByLineIdx.get(6), 1);
  assert.equal(findNearestTextRenderItemIndex(indexes, 6), 0);
  assert.equal(findNearestTextRenderItemIndex(indexes, 11), -1);
});
