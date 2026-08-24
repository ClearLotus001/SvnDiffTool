import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useWorkbookCompareOverlayLayout } from '../src/hooks/workbook/useWorkbookCompareOverlayLayout';
import type { WorkbookDiffRegion } from '../src/types';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

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
      frozenRowFramesByKey: new Map(),
      bodyRowFramesByKey: new Map(),
      scrollRef: { current: null },
      viewportWidth: 640,
      viewportHeight: 360,
      activeDiffRegion: region,
      activeSheetName: 'Thing',
      columnLayoutByColumn: new Map(),
      contentLeft: 40,
      frozenWidth: 0,
      freezeColumnCount: 0,
      pulseTriggerKey: 'Thing:0',
      label: 'B2:B3 · 2×1',
      deemphasizeOutline: true,
    });

    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured.current) throw new Error('expected captured overlay props');

  assert.equal(captured.current.viewportHeight, 360);
  assert.equal(captured.current.deemphasizeOutline, true);
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
      frozenRowFramesByKey: new Map(),
      bodyRowFramesByKey: new Map(),
      scrollRef: { current: null },
      viewportWidth: 640,
      viewportHeight: 360,
      activeDiffRegion: region,
      activeSheetName: 'Thing',
      columnLayoutByColumn: new Map(),
      contentLeft: 40,
      frozenWidth: 0,
      freezeColumnCount: 0,
      pulseTriggerKey: 'Thing:0',
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

test('useWorkbookCompareOverlayLayout projects frozen and body row frames without rescanning render segments', () => {
  const captured = { current: null as ReturnType<typeof useWorkbookCompareOverlayLayout> | null };
  const rowA = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['A']),
      mine: createWorkbookRowLine(2, ['A']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['A']),
      mine: createWorkbookRowLine(2, ['A']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 10,
    lineIdxs: [10],
  };
  const rowB = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['B']),
      mine: createWorkbookRowLine(3, ['B']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['B']),
      mine: createWorkbookRowLine(3, ['B']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 11,
    lineIdxs: [11],
  };

  function Probe() {
    captured.current = useWorkbookCompareOverlayLayout({
      sectionRows: [rowA, rowB],
      showColumnHeader: true,
      mode: 'columns',
      stickyHeaderHeight: 72,
      rowWindowOffsetTop: 18,
      frozenRowFramesByKey: new Map([
        ['10', { top: 0, height: 24 }],
      ]),
      bodyRowFramesByKey: new Map([
        ['11', { top: 24, height: 24 }],
      ]),
      scrollRef: { current: null },
      viewportWidth: 640,
      viewportHeight: 360,
      activeDiffRegion: buildRegion(),
      activeSheetName: 'Thing',
      columnLayoutByColumn: new Map(),
      contentLeft: 40,
      frozenWidth: 0,
      freezeColumnCount: 0,
      pulseTriggerKey: 'Thing:0',
      label: 'B2:B3',
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured.current) throw new Error('expected captured overlay props');
  assert.deepEqual([...captured.current.visibleRowFrames.entries()], [
    [0, { top: 24, height: 24 }],
    [1, { top: 114, height: 24 }],
  ]);
});
