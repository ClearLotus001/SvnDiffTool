import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkbookNavigationLayoutKey } from '../src/utils/workbook/workbookNavigationLayoutKey';

test('navigation layout key changes when expanded virtual geometry changes', () => {
  const base = buildWorkbookNavigationLayoutKey({
    layout: 'stacked',
    expandedBlocks: {},
    itemCount: 20,
    stackedItemCount: 24,
    totalHeight: 480,
  });
  const expanded = buildWorkbookNavigationLayoutKey({
    layout: 'stacked',
    expandedBlocks: { block: [{ start: 10, end: 510 }] },
    itemCount: 520,
    stackedItemCount: 524,
    totalHeight: 12_480,
  });

  assert.notEqual(expanded, base);
  assert.equal(buildWorkbookNavigationLayoutKey({
    layout: 'stacked',
    expandedBlocks: { block: [{ start: 10, end: 510 }] },
    itemCount: 520,
    stackedItemCount: 524,
    totalHeight: 12_480,
  }), expanded);
});
