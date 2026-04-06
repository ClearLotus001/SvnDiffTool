import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WORKBOOK_CONTENT_LEFT } from '../src/constants/layout';
import { useWorkbookHorizontalPaneRenderProps } from '../src/hooks/workbook/useWorkbookHorizontalPaneRenderProps';

test('useWorkbookHorizontalPaneRenderProps uses the shared workbook content-left offset for both panes', () => {
  const captured = { current: null as {
    left: { overlayProps: { contentLeft: number } };
    right: { overlayProps: { contentLeft: number } };
  } | null };

  function Probe() {
    captured.current = useWorkbookHorizontalPaneRenderProps({
      paneVirtualColumnsBySide: {
        left: {
          debug: { viewportWidth: 480 },
          columnEntries: [],
          columnLayoutByColumn: new Map(),
          frozenWidth: 120,
        },
        right: {
          debug: { viewportWidth: 520 },
          columnEntries: [],
          columnLayoutByColumn: new Map(),
          frozenWidth: 140,
        },
      },
      leftScrollRef: { current: null },
      rightScrollRef: { current: null },
      activeSheetName: 'Thing',
      activeDiffRegion: null,
      freezeColumnCount: 2,
      singleGridWidth: 1200,
      stickyHeaderHeight: 48,
      activeRegionOverlayVisibleRowFrames: new Map(),
      guidedPulseNonce: 1,
      overlayLabel: 'A1:B2 · 2×2',
      selection: {
        anchor: null,
        primary: null,
        items: [],
      },
      onSelectionRequest: () => {},
      onHoverChange: () => {},
      fontSize: 13,
      visibleColumns: [],
      baseVersion: 'BASE',
      mineVersion: 'MINE',
      headerRowNumber: 1,
      baseMergedRanges: [],
      mineMergedRanges: [],
      baseRowEntryByRowNumber: new Map(),
      mineRowEntryByRowNumber: new Map(),
      baseCompareCellsByRowNumber: new Map(),
      mineCompareCellsByRowNumber: new Map(),
      compareMode: 'strict',
    });

    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured.current) {
    throw new Error('expected captured pane render props');
  }
  const resolved = captured.current;
  assert.equal(resolved.left.overlayProps.contentLeft, WORKBOOK_CONTENT_LEFT);
  assert.equal(resolved.right.overlayProps.contentLeft, WORKBOOK_CONTENT_LEFT);
});
