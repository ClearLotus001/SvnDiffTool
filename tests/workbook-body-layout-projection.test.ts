import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import { ROW_H } from '../src/hooks/virtualization/useVirtual';
import {
  buildWorkbookGroupedBodyLayoutBase,
  buildWorkbookLinearBodyLayoutBase,
  mapWorkbookProjectedBodyRows,
} from '../src/utils/workbook/workbookBodyLayoutProjection';
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

test('buildWorkbookLinearBodyLayoutBase caches base row-frame projection by items owner and range', () => {
  const rowA = createRow(10, 2, 'A');
  const rowB = createRow(11, 3, 'B');
  const items = [
    { kind: 'split-line' as const, row: rowA },
    { kind: 'split-line' as const, row: rowB },
  ];

  const first = buildWorkbookLinearBodyLayoutBase({
    items,
    startIdx: 0,
    endIdx: items.length,
    cacheKey: 'linear:test:0:2',
    resolveItemKind: () => 'row',
    resolveItemHeight: () => ROW_H,
    resolveRow: (item) => item.row,
    buildStaticRow: (item) => ({ row: item.row }),
  });
  const second = buildWorkbookLinearBodyLayoutBase({
    items,
    startIdx: 0,
    endIdx: items.length,
    cacheKey: 'linear:test:0:2',
    resolveItemKind: () => 'row',
    resolveItemHeight: () => ROW_H,
    resolveRow: (item) => item.row,
    buildStaticRow: (item) => ({ row: item.row }),
  });

  assert.equal(first, second);
  assert.deepEqual([...first.rowFramesByKey.values()], [
    { top: 0, height: ROW_H },
    { top: ROW_H, height: ROW_H },
  ]);
});

test('buildWorkbookGroupedBodyLayoutBase caches grouped row frames with per-row heights', () => {
  const rowA = createRow(10, 2, 'A');
  const rowB = createRow(11, 3, 'B');
  const items = [{
    kind: 'rows' as const,
    height: ROW_H * 3,
    rows: [
      { row: rowA, height: ROW_H, sourceItemIndex: 0 },
      { row: rowB, height: ROW_H * 2, sourceItemIndex: 1 },
    ],
  }];

  const first = buildWorkbookGroupedBodyLayoutBase({
    items,
    startIdx: 0,
    endIdx: items.length,
    cacheKey: 'grouped:test:0:1',
    resolveItemKind: (item) => item.kind,
    resolveItemHeight: (item) => item.height,
    resolveRows: (item) => item.rows.map((row) => ({
      ...row,
      staticRow: row,
    })),
  });
  const second = buildWorkbookGroupedBodyLayoutBase({
    items,
    startIdx: 0,
    endIdx: items.length,
    cacheKey: 'grouped:test:0:1',
    resolveItemKind: (item) => item.kind,
    resolveItemHeight: (item) => item.height,
    resolveRows: (item) => item.rows.map((row) => ({
      ...row,
      staticRow: row,
    })),
  });

  assert.equal(first, second);
  assert.deepEqual([...first.rowFramesByKey.values()], [
    { top: 0, height: ROW_H },
    { top: ROW_H, height: ROW_H * 2 },
  ]);
});

test('mapWorkbookProjectedBodyRows decorates search and guided boundaries from source rows', () => {
  const rowA = createRow(10, 2, 'A');
  const rowB = createRow(11, 3, 'B');
  const sourceItems = [
    { kind: 'row' as const, row: rowA },
    { kind: 'row' as const, row: rowB },
  ];
  const decorated = mapWorkbookProjectedBodyRows<
    (typeof sourceItems)[number],
    { row: typeof rowA },
    {
      row: SplitRow;
      isSearchMatch: boolean;
      isActiveSearch: boolean;
      isGuided: boolean;
      isGuidedStart: boolean;
      isGuidedEnd: boolean;
    }
  >({
    rows: [
      {
        row: rowA,
        height: ROW_H,
        sourceItemIndex: 0,
        staticRow: { row: rowA },
      },
      {
        row: rowB,
        height: ROW_H,
        sourceItemIndex: 1,
        staticRow: { row: rowB },
      },
    ],
    sourceItems,
    resolveSourceRow: (item) => item.row,
    guidedHunkRange: { startIdx: 10, endIdx: 11, addCount: 0, delCount: 0 },
    activeSearchLineIdx: 11,
    searchMatchSet: new Set([10, 11]),
    decorateRow: (entry, state) => ({
      row: entry.row,
      ...state,
    }),
  });

  assert.deepEqual(decorated.map((row) => ({
    isSearchMatch: row.isSearchMatch,
    isActiveSearch: row.isActiveSearch,
    isGuided: row.isGuided,
    isGuidedStart: row.isGuidedStart,
    isGuidedEnd: row.isGuidedEnd,
  })), [
    {
      isSearchMatch: true,
      isActiveSearch: false,
      isGuided: true,
      isGuidedStart: true,
      isGuidedEnd: false,
    },
    {
      isSearchMatch: true,
      isActiveSearch: true,
      isGuided: true,
      isGuidedStart: false,
      isGuidedEnd: true,
    },
  ]);
});
