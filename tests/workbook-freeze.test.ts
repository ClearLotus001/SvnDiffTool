import test from 'node:test';
import assert from 'node:assert/strict';

import { expandCollapseBlock, type CollapseExpansionState } from '../src/utils/collapse/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  describeCollapsedRowBlocks,
  remapExpandedBlocksForCollapsedRows,
} from '../src/utils/collapse/collapsibleRows';
import {
  applyWorkbookFreezePatch,
  applyWorkbookFreezeToExpandedBlocks,
  extendWorkbookFreezeRowNumberForMergedCells,
} from '../src/utils/workbook/workbookFreeze';

interface MockRow {
  lineIdx: number;
  rowNumber: number;
  equal: boolean;
}

function buildRows(startRow: number, endRow: number): MockRow[] {
  return Array.from({ length: (endRow - startRow) + 1 }, (_, index) => {
    const rowNumber = startRow + index;
    return {
      lineIdx: rowNumber,
      rowNumber,
      equal: true,
    };
  });
}

function buildItems(
  rows: MockRow[],
  expandedBlocks: CollapseExpansionState,
  blockPrefix: string,
) {
  return buildCollapsedItems(
    buildCollapsibleRowBlocks(rows, (row) => row.equal),
    true,
    expandedBlocks,
    {
      contextLines: 3,
      blockPrefix,
      buildRowItem: (row) => ({
        kind: 'row' as const,
        rowNumber: row.rowNumber,
      }),
      buildCollapseItem: ({ blockId, count, hiddenStart, hiddenEnd }) => ({
        kind: 'collapse' as const,
        blockId,
        count,
        hiddenStart,
        hiddenEnd,
      }),
    },
  );
}

function buildFreezeAwareItems(
  rows: MockRow[],
  expandedBlocks: CollapseExpansionState,
  blockPrefix: string,
  freezeRowNumber: number,
) {
  const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
  const descriptors = describeCollapsedRowBlocks(blocks, {
    contextLines: 3,
    blockPrefix,
  });
  const effectiveExpandedBlocks = applyWorkbookFreezeToExpandedBlocks(
    expandedBlocks,
    descriptors,
    freezeRowNumber,
    (row) => row.rowNumber,
  );

  return buildCollapsedItems(
    blocks,
    true,
    effectiveExpandedBlocks,
    {
      contextLines: 3,
      blockPrefix,
      buildRowItem: (row) => ({
        kind: 'row' as const,
        rowNumber: row.rowNumber,
      }),
      buildCollapseItem: ({ blockId, count, hiddenStart, hiddenEnd }) => ({
        kind: 'collapse' as const,
        blockId,
        count,
        hiddenStart,
        hiddenEnd,
      }),
    },
  );
}

test('applyWorkbookFreezePatch keeps only custom freeze axes beyond defaults', () => {
  const defaults = { rowNumber: 1, colCount: 1 };

  assert.equal(
    applyWorkbookFreezePatch(null, { rowNumber: 1, colCount: 1 }, defaults),
    null,
  );
  assert.deepEqual(
    applyWorkbookFreezePatch({ rowNumber: 8, colCount: 4 }, { rowNumber: null }, defaults),
    { colCount: 4 },
  );
  assert.equal(
    applyWorkbookFreezePatch({ colCount: 2 }, { colCount: 1 }, defaults),
    null,
  );
});

test('extendWorkbookFreezeRowNumberForMergedCells preserves merged blocks that cross the freeze boundary', () => {
  assert.equal(extendWorkbookFreezeRowNumberForMergedCells(1, [
    { startRow: 1, endRow: 3, startCol: 0, endCol: 0 },
  ]), 3);

  assert.equal(extendWorkbookFreezeRowNumberForMergedCells(1, [
    { startRow: 1, endRow: 3, startCol: 0, endCol: 0 },
    { startRow: 3, endRow: 5, startCol: 2, endCol: 4 },
  ]), 5);

  assert.equal(extendWorkbookFreezeRowNumberForMergedCells(2, [
    { startRow: 3, endRow: 5, startCol: 0, endCol: 1 },
  ]), 2);
});

test('remapExpandedBlocksForCollapsedRows preserves revealed rows after the freeze boundary moves', () => {
  const previousRows = buildRows(1, 20);
  const previousItems = buildItems(previousRows, {}, 'sheet::1');
  const initialCollapse = previousItems.find((item) => item.kind === 'collapse');

  if (!initialCollapse || initialCollapse.kind !== 'collapse') {
    throw new Error('expected a collapsed block before remapping');
  }

  const expandedState = expandCollapseBlock(
    {},
    initialCollapse.blockId,
    initialCollapse.hiddenStart,
    initialCollapse.hiddenEnd,
    6,
  );

  const nextRows = previousRows.filter((row) => row.rowNumber > 5);
  const remappedState = remapExpandedBlocksForCollapsedRows(expandedState, {
    previousRows,
    nextRows,
    contextLines: 3,
    previousBlockPrefix: 'sheet::1',
    nextBlockPrefix: 'sheet::5',
    isEqualRow: (row) => row.equal,
    getRowKey: (row) => String(row.rowNumber),
  });

  const nextItems = buildItems(nextRows, remappedState, 'sheet::5');
  const visibleRows = nextItems
    .filter((item) => item.kind === 'row')
    .map((item) => item.rowNumber);
  const remainingCollapse = nextItems.find((item) => item.kind === 'collapse');

  assert.deepEqual(visibleRows, [6, 7, 8, 15, 16, 17, 18, 19, 20]);
  assert.equal(remainingCollapse?.kind, 'collapse');
  assert.equal(remainingCollapse?.count, 6);
});

test('remapExpandedBlocksForCollapsedRows keeps newly unfrozen rows visible', () => {
  const previousRows = buildRows(6, 20);
  const nextRows = buildRows(2, 20);

  const remappedState = remapExpandedBlocksForCollapsedRows({}, {
    previousRows,
    nextRows,
    contextLines: 3,
    previousBlockPrefix: 'sheet::6',
    nextBlockPrefix: 'sheet::2',
    isEqualRow: (row) => row.equal,
    getRowKey: (row) => String(row.rowNumber),
  });

  const nextItems = buildItems(nextRows, remappedState, 'sheet::2');
  const visibleRows = nextItems
    .filter((item) => item.kind === 'row')
    .map((item) => item.rowNumber);
  const remainingCollapse = nextItems.find((item) => item.kind === 'collapse');

  assert.deepEqual(visibleRows, [2, 3, 4, 5, 6, 7, 8, 18, 19, 20]);
  assert.equal(remainingCollapse?.kind, 'collapse');
  assert.equal(remainingCollapse?.count, 9);
});

test('remapExpandedBlocksForCollapsedRows does not introduce a new top collapse after unfreezing', () => {
  const previousRows = buildRows(5, 9);
  const nextRows = buildRows(2, 9);

  const remappedState = remapExpandedBlocksForCollapsedRows({}, {
    previousRows,
    nextRows,
    contextLines: 3,
    previousBlockPrefix: 'sheet::5',
    nextBlockPrefix: 'sheet::2',
    isEqualRow: (row) => row.equal,
    getRowKey: (row) => String(row.rowNumber),
  });

  const nextItems = buildItems(nextRows, remappedState, 'sheet::2');
  const visibleRows = nextItems
    .filter((item) => item.kind === 'row')
    .map((item) => item.rowNumber);

  assert.deepEqual(visibleRows, [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(nextItems.some((item) => item.kind === 'collapse'), false);
});

test('freeze-aware collapse keeps block structure stable when the freeze boundary changes', () => {
  const rows = buildRows(2, 9);

  const defaultFreezeItems = buildFreezeAwareItems(rows, {}, 'sheet', 1);
  const deeperFreezeItems = buildFreezeAwareItems(rows, {}, 'sheet', 3);

  assert.equal(defaultFreezeItems.find((item) => item.kind === 'collapse')?.kind, 'collapse');
  assert.equal(deeperFreezeItems.find((item) => item.kind === 'collapse')?.kind, 'collapse');
  assert.equal(defaultFreezeItems.find((item) => item.kind === 'collapse')?.count, 2);
  assert.equal(deeperFreezeItems.find((item) => item.kind === 'collapse')?.count, 2);
});

test('freeze-aware collapse reveals hidden rows that move into the frozen area', () => {
  const rows = buildRows(2, 20);
  const items = buildFreezeAwareItems(rows, {}, 'sheet', 6);
  const visibleRows = items
    .filter((item) => item.kind === 'row')
    .map((item) => item.rowNumber);
  const remainingCollapse = items.find((item) => item.kind === 'collapse');

  assert.deepEqual(visibleRows, [2, 3, 4, 5, 6, 18, 19, 20]);
  assert.equal(remainingCollapse?.kind, 'collapse');
  assert.equal(remainingCollapse?.count, 11);
});
