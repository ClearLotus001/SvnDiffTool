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
