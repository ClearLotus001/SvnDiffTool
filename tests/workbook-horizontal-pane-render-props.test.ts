import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WORKBOOK_CONTENT_LEFT } from '../src/constants/layout';
import { useWorkbookHorizontalPaneRenderProps } from '../src/hooks/workbook/useWorkbookHorizontalPaneRenderProps';
import type { WorkbookDiffRegion } from '../src/types';

test('useWorkbookHorizontalPaneRenderProps uses the shared workbook content-left offset for both panes', () => {
  const captured = { current: null as {
    left: { overlayProps: { contentLeft: number; viewportHeight: number } };
    right: { overlayProps: { contentLeft: number; viewportHeight: number } };
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
      viewportHeight: 360,
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
  assert.equal(resolved.left.overlayProps.viewportHeight, 360);
  assert.equal(resolved.right.overlayProps.viewportHeight, 360);
});

test('useWorkbookHorizontalPaneRenderProps keeps horizontal focus geometry on the sheet-local single-column surface', () => {
  const captured = { current: null as ReturnType<typeof useWorkbookHorizontalPaneRenderProps> | null };
  const region: WorkbookDiffRegion = {
    id: 'Thing:0:1:0',
    sheetName: 'Thing',
    startRowIndex: 0,
    endRowIndex: 1,
    startCol: 1,
    endCol: 1,
    rowNumberStart: 2,
    rowNumberEnd: 3,
    lineStartIdx: 10,
    lineEndIdx: 11,
    anchorLineIdx: 10,
    hasBaseSide: true,
    hasMineSide: false,
    anchorSelection: null,
    patches: [
      {
        startRowIndex: 0,
        endRowIndex: 1,
        startCol: 1,
        endCol: 1,
        baseRowStart: 2,
        baseRowEnd: 3,
        mineRowStart: null,
        mineRowEnd: null,
        hasBaseSide: true,
        hasMineSide: false,
      },
    ],
  };

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
      activeDiffRegion: region,
      freezeColumnCount: 2,
      singleGridWidth: 1200,
      viewportHeight: 360,
      stickyHeaderHeight: 48,
      activeRegionOverlayVisibleRowFrames: new Map(),
      guidedPulseNonce: 1,
      overlayLabel: 'B2:B3 · 2×1',
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

  if (!captured.current) throw new Error('expected captured pane render props');

  const patch = region.patches[0]!;
  assert.equal(captured.current.left.overlayProps.viewportHeight, 360);
  assert.deepEqual(captured.current.left.overlayProps.resolvePatchBoundsModes(patch), ['single']);
  assert.deepEqual(captured.current.left.overlayProps.fallbackBoundsModes, ['single']);
  assert.deepEqual(captured.current.left.overlayProps.resolveFocusPatchBoundsModes?.(patch), ['single']);
});
