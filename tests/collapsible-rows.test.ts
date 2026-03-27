import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandCollapseBlock,
  getCollapseExpandStep,
  revealCollapsedLine,
  type CollapseExpansionState,
} from '../src/utils/collapse/collapseState';
import { buildCollapsedItems, buildCollapsibleRowBlocks } from '../src/utils/collapse/collapsibleRows';

interface MockRow {
  lineIdx: number;
  equal: boolean;
  label: string;
}

test('expanding one collapsed block does not expand other blocks with duplicated line ranges', () => {
  const rows: MockRow[] = [
    { lineIdx: 10, equal: true, label: 'a-0' },
    { lineIdx: 11, equal: true, label: 'a-1' },
    { lineIdx: 12, equal: true, label: 'a-2' },
    { lineIdx: 13, equal: true, label: 'a-3' },
    { lineIdx: 14, equal: true, label: 'a-4' },
    { lineIdx: 15, equal: true, label: 'a-5' },
    { lineIdx: 16, equal: true, label: 'a-6' },
    { lineIdx: 17, equal: true, label: 'a-7' },
    { lineIdx: 200, equal: false, label: 'change-1' },
    { lineIdx: 10, equal: true, label: 'b-0' },
    { lineIdx: 11, equal: true, label: 'b-1' },
    { lineIdx: 12, equal: true, label: 'b-2' },
    { lineIdx: 13, equal: true, label: 'b-3' },
    { lineIdx: 14, equal: true, label: 'b-4' },
    { lineIdx: 15, equal: true, label: 'b-5' },
    { lineIdx: 16, equal: true, label: 'b-6' },
    { lineIdx: 17, equal: true, label: 'b-7' },
    { lineIdx: 400, equal: false, label: 'change-2' },
  ];

  const buildItems = (expandedBlocks: CollapseExpansionState) => {
    const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
    return buildCollapsedItems(blocks, true, expandedBlocks, {
      contextLines: 2,
      blockPrefix: 'test-scope',
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
  };

  const initialItems = buildItems({});
  const initialCollapseItems = initialItems.filter((item) => item.kind === 'collapse');
  assert.equal(initialCollapseItems.length, 2);
  assert.notEqual(initialCollapseItems[0]?.blockId, initialCollapseItems[1]?.blockId);

  const firstCollapse = initialCollapseItems[0]!;
  const expandedState = expandCollapseBlock(
    {},
    firstCollapse.blockId,
    firstCollapse.hiddenStart,
    firstCollapse.hiddenEnd,
    Math.min(firstCollapse.count, firstCollapse.expandStep),
  );
  const nextItems = buildItems(expandedState);
  const remainingCollapseItems = nextItems.filter((item) => item.kind === 'collapse');

  assert.equal(remainingCollapseItems.length, 1);
  assert.equal(
    remainingCollapseItems.some((item) => item.blockId === initialCollapseItems[1]?.blockId),
    true,
  );
});

test('buildCollapsedItems reveals large equal blocks from both sides when partially expanded', () => {
  const rows: MockRow[] = Array.from({ length: 1_200 }, (_, index) => ({
    lineIdx: index,
    equal: true,
    label: `row-${index}`,
  }));

  const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
  const initialItems = buildCollapsedItems(blocks, true, {}, {
    contextLines: 3,
    blockPrefix: 'symmetric',
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
  const collapse = initialItems.find((item) => item.kind === 'collapse');
  if (!collapse || collapse.kind !== 'collapse') {
    throw new Error('expected an initial collapse item');
  }

  const expandedState = expandCollapseBlock(
    {},
    collapse.blockId,
    collapse.hiddenStart,
    collapse.hiddenEnd,
    Math.min(collapse.count, collapse.expandStep),
  );
  const expandedItems = buildCollapsedItems(blocks, true, expandedState, {
    contextLines: 3,
    blockPrefix: 'symmetric',
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

  const rowLabels = expandedItems
    .filter((item): item is Extract<typeof item, { kind: 'row' }> => item.kind === 'row')
    .map((item) => item.label);

  assert.equal(rowLabels.includes('row-0'), true);
  assert.equal(rowLabels.includes('row-3'), true);
  assert.equal(rowLabels.includes('row-251'), true);
  assert.equal(rowLabels.includes('row-948'), true);
  assert.equal(rowLabels.includes('row-1196'), true);
  assert.equal(rowLabels.includes('row-1199'), true);
  assert.equal(rowLabels.includes('row-600'), false);
  assert.equal(collapse.expandStep, getCollapseExpandStep(1_194));
});

test('revealing a target line keeps separate collapsed segments around the revealed window', () => {
  const rows: MockRow[] = Array.from({ length: 240 }, (_, index) => ({
    lineIdx: index,
    equal: true,
    label: `row-${index}`,
  }));

  const blocks = buildCollapsibleRowBlocks(rows, (row) => row.equal);
  const initialItems = buildCollapsedItems(blocks, true, {}, {
    contextLines: 3,
    blockPrefix: 'target-reveal',
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
  const collapse = initialItems.find((item) => item.kind === 'collapse');
  if (!collapse || collapse.kind !== 'collapse') {
    throw new Error('expected an initial collapse item');
  }

  const state = revealCollapsedLine({}, collapse.blockId, collapse.hiddenStart, collapse.hiddenEnd, 9, 2);
  const nextItems = buildCollapsedItems(blocks, true, state, {
    contextLines: 3,
    blockPrefix: 'target-reveal',
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

  const collapseItems = nextItems.filter((item) => item.kind === 'collapse');
  assert.equal(collapseItems.length, 2);
  assert.deepEqual(
    nextItems
      .filter((item): item is Extract<typeof item, { kind: 'row' }> => item.kind === 'row')
      .map((item) => item.label),
    [
      'row-0', 'row-1', 'row-2',
      'row-10', 'row-11', 'row-12', 'row-13', 'row-14',
      'row-237', 'row-238', 'row-239',
    ],
  );
});
