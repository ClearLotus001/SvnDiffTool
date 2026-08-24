import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkbookCanvasBorderRegistry,
  registerWorkbookCanvasCellBorders,
  WORKBOOK_CANVAS_BORDER_PRIORITY,
} from '../src/utils/workbook/workbookCanvasBorders';

interface FillRectCall {
  fillStyle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function createMockContext() {
  const calls: FillRectCall[] = [];
  let fillStyle = '';

  return {
    calls,
    ctx: {
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      fillRect(x: number, y: number, width: number, height: number) {
        calls.push({ fillStyle, x, y, width, height });
      },
    } as unknown as CanvasRenderingContext2D,
  };
}

test('collapses shared borders between adjacent cells into a single line', () => {
  const registry = createWorkbookCanvasBorderRegistry();
  const { calls, ctx } = createMockContext();

  registry.addRect({ x: 0, y: 0, width: 10, height: 10, color: '#aaa' });
  registry.addRect({ x: 10, y: 0, width: 10, height: 10, color: '#aaa' });
  registry.flush(ctx);

  const sharedVerticalEdges = calls.filter((call) => (
    call.width === 1
    && call.height === 10
    && (call.x === 9 || call.x === 10)
  ));

  assert.equal(sharedVerticalEdges.length, 1);
  assert.deepEqual(sharedVerticalEdges[0], {
    fillStyle: '#aaa',
    x: 10,
    y: 0,
    width: 1,
    height: 10,
  });
});

test('prefers higher-priority changed borders on shared seams', () => {
  const registry = createWorkbookCanvasBorderRegistry();
  const { calls, ctx } = createMockContext();

  registry.addRect({ x: 0, y: 0, width: 10, height: 10, color: '#f80', priority: 2 });
  registry.addRect({ x: 10, y: 0, width: 10, height: 10, color: '#999', priority: 0 });
  registry.flush(ctx);

  const sharedVerticalEdge = calls.find((call) => (
    call.width === 1
    && call.height === 10
    && (call.x === 9 || call.x === 10)
  ));

  assert.deepEqual(sharedVerticalEdge, {
    fillStyle: '#f80',
    x: 10,
    y: 0,
    width: 1,
    height: 10,
  });
});

test('splits overlapping merged-cell seams without double-drawing', () => {
  const registry = createWorkbookCanvasBorderRegistry();
  const { calls, ctx } = createMockContext();

  registry.addRect({ x: 0, y: 0, width: 10, height: 10, color: '#999', priority: 0 });
  registry.addRect({ x: 10, y: 0, width: 10, height: 10, color: '#999', priority: 0 });
  registry.addRect({ x: 0, y: 10, width: 20, height: 10, color: '#f80', priority: 2 });
  registry.flush(ctx);

  const sharedHorizontalEdges = calls.filter((call) => (
    call.height === 1
    && call.width > 0
    && (call.y === 9 || call.y === 10)
  ));

  assert.deepEqual(sharedHorizontalEdges, [
    {
      fillStyle: '#f80',
      x: 0,
      y: 10,
      width: 20,
      height: 1,
    },
  ]);
});

test('selection borders replace diff borders and keep shared seams single-colored', () => {
  const registry = createWorkbookCanvasBorderRegistry();
  const { calls, ctx } = createMockContext();

  registry.addRect({ x: 0, y: 0, width: 10, height: 10, color: '#c44', priority: 2 });
  registry.addRect({ x: 0, y: 0, width: 10, height: 10, color: '#247', thickness: 2, priority: 5 });
  registry.addRect({ x: 10, y: 0, width: 10, height: 10, color: '#c44', priority: 2 });
  registry.addRect({ x: 10, y: 0, width: 10, height: 10, color: '#864', thickness: 2, priority: 3 });
  registry.flush(ctx);

  const sharedVerticalEdges = calls.filter((call) => (
    call.height === 10
    && call.x >= 8
    && call.x <= 11
  ));

  assert.deepEqual(sharedVerticalEdges, [{
    fillStyle: '#247',
    x: 8,
    y: 0,
    width: 2,
    height: 10,
  }]);
  assert.equal(calls.some(call => call.fillStyle === '#c44'), false);
});

test('axis selection borders override only their edges and preserve semantic sides', () => {
  const registry = createWorkbookCanvasBorderRegistry();
  const { calls, ctx } = createMockContext();

  registerWorkbookCanvasCellBorders({
    registry,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    semantic: {
      color: '#c44',
      thickness: 1,
      priority: WORKBOOK_CANVAS_BORDER_PRIORITY.diff,
    },
    selection: {
      color: '#247',
      thickness: 2,
      priority: WORKBOOK_CANVAS_BORDER_PRIORITY.axisSelection,
      edges: { top: true, right: false, bottom: true, left: false },
    },
  });
  registry.flush(ctx);

  assert.equal(calls.filter(call => call.fillStyle === '#247').length, 2);
  assert.equal(calls.some(call => call.fillStyle === '#c44' && call.width === 10), false);
  assert.equal(calls.filter(call => call.fillStyle === '#c44' && call.width === 1).length, 2);
});
