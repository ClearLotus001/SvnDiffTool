import test from 'node:test';
import assert from 'node:assert/strict';

import type { HorizontalVirtualColumnEntry } from '../src/hooks/useHorizontalVirtualColumns';
import {
  findWorkbookMergeRange,
  getWorkbookCanvasSpanGeometry,
  getWorkbookColumnSpanBounds,
  getWorkbookMergeDrawInfo,
  getWorkbookSelectionSpanForSelection,
} from '../src/utils/workbookMergeLayout';

const mergeRanges = [
  {
    startRow: 2,
    endRow: 4,
    startCol: 1,
    endCol: 2,
  },
];

function buildSingleColumnLayout(): Map<number, HorizontalVirtualColumnEntry> {
  return new Map([
    [0, { column: 0, position: 0, width: 120, displayWidth: 120, offset: 0 }],
    [1, { column: 1, position: 1, width: 120, displayWidth: 120, offset: 120 }],
    [2, { column: 2, position: 2, width: 120, displayWidth: 120, offset: 240 }],
    [3, { column: 3, position: 3, width: 120, displayWidth: 120, offset: 360 }],
  ]);
}

function buildPairedColumnLayout(): Map<number, HorizontalVirtualColumnEntry> {
  return new Map([
    [0, { column: 0, position: 0, width: 120, displayWidth: 240, offset: 0 }],
    [1, { column: 1, position: 1, width: 120, displayWidth: 240, offset: 240 }],
    [2, { column: 2, position: 2, width: 120, displayWidth: 240, offset: 480 }],
  ]);
}

test('findWorkbookMergeRange resolves cells inside a merged area', () => {
  assert.deepEqual(findWorkbookMergeRange(mergeRanges, 2, 1), mergeRanges[0]);
  assert.deepEqual(findWorkbookMergeRange(mergeRanges, 4, 2), mergeRanges[0]);
  assert.equal(findWorkbookMergeRange(mergeRanges, 5, 2), null);
});

test('getWorkbookSelectionSpanForSelection expands a cell selection to the merged range', () => {
  const span = getWorkbookSelectionSpanForSelection({
    kind: 'cell',
    sheetName: 'Items',
    side: 'base',
    versionLabel: 'BASE',
    rowNumber: 3,
    colIndex: 2,
    colLabel: 'C',
    address: 'C3',
    value: 'Potion',
    formula: '',
  }, mergeRanges);

  assert.deepEqual(span, {
    startCol: 1,
    endCol: 2,
  });
});

test('getWorkbookColumnSpanBounds computes paired mine offsets across multiple columns', () => {
  const bounds = getWorkbookColumnSpanBounds(0, 2, buildPairedColumnLayout(), 'paired-mine', 0);
  assert.ok(bounds);
  assert.equal(bounds.leftOffset, 120);
  assert.equal(bounds.rightOffset, 720);
  assert.equal(bounds.width, 600);
});

test('getWorkbookCanvasSpanGeometry splits a merged region across the frozen boundary', () => {
  const bounds = getWorkbookColumnSpanBounds(1, 2, buildSingleColumnLayout(), 'single', 2);
  assert.ok(bounds);
  const geometry = getWorkbookCanvasSpanGeometry(bounds, 12, 48, 240);
  assert.ok(geometry);
  assert.equal(geometry.segments.length, 2);
  assert.deepEqual(geometry.segments, [
    { left: 132, width: 120 },
    { left: 252, width: 72 },
  ]);
  assert.equal(geometry.left, 132);
  assert.equal(geometry.right, 324);
  assert.equal(geometry.width, 192);
});

test('getWorkbookCanvasSpanGeometry keeps paired-base merge segments non-contiguous across interleaved mine columns', () => {
  const bounds = getWorkbookColumnSpanBounds(1, 2, buildPairedColumnLayout(), 'paired-base', 0);
  assert.ok(bounds);
  const geometry = getWorkbookCanvasSpanGeometry(bounds, 12, 0, 0);
  assert.ok(geometry);
  assert.deepEqual(geometry.segments, [
    { left: 252, width: 120 },
    { left: 492, width: 120 },
  ]);
});

test('getWorkbookMergeDrawInfo clips merged regions to the first visible row in the strip', () => {
  const info = getWorkbookMergeDrawInfo({
    rowNumber: 3,
    column: 1,
    rowTop: 40,
    rowHeight: 20,
    renderedRowNumbers: [3, 4, 5],
    mergedRanges: mergeRanges,
    columnLayoutByColumn: buildSingleColumnLayout(),
    contentLeft: 12,
    currentScrollLeft: 0,
    freezeColumnCount: 0,
    frozenWidth: 0,
    mode: 'single',
  });

  assert.equal(info.covered, true);
  assert.ok(info.region);
  assert.equal(info.region?.left, 132);
  assert.equal(info.region?.top, 40);
  assert.equal(info.region?.width, 240);
  assert.equal(info.region?.height, 40);
  assert.equal(info.region?.visibleStartRow, 3);
});

test('getWorkbookMergeDrawInfo skips covered cells once the merged region is already drawn', () => {
  const info = getWorkbookMergeDrawInfo({
    rowNumber: 4,
    column: 1,
    rowTop: 60,
    rowHeight: 20,
    renderedRowNumbers: [3, 4, 5],
    mergedRanges: mergeRanges,
    columnLayoutByColumn: buildSingleColumnLayout(),
    contentLeft: 12,
    currentScrollLeft: 0,
    freezeColumnCount: 0,
    frozenWidth: 0,
    mode: 'single',
  });

  assert.equal(info.covered, true);
  assert.equal(info.region, null);
});
