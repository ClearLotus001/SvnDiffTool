import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWorkbookFrozenPaneViewport } from '../src/utils/workbook/workbookFrozenPane';

test('resolveWorkbookFrozenPaneViewport returns the full size when the frozen pane fits', () => {
  assert.deepEqual(
    resolveWorkbookFrozenPaneViewport({
      totalFrozenSize: 120,
      viewportSize: 640,
      headerSize: 24,
      minBodyViewportSize: 192,
      maxViewportRatio: 0.6,
      minViewportSize: 96,
    }),
    {
      viewportSize: 120,
      overflowSize: 0,
      isOverflowing: false,
    },
  );
});

test('resolveWorkbookFrozenPaneViewport caps oversized frozen panes to keep the body usable', () => {
  assert.deepEqual(
    resolveWorkbookFrozenPaneViewport({
      totalFrozenSize: 12_000,
      viewportSize: 800,
      headerSize: 24,
      minBodyViewportSize: 192,
      maxViewportRatio: 0.6,
      minViewportSize: 96,
    }),
    {
      viewportSize: 466,
      overflowSize: 11_534,
      isOverflowing: true,
    },
  );
});

test('resolveWorkbookFrozenPaneViewport still reserves a visible pane on short viewports', () => {
  assert.deepEqual(
    resolveWorkbookFrozenPaneViewport({
      totalFrozenSize: 1_200,
      viewportSize: 260,
      headerSize: 24,
      minBodyViewportSize: 192,
      maxViewportRatio: 0.6,
      minViewportSize: 96,
    }),
    {
      viewportSize: 96,
      overflowSize: 1_104,
      isOverflowing: true,
    },
  );
});
