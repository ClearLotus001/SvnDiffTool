import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useWorkbookCompareOverlayLayout } from '../src/hooks/workbook/useWorkbookCompareOverlayLayout';
import type { WorkbookDiffRegion } from '../src/types';

function buildRegion(overrides: Partial<WorkbookDiffRegion> = {}): WorkbookDiffRegion {
  return {
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
    ...overrides,
  };
}

test('useWorkbookCompareOverlayLayout keeps column fills side-specific while expanding focus outlines across both compare columns', () => {
  const captured = { current: null as ReturnType<typeof useWorkbookCompareOverlayLayout> | null };
  const region = buildRegion();
  const patch = region.patches[0]!;

  function Probe() {
    captured.current = useWorkbookCompareOverlayLayout({
      sectionRows: [],
      showColumnHeader: true,
      mode: 'columns',
      stickyHeaderHeight: 48,
      rowWindowOffsetTop: 0,
      visibleFrozenStackedCanvasRuns: [],
      visibleFrozenColumnsCanvasRows: [],
      bodySegments: [],
      columnsBodySegments: null,
      scrollRef: { current: null },
      viewportWidth: 640,
      viewportHeight: 360,
      activeDiffRegion: region,
      activeSheetName: 'Thing',
      columnLayoutByColumn: new Map(),
      contentLeft: 40,
      frozenWidth: 0,
      freezeColumnCount: 0,
      pulseNonce: 1,
      label: 'B2:B3 · 2×1',
    });

    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured.current) throw new Error('expected captured overlay props');

  assert.equal(captured.current.viewportHeight, 360);
  assert.deepEqual(captured.current.resolvePatchBoundsModes(patch), ['paired-base']);
  assert.deepEqual(captured.current.fallbackBoundsModes, ['paired-base']);
  assert.deepEqual(captured.current.resolveFocusPatchBoundsModes?.(patch), ['paired-shared']);
});

test('useWorkbookCompareOverlayLayout keeps stacked focus outlines on the shared single surface', () => {
  const captured = { current: null as ReturnType<typeof useWorkbookCompareOverlayLayout> | null };
  const region = buildRegion({
    hasMineSide: true,
    patches: [
      {
        startRowIndex: 0,
        endRowIndex: 1,
        startCol: 1,
        endCol: 1,
        baseRowStart: 2,
        baseRowEnd: 3,
        mineRowStart: 2,
        mineRowEnd: 3,
        hasBaseSide: true,
        hasMineSide: true,
      },
    ],
  });
  const patch = region.patches[0]!;

  function Probe() {
    captured.current = useWorkbookCompareOverlayLayout({
      sectionRows: [],
      showColumnHeader: true,
      mode: 'stacked',
      stickyHeaderHeight: 48,
      rowWindowOffsetTop: 0,
      visibleFrozenStackedCanvasRuns: [],
      visibleFrozenColumnsCanvasRows: [],
      bodySegments: [],
      columnsBodySegments: null,
      scrollRef: { current: null },
      viewportWidth: 640,
      viewportHeight: 360,
      activeDiffRegion: region,
      activeSheetName: 'Thing',
      columnLayoutByColumn: new Map(),
      contentLeft: 40,
      frozenWidth: 0,
      freezeColumnCount: 0,
      pulseNonce: 1,
      label: 'B2:B3 · 2×1',
    });

    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured.current) throw new Error('expected captured overlay props');

  assert.equal(captured.current.viewportHeight, 360);
  assert.deepEqual(captured.current.resolvePatchBoundsModes(patch), ['single']);
  assert.deepEqual(captured.current.fallbackBoundsModes, ['single']);
  assert.deepEqual(captured.current.resolveFocusPatchBoundsModes?.(patch), ['single']);
});
