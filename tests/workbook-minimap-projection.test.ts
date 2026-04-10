import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWorkbookMiniMapSearchState,
  buildWorkbookMiniMapBaseCacheKey,
  buildWorkbookMiniMapBaseState,
  resolveWorkbookMiniMapBaseState,
} from '../src/utils/workbook/workbookPanelHelpers';
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

test('buildWorkbookMiniMapBaseState keeps workbook minimap segment projection search-independent', () => {
  const frozenRow = createRow(10, 2, 'Frozen');
  const bodyRow = createRow(11, 3, 'Body');

  const result = buildWorkbookMiniMapBaseState({
    headerHeight: 24,
    compareMode: 'strict',
    frozenRows: [frozenRow],
    frozenRowsViewportIsOverflowing: false,
    frozenRowsViewportHeight: 24,
    items: [{ row: bodyRow }],
    visibleColumns: [],
    resolveRowHeight: () => 24,
    resolveItemEntry: (item) => ({
      tone: 'modify',
      tones: ['modify'],
      height: 48,
      lineIdxs: item.row.lineIdxs,
    }),
  });

  assert.deepEqual(result.value, [
    { tone: 'equal', height: 24, lineIdxs: [] },
    { tone: 'equal', tones: [], height: 24, lineIdxs: [10] },
    { tone: 'modify', tones: ['modify'], height: 48, lineIdxs: [11] },
  ]);
});

test('applyWorkbookMiniMapSearchState overlays search hits without recomputing minimap semantics', () => {
  const result = applyWorkbookMiniMapSearchState([
    { tone: 'equal', height: 24, lineIdxs: [10] },
    { tone: 'modify', tones: ['modify'], height: 48, lineIdxs: [11, 12] },
  ], new Set([12]), 11);

  assert.deepEqual(result, [
    { tone: 'equal', height: 24, searchHit: false, activeSearchHit: false },
    { tone: 'modify', tones: ['modify'], height: 48, searchHit: true, activeSearchHit: true },
  ]);
});

test('resolveWorkbookMiniMapBaseState reuses cached base projection for the same owner and semantic key', () => {
  const owner = [{ row: createRow(11, 3, 'Body') }];
  const frozenRows = [createRow(10, 2, 'Frozen')];
  const cacheKey = buildWorkbookMiniMapBaseCacheKey({
    scope: 'test-minimap-base:v1',
    headerHeight: 24,
    compareMode: 'strict',
    visibleColumns: [],
    frozenRows,
    frozenRowsViewportIsOverflowing: false,
    frozenRowsViewportHeight: 24,
  });

  const params = {
    cacheOwner: owner,
    cacheKey,
    headerHeight: 24,
    compareMode: 'strict' as const,
    frozenRows,
    frozenRowsViewportIsOverflowing: false,
    frozenRowsViewportHeight: 24,
    items: owner,
    visibleColumns: [],
    resolveRowHeight: () => 24,
    resolveItemEntry: () => ({
      tone: 'modify' as const,
      tones: ['modify' as const],
      height: 48,
      lineIdxs: [11],
    }),
  };

  const first = resolveWorkbookMiniMapBaseState(params);
  const second = resolveWorkbookMiniMapBaseState(params);

  assert.equal(first, second);
});

test('resolveWorkbookMiniMapBaseState keeps semantic cache keys isolated', () => {
  const owner = [{ row: createRow(11, 3, 'Body') }];
  const frozenRows = [createRow(10, 2, 'Frozen')];
  const shared = {
    cacheOwner: owner,
    headerHeight: 24,
    compareMode: 'strict' as const,
    frozenRows,
    frozenRowsViewportIsOverflowing: false,
    frozenRowsViewportHeight: 24,
    items: owner,
    visibleColumns: [],
    resolveRowHeight: () => 24,
    resolveItemEntry: () => ({
      tone: 'modify' as const,
      tones: ['modify' as const],
      height: 48,
      lineIdxs: [11],
    }),
  };

  const first = resolveWorkbookMiniMapBaseState({
    ...shared,
    cacheKey: buildWorkbookMiniMapBaseCacheKey({
      scope: 'test-minimap-base:v1',
      headerHeight: 24,
      compareMode: 'strict',
      visibleColumns: [],
      frozenRows,
      frozenRowsViewportIsOverflowing: false,
      frozenRowsViewportHeight: 24,
    }),
  });
  const second = resolveWorkbookMiniMapBaseState({
    ...shared,
    cacheKey: buildWorkbookMiniMapBaseCacheKey({
      scope: 'test-minimap-base:v1',
      headerHeight: 0,
      compareMode: 'strict',
      visibleColumns: [],
      frozenRows,
      frozenRowsViewportIsOverflowing: false,
      frozenRowsViewportHeight: 24,
    }),
  });

  assert.notEqual(first, second);
});
