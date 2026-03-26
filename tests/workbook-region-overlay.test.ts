import test from 'node:test';
import assert from 'node:assert/strict';

import type { WorkbookDiffRegion } from '../src/types';
import { buildWorkbookRegionOverlayBox } from '../src/utils/workbookRegionOverlay';

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
  assert.equal(box.left, 38);
  assert.equal(box.top, 22);
  assert.equal(box.width, 304);
  assert.equal(box.height, 44);
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
  assert.equal(box.width, 204);
  assert.equal(box.height, 44);
});
