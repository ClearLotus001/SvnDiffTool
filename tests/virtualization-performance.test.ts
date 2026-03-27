import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVirtualWindow } from '../src/hooks/virtualization/useVirtual';
import {
  computeHorizontalWindow,
  preparePositionedMergedColumnRanges,
} from '../src/hooks/virtualization/useHorizontalVirtualColumns';

test('computeVirtualWindow keeps the rendered range stable for tiny scroll deltas', () => {
  const atTop = computeVirtualWindow(1000, 21, 600, 0, 24, 2);
  const slightScroll = computeVirtualWindow(1000, 21, 600, 1, 24, 2);

  assert.equal(atTop.startIdx, slightScroll.startIdx);
  assert.equal(atTop.visibleRowCount, slightScroll.visibleRowCount);
  assert.ok(Math.abs(atTop.endIdx - slightScroll.endIdx) <= 1);
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
