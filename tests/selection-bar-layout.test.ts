import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSelectionBarLayout } from '../src/utils/diff/selectionBarLayout';

test('resolveSelectionBarLayout returns fallback values when there is no selected entry', () => {
  assert.deepEqual(
    resolveSelectionBarLayout({
      entries: [
        { topOffset: 0, height: 24, selected: false, weight: 8 },
      ],
      viewport: { scrollTop: 0, clientHeight: 120, offsetTop: 10 },
      barHeight: 20,
      gap: 4,
    }),
    { top: 12, connectorOffsetY: 24, placement: 'above' },
  );
});

test('resolveSelectionBarLayout prefers the below placement when the selected block is at the top edge', () => {
  assert.deepEqual(
    resolveSelectionBarLayout({
      entries: [
        { topOffset: 0, height: 20, selected: true, weight: 140 },
      ],
      viewport: { scrollTop: 0, clientHeight: 120, offsetTop: 0 },
      barHeight: 20,
      gap: 4,
    }),
    { top: 24, connectorOffsetY: 12, placement: 'below' },
  );
});

test('resolveSelectionBarLayout respects base offsets for overlay-host positioning', () => {
  assert.deepEqual(
    resolveSelectionBarLayout({
      entries: [
        { topOffset: 40, height: 24, selected: true, weight: 140 },
      ],
      viewport: { scrollTop: 0, clientHeight: 120, offsetTop: 10 },
      barHeight: 20,
      gap: 4,
      baseOffset: 10,
    }),
    { top: 26, connectorOffsetY: 36, placement: 'above' },
  );
});
