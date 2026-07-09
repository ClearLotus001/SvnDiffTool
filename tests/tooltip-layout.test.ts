import test from 'node:test';
import assert from 'node:assert/strict';

import { computeTooltipLayout } from '../src/components/shared/Tooltip';

test('computeTooltipLayout centers short tooltips on buttons when space is available', () => {
  const rect = {
    left: 640,
    top: 120,
    right: 668,
    bottom: 148,
    width: 28,
    height: 28,
    x: 640,
    y: 120,
    toJSON() { return {}; },
  } as DOMRect;

  const layout = computeTooltipLayout(rect, 1280, 720, 96, 40, 'top');
  assert.equal(layout.actualPlacement, 'top');
  assert.equal(layout.left, 606);
  assert.equal(layout.arrowOffset, 48);
});

test('computeTooltipLayout clamps tooltip near right edge and shifts arrow inward', () => {
  const rect = {
    left: 1250,
    top: 40,
    right: 1278,
    bottom: 68,
    width: 28,
    height: 28,
    x: 1250,
    y: 40,
    toJSON() { return {}; },
  } as DOMRect;

  const layout = computeTooltipLayout(rect, 1280, 720, 120, 40, 'top');
  assert.equal(layout.left, 1148);
  assert.ok(layout.arrowOffset > 90);
});

test('computeTooltipLayout places menu tooltips beside the hovered control when side space is available', () => {
  const rect = {
    left: 360,
    top: 130,
    right: 620,
    bottom: 172,
    width: 260,
    height: 42,
    x: 360,
    y: 130,
    toJSON() { return {}; },
  } as DOMRect;

  const layout = computeTooltipLayout(rect, 800, 600, 210, 40, 'left');
  assert.equal(layout.actualPlacement, 'left');
  assert.equal(layout.left, 142);
  assert.equal(layout.top, 131);
  assert.equal(layout.arrowOffset, 20);
});

test('computeTooltipLayout can keep side tooltips outside a floating menu boundary', () => {
  const rect = {
    left: 442,
    top: 122,
    right: 536,
    bottom: 160,
    width: 94,
    height: 38,
    x: 442,
    y: 122,
    toJSON() { return {}; },
  } as DOMRect;
  const menuRect = {
    left: 433,
    top: 47,
    right: 725,
    bottom: 249,
    width: 292,
    height: 202,
    x: 433,
    y: 47,
    toJSON() { return {}; },
  } as DOMRect;

  const layout = computeTooltipLayout(rect, 1280, 720, 150, 40, 'left', menuRect);
  assert.equal(layout.actualPlacement, 'left');
  assert.equal(layout.left, 275);
  assert.equal(layout.top, 121);
  assert.equal(layout.arrowOffset, 20);
});

test('computeTooltipLayout flips side tooltips away from the viewport edge', () => {
  const rect = {
    left: 20,
    top: 130,
    right: 280,
    bottom: 172,
    width: 260,
    height: 42,
    x: 20,
    y: 130,
    toJSON() { return {}; },
  } as DOMRect;

  const layout = computeTooltipLayout(rect, 800, 600, 210, 40, 'left');
  assert.equal(layout.actualPlacement, 'right');
  assert.equal(layout.left, 288);
  assert.equal(layout.top, 131);
});
