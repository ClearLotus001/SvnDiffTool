import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSplitSelectionBarEntries,
  buildUnifiedSelectionBarEntries,
} from '../src/utils/diff/selectionBarEntries';
import type { RenderItem, SplitRenderItem } from '../src/types';

test('buildUnifiedSelectionBarEntries marks selection, active search, replacement pairs and collapses with expected weights', () => {
  const items: RenderItem[] = [
    {
      kind: 'line',
      lineIdx: 0,
      line: {
        type: 'equal',
        base: 'a',
        mine: 'a',
        baseLineNo: 1,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      },
    },
    {
      kind: 'line',
      lineIdx: 1,
      line: {
        type: 'delete',
        base: 'b',
        mine: null,
        baseLineNo: 2,
        mineLineNo: null,
        baseCharSpans: null,
        mineCharSpans: null,
      },
    },
    {
      kind: 'collapse',
      blockId: 'c',
      count: 10,
      hiddenStart: 0,
      hiddenEnd: 9,
      expandStep: 3,
      fromIdx: 2,
      toIdx: 4,
    },
  ];

  const result = buildUnifiedSelectionBarEntries(
    items,
    { anchorLineIdx: 3, focusLineIdx: 3 },
    1,
    new Map([[1, 2]]),
  );

  assert.deepEqual(result, [
    { topOffset: 0, height: 24, selected: false, weight: 8 },
    { topOffset: 24, height: 24, selected: false, weight: 90 },
    { topOffset: 48, height: 24, selected: true, weight: 140 },
  ]);
});

test('buildSplitSelectionBarEntries uses row spans, item heights and collapse intersections', () => {
  const items: SplitRenderItem[] = [
    {
      kind: 'split-line',
      lineIdx: 0,
      row: {
        lineIdx: 0,
        lineIdxs: [0, 1],
        left: {
          type: 'equal',
          base: 'a',
          mine: 'a',
          baseLineNo: 1,
          mineLineNo: 1,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        right: {
          type: 'equal',
          base: 'a',
          mine: 'a',
          baseLineNo: 1,
          mineLineNo: 1,
          baseCharSpans: null,
          mineCharSpans: null,
        },
      },
    },
    {
      kind: 'split-collapse',
      blockId: 'c',
      count: 5,
      hiddenStart: 0,
      hiddenEnd: 4,
      expandStep: 2,
      fromIdx: 2,
      toIdx: 4,
    },
    {
      kind: 'split-line',
      lineIdx: 5,
      row: {
        lineIdx: 5,
        lineIdxs: [5],
        left: {
          type: 'delete',
          base: 'x',
          mine: null,
          baseLineNo: 6,
          mineLineNo: null,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        right: null,
        isReplacementPair: false,
      },
    },
  ];

  const result = buildSplitSelectionBarEntries(
    items,
    [0, 24, 48],
    [24, 24, 40],
    { anchorLineIdx: 2, focusLineIdx: 2 },
    5,
  );

  assert.deepEqual(result, [
    { topOffset: 0, height: 24, selected: false, weight: 8 },
    { topOffset: 24, height: 24, selected: true, weight: 140 },
    { topOffset: 48, height: 40, selected: false, weight: 90 },
  ]);
});
