import test from 'node:test';
import assert from 'node:assert/strict';

import type { WorkbookDiffRegion } from '../src/types';
import {
  buildWorkbookRegionOverlayBox,
  buildWorkbookRegionOverlayBoxes,
  resolveWorkbookRegionHorizontalBounds,
} from '../src/utils/workbook/workbookRegionOverlay';
import {
  buildWorkbookDiffRegionOverlayOutlineSegments,
  mergeWorkbookDiffRegionOverlayBoxes,
} from '../src/components/workbook/WorkbookDiffRegionOverlay';

function buildRegion(overrides: Partial<WorkbookDiffRegion> = {}): WorkbookDiffRegion {
  return {
    id: 'Thing:0:0:0',
    sheetName: 'Thing',
    startRowIndex: 0,
    endRowIndex: 1,
    startCol: 0,
    endCol: 1,
    rowNumberStart: 2,
    rowNumberEnd: 3,
    lineStartIdx: 10,
    lineEndIdx: 11,
    anchorLineIdx: 10,
    hasBaseSide: true,
    hasMineSide: true,
    anchorSelection: null,
    patches: [],
    ...overrides,
  };
}

const visibleRowFrames = new Map<number, { top: number; height: number }>([
  [0, { top: 24, height: 20 }],
  [1, { top: 44, height: 20 }],
]);

const columnLayoutByColumn = new Map([
  [0, { column: 0, position: 0, width: 100, displayWidth: 200, offset: 0 }],
  [1, { column: 1, position: 1, width: 100, displayWidth: 200, offset: 100 }],
]);

const discontinuousPairedColumnLayoutByColumn = new Map([
  [0, { column: 0, position: 0, width: 100, displayWidth: 200, offset: 0 }],
  [1, { column: 1, position: 1, width: 100, displayWidth: 200, offset: 200 }],
]);

test('buildWorkbookRegionOverlayBox merges paired compare sides into one layout-level box', () => {
  const box = buildWorkbookRegionOverlayBox({
    region: buildRegion(),
    visibleRowFrames,
    boundsModes: ['paired-base', 'paired-mine'],
    columnLayoutByColumn,
    contentLeft: 40,
    scrollLeft: 0,
    frozenWidth: 0,
    freezeColumnCount: 0,
    key: 'paired',
  });

  assert.ok(box);
  assert.equal(box.left, 40);
  assert.equal(box.top, 24);
  assert.equal(box.width, 300);
  assert.equal(box.height, 40);
});

test('buildWorkbookRegionOverlayBox keeps single-pane regions to one box', () => {
  const box = buildWorkbookRegionOverlayBox({
    region: buildRegion({ hasMineSide: false }),
    visibleRowFrames,
    boundsModes: ['single'],
    columnLayoutByColumn,
    contentLeft: 40,
    scrollLeft: 0,
    frozenWidth: 0,
    freezeColumnCount: 0,
    key: 'single',
  });

  assert.ok(box);
  assert.equal(box.width, 200);
  assert.equal(box.height, 40);
});

test('buildWorkbookRegionOverlayBoxes keeps discontinuous paired segments separate before overlay merge', () => {
  const boxes = buildWorkbookRegionOverlayBoxes({
    region: buildRegion({ hasMineSide: false }),
    visibleRowFrames,
    boundsModes: ['paired-base'],
    columnLayoutByColumn: discontinuousPairedColumnLayoutByColumn,
    contentLeft: 40,
    scrollLeft: 0,
    frozenWidth: 0,
    freezeColumnCount: 0,
    key: 'paired-segments',
  });

  assert.deepEqual(boxes, [
    {
      key: 'paired-segments:paired-base:0:segment-0',
      left: 40,
      top: 24,
      width: 100,
      height: 40,
      tone: 'delete',
      openTop: false,
      openBottom: false,
    },
    {
      key: 'paired-segments:paired-base:0:segment-1',
      left: 240,
      top: 24,
      width: 100,
      height: 40,
      tone: 'delete',
      openTop: false,
      openBottom: false,
    },
  ]);
});

test('mergeWorkbookDiffRegionOverlayBoxes keeps staggered column islands separate', () => {
  const merged = mergeWorkbookDiffRegionOverlayBoxes([
    { key: 'top', left: 0, top: 0, width: 120, height: 21 },
    { key: 'bottom-shifted', left: 52, top: 21, width: 120, height: 21 },
  ]);

  assert.equal(merged.length, 2);
});

test('mergeWorkbookDiffRegionOverlayBoxes preserves shared semantic tone across merged islands', () => {
  const merged = mergeWorkbookDiffRegionOverlayBoxes([
    { key: 'top', left: 0, top: 0, width: 120, height: 21, tone: 'delete' },
    { key: 'bottom', left: 2, top: 20, width: 118, height: 21, tone: 'delete' },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.tone, 'delete');
});

test('buildWorkbookDiffRegionOverlayOutlineSegments removes internal borders between adjacent boxes', () => {
  const outline = buildWorkbookDiffRegionOverlayOutlineSegments([
    { key: 'left', left: 0, top: 0, width: 120, height: 40, tone: 'delete' },
    { key: 'right', left: 120, top: 0, width: 80, height: 40, tone: 'delete' },
  ]);

  assert.deepEqual(outline, [
    { key: '0:delete:0:120', left: 0, top: -1, width: 200, height: 2, tone: 'delete' },
    { key: '0:delete:0:40', left: -1, top: 0, width: 2, height: 40, tone: 'delete' },
    { key: '200:delete:0:40', left: 199, top: 0, width: 2, height: 40, tone: 'delete' },
    { key: '40:delete:0:120', left: 0, top: 39, width: 200, height: 2, tone: 'delete' },
  ]);
});

test('resolveWorkbookRegionHorizontalBounds merges patch spans across paired compare sides', () => {
  const region = buildRegion({
    startCol: 1,
    endCol: 2,
    hasBaseSide: true,
    hasMineSide: true,
    patches: [
      {
        startRowIndex: 0,
        endRowIndex: 0,
        startCol: 1,
        endCol: 1,
        baseRowStart: 2,
        baseRowEnd: 2,
        mineRowStart: 2,
        mineRowEnd: 2,
        hasBaseSide: true,
        hasMineSide: false,
      },
      {
        startRowIndex: 0,
        endRowIndex: 0,
        startCol: 2,
        endCol: 2,
        baseRowStart: 2,
        baseRowEnd: 2,
        mineRowStart: 2,
        mineRowEnd: 2,
        hasBaseSide: false,
        hasMineSide: true,
      },
    ],
  });

  const bounds = resolveWorkbookRegionHorizontalBounds({
    region,
    columnLayoutByColumn: new Map([
      [1, { column: 1, position: 1, width: 100, displayWidth: 200, offset: 100 }],
      [2, { column: 2, position: 2, width: 100, displayWidth: 200, offset: 300 }],
    ]),
    freezeColumnCount: 0,
    resolvePatchBoundsModes: (patch) => [
      ...(patch.hasBaseSide ? ['paired-base' as const] : []),
      ...(patch.hasMineSide ? ['paired-mine' as const] : []),
    ],
  });

  assert.deepEqual(bounds, {
    leftOffset: 100,
    rightOffset: 500,
    width: 400,
  });
});

test('resolveWorkbookRegionHorizontalBounds can span both compare columns for a single-sided patch', () => {
  const region = buildRegion({
    startCol: 1,
    endCol: 1,
    hasBaseSide: false,
    hasMineSide: true,
    patches: [
      {
        startRowIndex: 0,
        endRowIndex: 0,
        startCol: 1,
        endCol: 1,
        baseRowStart: null,
        baseRowEnd: null,
        mineRowStart: 2,
        mineRowEnd: 2,
        hasBaseSide: false,
        hasMineSide: true,
      },
    ],
  });

  const bounds = resolveWorkbookRegionHorizontalBounds({
    region,
    columnLayoutByColumn: new Map([
      [1, { column: 1, position: 1, width: 100, displayWidth: 200, offset: 100 }],
    ]),
    freezeColumnCount: 0,
    resolvePatchBoundsModes: () => ['paired-shared'],
    fallbackBoundsModes: ['paired-shared'],
  });

  assert.deepEqual(bounds, {
    leftOffset: 100,
    rightOffset: 300,
    width: 200,
  });
});

test('buildWorkbookDiffRegionOverlayOutlineSegments respects open top and bottom continuations', () => {
  const outline = buildWorkbookDiffRegionOverlayOutlineSegments([
    { key: 'continued', left: 40, top: 12, width: 100, height: 30, tone: 'mixed', openTop: true, openBottom: true },
  ]);

  assert.deepEqual(outline, [
    { key: '40:mixed:12:42', left: 39, top: 12, width: 2, height: 30, tone: 'mixed' },
    { key: '140:mixed:12:42', left: 139, top: 12, width: 2, height: 30, tone: 'mixed' },
  ]);
});
