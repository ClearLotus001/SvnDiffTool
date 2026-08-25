import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkbookMiniMapDiffMarkers,
  computeMiniMapTargetScrollTop,
  interpolateMiniMapDragScrollTop,
  resolveWorkbookMiniMapProjectionHeight,
} from '../src/components/workbook/WorkbookMiniMap';

test('computeMiniMapTargetScrollTop centers the clicked position and clamps bounds', () => {
  assert.equal(computeMiniMapTargetScrollTop(0, 1000, 200), 0);
  assert.equal(computeMiniMapTargetScrollTop(0.5, 1000, 200), 400);
  assert.equal(computeMiniMapTargetScrollTop(1, 1000, 200), 800);
});

test('interpolateMiniMapDragScrollTop approaches the target without overshooting', () => {
  assert.equal(interpolateMiniMapDragScrollTop(100, 200, 0.5), 150);
  assert.equal(interpolateMiniMapDragScrollTop(200, 100, 0.5), 150);
  assert.equal(interpolateMiniMapDragScrollTop(100, 200, 2), 200);
  assert.equal(interpolateMiniMapDragScrollTop(199.75, 200), 200);
});

test('workbook minimap preserves bottom whitespace when content is shorter than the viewport', () => {
  const canvasHeight = 240;
  const contentHeight = 96;
  const markers = buildWorkbookMiniMapDiffMarkers(
    [
      { tone: 'equal', height: 72 },
      { tone: 'modify', tones: ['modify'], height: 24 },
    ],
    contentHeight,
    canvasHeight,
  );

  assert.equal(resolveWorkbookMiniMapProjectionHeight(contentHeight, canvasHeight), canvasHeight);
  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.top, 72);
  assert.equal(markers[0]?.height, 24);
  assert.ok((markers[0]?.top ?? 0) + (markers[0]?.height ?? 0) < canvasHeight);
});

test('workbook minimap expands tiny trailing diff markers so ultra-long sheets remain visible', () => {
  const canvasHeight = 850;
  const rowHeight = 24;
  const contentHeight = 24 + (58046 * rowHeight);
  const markers = buildWorkbookMiniMapDiffMarkers(
    [
      { tone: 'equal', height: 24 + (58022 * rowHeight) },
      { tone: 'mixed', height: 24 * rowHeight },
    ],
    contentHeight,
    canvasHeight,
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.tone, 'mixed');
  assert.deepEqual(markers[0]?.tones, ['modify']);
  assert.equal(markers[0]?.height, 3);
  assert.equal(markers[0]?.top, 847);
  assert.ok((markers[0]?.top ?? 0) + (markers[0]?.height ?? 0) <= canvasHeight);
});

test('workbook minimap markers preserve concrete constituent tones after compression merges', () => {
  const markers = buildWorkbookMiniMapDiffMarkers(
    [
      { tone: 'delete', tones: ['delete'], height: 24 },
      { tone: 'mixed', tones: ['delete', 'modify'], height: 24 },
    ],
    48,
    3,
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.tone, 'mixed');
  assert.deepEqual(markers[0]?.tones, ['delete', 'modify']);
});

test('ultra-long workbook marker drawing preserves its source row center', () => {
  const rowHeight = 24;
  const rowCount = 64_000;
  const changedRow = 60_701;
  const canvasHeight = 466;
  const beforeHeight = rowHeight + ((changedRow - 2) * rowHeight);
  const contentHeight = rowHeight + (rowCount * rowHeight);
  const markers = buildWorkbookMiniMapDiffMarkers([
    { tone: 'equal', height: beforeHeight },
    { tone: 'modify', tones: ['modify'], height: rowHeight },
    { tone: 'equal', height: contentHeight - beforeHeight - rowHeight },
  ], contentHeight, canvasHeight);

  const marker = markers[0];
  assert.ok(marker);
  const expectedCenter = ((beforeHeight + (rowHeight / 2)) / contentHeight) * canvasHeight;
  assert.ok(Math.abs((marker.top + (marker.height / 2)) - expectedCenter) < 0.01);
});

test('workbook minimap keeps adjacent modify add and delete markers visually distinct', () => {
  const markers = buildWorkbookMiniMapDiffMarkers(
    [
      { tone: 'modify', tones: ['modify'], height: 24 },
      { tone: 'add', tones: ['add'], height: 168 },
      { tone: 'delete', tones: ['delete'], height: 144 },
    ],
    336,
    336,
  );

  assert.deepEqual(markers, [
    { tone: 'modify', top: 0, height: 24, tones: ['modify'] },
    { tone: 'add', top: 24, height: 168, tones: ['add'] },
    { tone: 'delete', top: 192, height: 144, tones: ['delete'] },
  ]);
});
