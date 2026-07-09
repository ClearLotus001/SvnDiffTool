import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMiniMapDragScrollTop,
  computeMiniMapViewportMetrics,
  computeMiniMapWheelScrollTop,
  resolveMiniMapContentHeight,
  resolveMiniMapTrackHeight,
} from '../src/utils/diff/minimapInteraction';

test('minimap content height falls back to the actual scroller extent during interaction', () => {
  assert.equal(resolveMiniMapContentHeight(900, 1200, 200), 1200);
  assert.equal(resolveMiniMapContentHeight(1500, 1200, 200), 1500);
});

test('minimap interaction track follows the native scrollbar viewport height', () => {
  assert.equal(resolveMiniMapTrackHeight(600, 590), 590);
  assert.equal(resolveMiniMapTrackHeight(580, 590), 580);
});

test('minimap viewport maps scroll position onto the draggable track', () => {
  const metrics = computeMiniMapViewportMetrics({
    scrollTop: 400,
    viewportHeight: 200,
    contentHeight: 1000,
    minimapHeight: 100,
  });

  assert.equal(metrics.height, 20);
  assert.equal(metrics.maxScrollTop, 800);
  assert.equal(metrics.trackHeight, 80);
  assert.equal(metrics.top, 40);
});

test('minimap viewport reaches the bottom when the thumb is using its minimum height', () => {
  const metrics = computeMiniMapViewportMetrics({
    scrollTop: 99_200,
    viewportHeight: 800,
    contentHeight: 100_000,
    minimapHeight: 1000,
  });

  assert.equal(metrics.height, 20);
  assert.equal(metrics.maxScrollTop, 99_200);
  assert.equal(metrics.trackHeight, 980);
  assert.equal(metrics.top, 980);
});

test('minimap thumb drag converts pointer movement into clamped scroll movement', () => {
  assert.equal(
    computeMiniMapDragScrollTop({
      pointerDeltaY: 40,
      startScrollTop: 0,
      maxScrollTop: 800,
      trackHeight: 80,
    }),
    400,
  );

  assert.equal(
    computeMiniMapDragScrollTop({
      pointerDeltaY: 400,
      startScrollTop: 760,
      maxScrollTop: 800,
      trackHeight: 80,
    }),
    800,
  );
});

test('minimap thumb drag is inert when there is no scrollable track', () => {
  assert.equal(
    computeMiniMapDragScrollTop({
      pointerDeltaY: 40,
      startScrollTop: 0,
      maxScrollTop: 0,
      trackHeight: 80,
    }),
    0,
  );
});

test('minimap wheel scrolling uses browser delta modes and clamps bounds', () => {
  assert.equal(
    computeMiniMapWheelScrollTop({
      deltaY: 120,
      deltaMode: 0,
      currentScrollTop: 200,
      maxScrollTop: 1000,
      viewportHeight: 400,
    }),
    320,
  );

  assert.equal(
    computeMiniMapWheelScrollTop({
      deltaY: 3,
      deltaMode: 1,
      currentScrollTop: 200,
      maxScrollTop: 1000,
      viewportHeight: 400,
      lineHeight: 24,
    }),
    272,
  );

  assert.equal(
    computeMiniMapWheelScrollTop({
      deltaY: 1,
      deltaMode: 2,
      currentScrollTop: 900,
      maxScrollTop: 1000,
      viewportHeight: 400,
    }),
    1000,
  );
});
