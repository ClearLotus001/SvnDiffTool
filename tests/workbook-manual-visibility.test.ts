import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkbookHiddenColumnSegments,
  overlayHiddenWorkbookRowsOnItems,
  revealWorkbookSelection,
  splitWorkbookRowsByVisibility,
} from '../src/utils/workbook/workbookManualVisibility';
import { buildCollapsedItems, buildCollapsibleRowBlocks } from '../src/utils/collapse/collapsibleRows';

test('splitWorkbookRowsByVisibility preserves visible and hidden row runs', () => {
  const rows = [
    { lineIdx: 1, rowNumber: 2 },
    { lineIdx: 2, rowNumber: 3 },
    { lineIdx: 3, rowNumber: 4 },
    { lineIdx: 4, rowNumber: 5 },
  ];

  const segments = splitWorkbookRowsByVisibility(
    rows,
    new Set([3, 4]),
    (row) => row.rowNumber,
  );

  assert.deepEqual(
    segments.map((segment) => ({ kind: segment.kind, rowNumbers: segment.rowNumbers })),
    [
      { kind: 'visible', rowNumbers: [2] },
      { kind: 'hidden', rowNumbers: [3, 4] },
      { kind: 'visible', rowNumbers: [5] },
    ],
  );
});

test('buildWorkbookHiddenColumnSegments groups contiguous hidden positions and preserves concrete columns', () => {
  const segments = buildWorkbookHiddenColumnSegments([0, 1, 3, 4, 6], [1, 3, 4]);

  assert.deepEqual(segments, [
    {
      startCol: 1,
      endCol: 4,
      columns: [1, 3, 4],
      count: 3,
      beforeColumn: 0,
      afterColumn: 6,
    },
  ]);
});

test('revealWorkbookSelection unhides the selected row and column anchor', () => {
  const next = revealWorkbookSelection({
    Items: {
      hiddenRows: [5],
      hiddenColumns: [2],
    },
  }, {
    kind: 'cell',
    sheetName: 'Items',
    side: 'base',
    versionLabel: 'BASE',
    rowNumber: 5,
    colIndex: 2,
    colLabel: 'C',
    address: 'C5',
    value: '',
    formula: '',
  });

  assert.deepEqual(next, {});
});

test('overlayHiddenWorkbookRowsOnItems preserves collapse boundaries when hidden rows remove intervening changed rows', () => {
  const rows = [
    { lineIdx: 1, rowNumber: 1, equal: true, label: 'eq-1' },
    { lineIdx: 2, rowNumber: 2, equal: true, label: 'eq-2' },
    { lineIdx: 3, rowNumber: 3, equal: true, label: 'eq-3' },
    { lineIdx: 4, rowNumber: 4, equal: true, label: 'eq-4' },
    { lineIdx: 5, rowNumber: 5, equal: false, label: 'chg-5' },
    { lineIdx: 6, rowNumber: 6, equal: false, label: 'chg-6' },
    { lineIdx: 7, rowNumber: 7, equal: false, label: 'chg-7' },
    { lineIdx: 8, rowNumber: 8, equal: true, label: 'eq-8' },
    { lineIdx: 9, rowNumber: 9, equal: true, label: 'eq-9' },
    { lineIdx: 10, rowNumber: 10, equal: true, label: 'eq-10' },
    { lineIdx: 11, rowNumber: 11, equal: true, label: 'eq-11' },
    { lineIdx: 12, rowNumber: 12, equal: true, label: 'eq-12' },
    { lineIdx: 13, rowNumber: 13, equal: true, label: 'eq-13' },
    { lineIdx: 14, rowNumber: 14, equal: true, label: 'eq-14' },
    { lineIdx: 15, rowNumber: 15, equal: true, label: 'eq-15' },
    { lineIdx: 16, rowNumber: 16, equal: true, label: 'eq-16' },
    { lineIdx: 17, rowNumber: 17, equal: true, label: 'eq-17' },
    { lineIdx: 18, rowNumber: 18, equal: true, label: 'eq-18' },
    { lineIdx: 19, rowNumber: 19, equal: true, label: 'eq-19' },
    { lineIdx: 20, rowNumber: 20, equal: true, label: 'eq-20' },
  ];

  const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
  const initialItems = buildCollapsedItems(blocks, true, {}, {
    contextLines: 2,
    blockPrefix: 'manual-hide',
    buildRowItem: (row) => ({ kind: 'row' as const, row }),
    buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep }) => ({
      kind: 'collapse' as const,
      blockId,
      count,
      fromIdx,
      toIdx,
      hiddenStart,
      hiddenEnd,
      expandStep,
    }),
  });

  const overlaidItems = overlayHiddenWorkbookRowsOnItems(
    initialItems,
    new Set([5, 6, 7]),
    (item) => item.kind === 'row' ? item.row : null,
    (row) => row.rowNumber,
    (hiddenRows, rowNumbers) => ({
      kind: 'hidden-rows' as const,
      rows: hiddenRows,
      rowNumbers,
      count: rowNumbers.length,
    }),
  );

  const overlayCollapseItems = overlaidItems.filter((item) => item.kind === 'collapse');
  assert.equal(overlayCollapseItems.length, 1);
  assert.equal(overlayCollapseItems[0]?.count, 9);
  assert.deepEqual(
    overlaidItems.map((item) => item.kind === 'row'
      ? item.row.rowNumber
      : item.kind === 'hidden-rows'
      ? `hidden:${item.rowNumbers.join(',')}`
      : `collapse:${item.count}`),
    [1, 2, 3, 4, 'hidden:5,6,7', 8, 9, 'collapse:9', 19, 20],
  );

  const wronglyRebuiltVisibleRows = rows.filter((row) => !new Set([5, 6, 7]).has(row.rowNumber));
  const wrongBlocks = buildCollapsibleRowBlocks(wronglyRebuiltVisibleRows, (row) => row.equal);
  const wrongItems = buildCollapsedItems(wrongBlocks, true, {}, {
    contextLines: 2,
    blockPrefix: 'manual-hide',
    buildRowItem: (row) => ({ kind: 'row' as const, row }),
    buildCollapseItem: ({ count }) => ({
      kind: 'collapse' as const,
      count,
    }),
  });
  const wrongCollapse = wrongItems.find((item) => item.kind === 'collapse');
  assert.equal(wrongCollapse?.kind, 'collapse');
  assert.equal(wrongCollapse?.count, 13);
});
