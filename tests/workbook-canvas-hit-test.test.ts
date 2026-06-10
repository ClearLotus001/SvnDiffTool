import test from 'node:test';
import assert from 'node:assert/strict';

import type { HorizontalVirtualColumnEntry } from '../src/hooks/virtualization/useHorizontalVirtualColumns';
import {
  buildWorkbookCanvasHitColumnFrames,
  findWorkbookCanvasHitXFrame,
  findWorkbookCanvasHitYFrame,
} from '../src/utils/workbook/workbookCanvasHitTest';

function column(
  columnIndex: number,
  position: number,
  width: number,
  displayWidth: number,
  offset: number,
): HorizontalVirtualColumnEntry {
  return {
    column: columnIndex,
    position,
    width,
    displayWidth,
    offset,
  };
}

test('buildWorkbookCanvasHitColumnFrames clips floating columns behind the frozen pane', () => {
  const frames = buildWorkbookCanvasHitColumnFrames({
    contentLeft: 10,
    frozenWidth: 80,
    scrollLeft: 45,
    frozenEntries: [
      column(0, 0, 40, 40, 0),
      column(1, 1, 40, 40, 40),
    ],
    floatingEntries: [
      column(2, 2, 50, 50, 80),
      column(3, 3, 50, 50, 130),
    ],
  });

  assert.deepEqual(frames.map((frame) => ({
    column: frame.entry.column,
    drawLeft: frame.drawLeft,
    left: frame.left,
    right: frame.right,
    frozen: frame.frozen,
  })), [
    { column: 0, drawLeft: 10, left: 10, right: 50, frozen: true },
    { column: 1, drawLeft: 50, left: 50, right: 90, frozen: true },
    { column: 2, drawLeft: 45, left: 90, right: 95, frozen: false },
    { column: 3, drawLeft: 95, left: 95, right: 145, frozen: false },
  ]);
});

test('findWorkbookCanvasHitXFrame uses the clipped viewport rect', () => {
  const frames = buildWorkbookCanvasHitColumnFrames({
    contentLeft: 10,
    frozenWidth: 80,
    scrollLeft: 45,
    frozenEntries: [
      column(0, 0, 40, 40, 0),
      column(1, 1, 40, 40, 40),
    ],
    floatingEntries: [
      column(2, 2, 50, 50, 80),
      column(3, 3, 50, 50, 130),
    ],
  });

  assert.equal(findWorkbookCanvasHitXFrame(frames, 89)?.entry.column, 1);
  assert.equal(findWorkbookCanvasHitXFrame(frames, 90)?.entry.column, 2);
  assert.equal(findWorkbookCanvasHitXFrame(frames, 94)?.entry.column, 2);
  assert.equal(findWorkbookCanvasHitXFrame(frames, 95)?.entry.column, 3);
  assert.equal(findWorkbookCanvasHitXFrame(frames, 145), null);
});

test('buildWorkbookCanvasHitColumnFrames supports paired display widths', () => {
  const frames = buildWorkbookCanvasHitColumnFrames({
    contentLeft: 6,
    frozenWidth: 0,
    scrollLeft: 30,
    frozenEntries: [],
    floatingEntries: [
      column(4, 0, 70, 140, 30),
    ],
    getDrawWidth: (entry) => entry.displayWidth,
  });

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.drawLeft, 6);
  assert.equal(frames[0]?.left, 6);
  assert.equal(frames[0]?.right, 146);
  assert.equal(findWorkbookCanvasHitXFrame(frames, 100)?.entry.column, 4);
});

test('findWorkbookCanvasHitYFrame uses half-open row frames', () => {
  const frames = [
    { top: 0, bottom: 24, label: 'a' },
    { top: 24, bottom: 48, label: 'b' },
  ];

  assert.equal(findWorkbookCanvasHitYFrame(frames, 0)?.label, 'a');
  assert.equal(findWorkbookCanvasHitYFrame(frames, 23.9)?.label, 'a');
  assert.equal(findWorkbookCanvasHitYFrame(frames, 24)?.label, 'b');
  assert.equal(findWorkbookCanvasHitYFrame(frames, 48), null);
});
