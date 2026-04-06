import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkbookMiniMapDiffMarkers,
  computeMiniMapTargetScrollTop,
} from '../src/components/workbook/WorkbookMiniMap';

test('computeMiniMapTargetScrollTop centers the clicked position and clamps bounds', () => {
  assert.equal(computeMiniMapTargetScrollTop(0, 1000, 200), 0);
  assert.equal(computeMiniMapTargetScrollTop(0.5, 1000, 200), 400);
  assert.equal(computeMiniMapTargetScrollTop(1, 1000, 200), 800);
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
