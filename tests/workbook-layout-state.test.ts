import test from 'node:test';
import assert from 'node:assert/strict';

import { expandCollapseBlock, type CollapseExpansionState } from '../src/utils/collapse/collapseState';
import { buildCollapsedItems, buildCollapsibleRowBlocks } from '../src/utils/collapse/collapsibleRows';
import { buildWorkbookCollapseBlockPrefix } from '../src/utils/workbook/workbookCollapse';
import {
  buildWorkbookCompareLayoutSnapshot,
  buildWorkbookHorizontalLayoutSnapshot,
  resolveWorkbookExpandedBlocksForContext,
} from '../src/utils/workbook/workbookLayoutSnapshot';
import {
  applyWorkbookExpandedBlocksChange,
  applyWorkbookLayoutSnapshot,
  createEmptyWorkbookLayoutSnapshots,
  getWorkbookSharedExpandedBlocks,
} from '../src/utils/workbook/workbookLayoutState';

interface MockRow {
  lineIdx: number;
  equal: boolean;
  label: string;
}

test('workbook expanded blocks survive realistic layout switches while keeping per-layout scroll', () => {
  const rows: MockRow[] = Array.from({ length: 80 }, (_, index) => ({
    lineIdx: index,
    equal: true,
    label: `row-${index}`,
  }));
  const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
  const sheetName = 'Thing';
  const activeRegionId = 'region-1';
  const blockPrefix = buildWorkbookCollapseBlockPrefix(`${sheetName}::1`);

  const stackedItems = buildCollapsedItems(blocks, true, {}, {
    contextLines: 3,
    blockPrefix,
    buildRowItem: (row) => ({ kind: 'row' as const, label: row.label }),
    buildCollapseItem: ({ blockId, count, hiddenStart, hiddenEnd, expandStep }) => ({
      kind: 'collapse' as const,
      blockId,
      count,
      hiddenStart,
      hiddenEnd,
      expandStep,
    }),
  });
  const firstCollapse = stackedItems.find((item) => item.kind === 'collapse');
  if (!firstCollapse || firstCollapse.kind !== 'collapse') {
    throw new Error('expected an initial collapse item');
  }

  const expandedBlocks = expandCollapseBlock(
    {},
    firstCollapse.blockId,
    firstCollapse.hiddenStart,
    firstCollapse.hiddenEnd,
    Math.min(firstCollapse.count, firstCollapse.expandStep),
  );

  let sharedExpandedBlocksByContext = new Map<string, CollapseExpansionState>();
  let snapshots = createEmptyWorkbookLayoutSnapshots();
  snapshots.unified = buildWorkbookCompareLayoutSnapshot(
    'unified',
    sheetName,
    activeRegionId,
    1200,
    48,
    {},
  );
  snapshots['split-v'] = buildWorkbookCompareLayoutSnapshot(
    'split-v',
    sheetName,
    activeRegionId,
    1200,
    96,
    {},
  );
  snapshots['split-h'] = buildWorkbookHorizontalLayoutSnapshot(
    sheetName,
    activeRegionId,
    600,
    16,
    600,
    16,
    {},
  );

  const afterExpand = applyWorkbookExpandedBlocksChange(
    sharedExpandedBlocksByContext,
    snapshots,
    sheetName,
    activeRegionId,
    expandedBlocks,
  );
  sharedExpandedBlocksByContext = afterExpand.sharedExpandedBlocksByContext;
  snapshots = afterExpand.snapshots;

  const sharedExpandedBlocks = getWorkbookSharedExpandedBlocks(
    sharedExpandedBlocksByContext,
    sheetName,
    activeRegionId,
  );
  assert.deepEqual(sharedExpandedBlocks, expandedBlocks);
  assert.deepEqual(snapshots['split-v']?.expandedBlocks, expandedBlocks);
  assert.deepEqual(snapshots['split-h']?.expandedBlocks, expandedBlocks);

  const resolvedForHorizontal = resolveWorkbookExpandedBlocksForContext(
    snapshots['split-h'],
    sharedExpandedBlocks,
    activeRegionId,
    sheetName,
  );
  assert.deepEqual(resolvedForHorizontal, expandedBlocks);

  const horizontalItems = buildCollapsedItems(blocks, true, resolvedForHorizontal, {
    contextLines: 3,
    blockPrefix,
    buildRowItem: (row) => ({ kind: 'split-line' as const, label: row.label }),
    buildCollapseItem: ({ blockId, count, hiddenStart, hiddenEnd, expandStep }) => ({
      kind: 'split-collapse' as const,
      blockId,
      count,
      hiddenStart,
      hiddenEnd,
      expandStep,
    }),
  });
  const visibleRows = horizontalItems
    .filter((item): item is Extract<typeof item, { kind: 'split-line' }> => item.kind === 'split-line')
    .map((item) => item.label);
  assert.equal(visibleRows.includes('row-3'), true);
  assert.equal(visibleRows.includes('row-38'), true);
  assert.equal(visibleRows.includes('row-41'), true);
  assert.equal(visibleRows.includes('row-76'), true);

  const horizontalSnapshot = buildWorkbookHorizontalLayoutSnapshot(
    sheetName,
    activeRegionId,
    2400,
    24,
    2400,
    24,
    resolvedForHorizontal,
  );
  const afterHorizontalSnapshot = applyWorkbookLayoutSnapshot(
    sharedExpandedBlocksByContext,
    snapshots,
    horizontalSnapshot,
  );
  sharedExpandedBlocksByContext = afterHorizontalSnapshot.sharedExpandedBlocksByContext;
  snapshots = afterHorizontalSnapshot.snapshots;

  assert.equal(snapshots['split-v']?.scrollTop, 1200);
  assert.equal(snapshots['split-v']?.scrollLeft, 96);
  assert.equal(snapshots['split-h']?.leftScrollTop, 2400);
  assert.equal(snapshots['split-h']?.leftScrollLeft, 24);
  assert.deepEqual(
    resolveWorkbookExpandedBlocksForContext(
      snapshots['split-v'],
      getWorkbookSharedExpandedBlocks(sharedExpandedBlocksByContext, sheetName, activeRegionId),
      activeRegionId,
      sheetName,
    ),
    expandedBlocks,
  );
});
