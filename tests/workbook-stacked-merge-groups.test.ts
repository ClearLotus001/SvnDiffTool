import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedMergeCoverageWindows,
  buildWorkbookStackedVisualGroups,
  mergeWorkbookStackedCoverageWindows,
} from '../src/utils/workbook/workbookStackedMergeGroups';

function buildSplitRow(params: {
  lineIdx: number;
  baseRowNumber?: number;
  mineRowNumber?: number;
}): SplitRow {
  const { lineIdx, baseRowNumber, mineRowNumber } = params;

  return {
    left: baseRowNumber == null ? null : {
      type: 'delete',
      base: `@@row\t${baseRowNumber}\tB${baseRowNumber}`,
      mine: null,
      baseLineNo: baseRowNumber,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: mineRowNumber == null ? null : {
      type: 'add',
      base: null,
      mine: `@@row\t${mineRowNumber}\tM${mineRowNumber}`,
      baseLineNo: null,
      mineLineNo: mineRowNumber,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx,
    lineIdxs: [lineIdx],
  };
}

test('buildWorkbookStackedMergeCoverageWindows expands a base-side vertical merge across intervening split rows', () => {
  const layoutRows = buildWorkbookStackedLayoutRows({
    rows: [
      { row: buildSplitRow({ lineIdx: 1, baseRowNumber: 28 }), renderMode: 'single-base', height: 24 },
      { row: buildSplitRow({ lineIdx: 2, mineRowNumber: 99 }), renderMode: 'single-mine', height: 24 },
      { row: buildSplitRow({ lineIdx: 3, baseRowNumber: 29 }), renderMode: 'single-base', height: 24 },
    ],
  });

  const windows = buildWorkbookStackedMergeCoverageWindows({
    rows: layoutRows,
    baseMergeRanges: [{ startRow: 28, endRow: 29, startCol: 0, endCol: 0 }],
    mineMergeRanges: [],
  });

  assert.deepEqual(windows, [{
    key: 'base:28:29:0:0',
    side: 'base',
    range: { startRow: 28, endRow: 29, startCol: 0, endCol: 0 },
    startIndex: 0,
    endIndex: 2,
  }]);
});

test('mergeWorkbookStackedCoverageWindows merges overlapping side coverage windows into one visual window', () => {
  const merged = mergeWorkbookStackedCoverageWindows([
    {
      key: 'base:28:29:0:0',
      side: 'base',
      range: { startRow: 28, endRow: 29, startCol: 0, endCol: 0 },
      startIndex: 1,
      endIndex: 3,
    },
    {
      key: 'mine:28:29:0:0',
      side: 'mine',
      range: { startRow: 28, endRow: 29, startCol: 0, endCol: 0 },
      startIndex: 2,
      endIndex: 4,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.startIndex, 1);
  assert.equal(merged[0]?.endIndex, 4);
  assert.equal(merged[0]?.windows.length, 2);
});

test('buildWorkbookStackedVisualGroups splits plain rows around merge coverage windows', () => {
  const layoutRows = buildWorkbookStackedLayoutRows({
    rows: [
      { row: buildSplitRow({ lineIdx: 1, baseRowNumber: 27 }), renderMode: 'single-base', height: 24 },
      { row: buildSplitRow({ lineIdx: 2, baseRowNumber: 28 }), renderMode: 'single-base', height: 24 },
      { row: buildSplitRow({ lineIdx: 3, mineRowNumber: 99 }), renderMode: 'single-mine', height: 24 },
      { row: buildSplitRow({ lineIdx: 4, baseRowNumber: 29 }), renderMode: 'single-base', height: 24 },
      { row: buildSplitRow({ lineIdx: 5, baseRowNumber: 30 }), renderMode: 'single-base', height: 24 },
    ],
  });

  const groups = buildWorkbookStackedVisualGroups({
    rows: layoutRows,
    baseMergeRanges: [{ startRow: 28, endRow: 29, startCol: 0, endCol: 0 }],
    mineMergeRanges: [],
  });

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => ({
    reason: group.reason,
    startIndex: group.startIndex,
    endIndex: group.endIndex,
  })), [
    { reason: 'plain', startIndex: 0, endIndex: 0 },
    { reason: 'merge', startIndex: 1, endIndex: 3 },
    { reason: 'plain', startIndex: 4, endIndex: 4 },
  ]);
  assert.equal(groups[1]?.baseTrack.length, 2);
  assert.equal(groups[1]?.mineTrack.length, 1);
});

test('buildWorkbookStackedVisualGroups chunks large plain row runs to keep stacked virtualization granular', () => {
  const layoutRows = buildWorkbookStackedLayoutRows({
    rows: Array.from({ length: 600 }, (_, index) => ({
      row: buildSplitRow({ lineIdx: index + 1, baseRowNumber: index + 1 }),
      renderMode: 'single-base' as const,
      height: 24,
    })),
  });

  const groups = buildWorkbookStackedVisualGroups({
    rows: layoutRows,
    baseMergeRanges: [],
    mineMergeRanges: [],
  });

  assert.deepEqual(groups.map((group) => ({
    reason: group.reason,
    startIndex: group.startIndex,
    endIndex: group.endIndex,
  })), [
    { reason: 'plain', startIndex: 0, endIndex: 63 },
    { reason: 'plain', startIndex: 64, endIndex: 127 },
    { reason: 'plain', startIndex: 128, endIndex: 191 },
    { reason: 'plain', startIndex: 192, endIndex: 255 },
    { reason: 'plain', startIndex: 256, endIndex: 319 },
    { reason: 'plain', startIndex: 320, endIndex: 383 },
    { reason: 'plain', startIndex: 384, endIndex: 447 },
    { reason: 'plain', startIndex: 448, endIndex: 511 },
    { reason: 'plain', startIndex: 512, endIndex: 575 },
    { reason: 'plain', startIndex: 576, endIndex: 599 },
  ]);
});

test('buildWorkbookStackedVisualGroups uses rendered row height when chunking double stacked rows', () => {
  const layoutRows = buildWorkbookStackedLayoutRows({
    rows: Array.from({ length: 70 }, (_, index) => ({
      row: buildSplitRow({ lineIdx: index + 1, baseRowNumber: index + 1, mineRowNumber: index + 1 }),
      renderMode: 'double' as const,
      height: 48,
    })),
  });

  const groups = buildWorkbookStackedVisualGroups({
    rows: layoutRows,
    baseMergeRanges: [],
    mineMergeRanges: [],
  });

  assert.deepEqual(groups.map((group) => ({
    reason: group.reason,
    startIndex: group.startIndex,
    endIndex: group.endIndex,
    height: group.rows.reduce((sum, row) => sum + row.height, 0),
  })), [
    { reason: 'plain', startIndex: 0, endIndex: 31, height: 1536 },
    { reason: 'plain', startIndex: 32, endIndex: 63, height: 1536 },
    { reason: 'plain', startIndex: 64, endIndex: 69, height: 288 },
  ]);
});
