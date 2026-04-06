import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVirtualWindow } from '../src/hooks/virtualization/useVirtual';
import {
  computeHorizontalWindow,
  preparePositionedMergedColumnRanges,
  resolveStableHorizontalColumnEntries,
} from '../src/hooks/virtualization/useHorizontalVirtualColumns';

test('computeVirtualWindow keeps the rendered range stable for tiny scroll deltas', () => {
  const atTop = computeVirtualWindow(1000, 21, 600, 0, 24, 2);
  const slightScroll = computeVirtualWindow(1000, 21, 600, 1, 24, 2);

  assert.equal(atTop.startIdx, slightScroll.startIdx);
  assert.equal(atTop.visibleRowCount, slightScroll.visibleRowCount);
  assert.ok(Math.abs(atTop.endIdx - slightScroll.endIdx) <= 1);
});

test('computeVirtualWindow clamps overscrolled viewports back into the available row range', () => {
  const window = computeVirtualWindow(10, 21, 84, 9999, 0, 0);

  assert.equal(window.startIdx, 6);
  assert.equal(window.endIdx, 10);
});

test('computeHorizontalWindow expands the virtual range to fully cover merged columns', () => {
  const columns = Array.from({ length: 20 }, (_, index) => index);
  const mergedRanges = preparePositionedMergedColumnRanges(columns, [
    { startRow: 1, endRow: 1, startCol: 5, endCol: 7 },
  ]);
  const widths = Array.from({ length: 19 }, () => 148);

  const window = computeHorizontalWindow(
    widths,
    1,
    6 * 148,
    600,
    148,
    mergedRanges,
    2,
    1,
  );

  assert.ok(window.startIndex <= 4);
  assert.ok(window.endIndex >= 7);
});

test('computeHorizontalWindow uses prefix sums for variable column widths', () => {
  const window = computeHorizontalWindow(
    [80, 240, 100],
    1,
    100,
    260,
    100,
    [],
    0,
    0,
  );

  assert.equal(window.startIndex, 1);
  assert.equal(window.endIndex, 2);
  assert.equal(window.visibleColumnCount, 1);
});

test('resolveStableHorizontalColumnEntries invalidates cached entries when layout identity changes', () => {
  const previousEntries = [
    { column: 0, position: 0, width: 120, displayWidth: 120, offset: 0 },
  ];
  const nextEntries = [
    { column: 0, position: 0, width: 180, displayWidth: 180, offset: 24 },
  ];
  const previousLayout = { version: 'before' };
  const nextLayout = { version: 'after' };

  const resolved = resolveStableHorizontalColumnEntries(
    {
      key: 'same-window',
      layout: previousLayout,
      entries: previousEntries,
    },
    'same-window',
    nextLayout,
    nextEntries,
  );

  assert.equal(resolved.entries, nextEntries);
  assert.equal(resolved.layout, nextLayout);
});

test('resolveStableHorizontalColumnEntries reuses cached entries for the same layout identity', () => {
  const layout = { version: 'stable' };
  const previousEntries = [
    { column: 1, position: 1, width: 96, displayWidth: 96, offset: 128 },
  ];
  const nextEntries = [
    { column: 1, position: 1, width: 144, displayWidth: 144, offset: 256 },
  ];

  const resolved = resolveStableHorizontalColumnEntries(
    {
      key: 'stable-window',
      layout,
      entries: previousEntries,
    },
    'stable-window',
    layout,
    nextEntries,
  );

  assert.equal(resolved.entries, previousEntries);
  assert.equal(resolved.layout, layout);
});
