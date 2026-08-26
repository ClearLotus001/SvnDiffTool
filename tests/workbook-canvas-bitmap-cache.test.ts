import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WorkbookCanvasBitmapLru,
  WorkbookCanvasBitmapPendingBudget,
  buildWorkbookCanvasBitmapCacheKey,
  buildWorkbookCanvasBitmapViewportColumnKey,
  clearWorkbookCanvasBitmapCache,
  getWorkbookCanvasBitmapCacheStats,
  storeWorkbookCanvasBitmap,
} from '../src/utils/workbook/workbookCanvasBitmapCache';

test('workbook canvas bitmap cache evicts the least recently used tile by byte budget', () => {
  const disposed: string[] = [];
  const cache = new WorkbookCanvasBitmapLru<string>(100, value => disposed.push(value));
  cache.set('a', 'tile-a', 40);
  cache.set('b', 'tile-b', 40);
  assert.equal(cache.get('a'), 'tile-a');
  cache.set('c', 'tile-c', 40);

  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 'tile-a');
  assert.equal(cache.get('c'), 'tile-c');
  assert.equal(cache.bytes, 80);
  assert.deepEqual(disposed, ['tile-b']);
});

test('clearing the workbook bitmap cache disposes stale snapshots that finish later', async () => {
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  let resolveBitmap!: (bitmap: ImageBitmap) => void;
  let closeCount = 0;
  const pendingBitmap = new Promise<ImageBitmap>((resolve) => {
    resolveBitmap = resolve;
  });
  globalThis.createImageBitmap = (() => pendingBitmap) as typeof createImageBitmap;

  try {
    clearWorkbookCanvasBitmapCache();
    const generation = getWorkbookCanvasBitmapCacheStats().generation;
    storeWorkbookCanvasBitmap({ width: 10, height: 10 } as HTMLCanvasElement, 'pending');
    assert.equal(getWorkbookCanvasBitmapCacheStats().pendingEntries, 1);

    clearWorkbookCanvasBitmapCache();
    resolveBitmap({ close: () => { closeCount += 1; } } as ImageBitmap);
    await pendingBitmap;
    await new Promise(resolve => setImmediate(resolve));

    const stats = getWorkbookCanvasBitmapCacheStats();
    assert.equal(stats.generation, generation + 1);
    assert.equal(stats.entries, 0);
    assert.equal(stats.pendingEntries, 0);
    assert.equal(closeCount, 1);
  } finally {
    clearWorkbookCanvasBitmapCache();
    if (previousCreateImageBitmap === undefined) {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    } else {
      globalThis.createImageBitmap = previousCreateImageBitmap;
    }
  }
});

test('workbook canvas bitmap cache rejects a tile larger than its complete budget', () => {
  const disposed: string[] = [];
  const cache = new WorkbookCanvasBitmapLru<string>(64, value => disposed.push(value));

  assert.equal(cache.set('oversized', 'large-tile', 65), false);
  assert.equal(cache.size, 0);
  assert.deepEqual(disposed, ['large-tile']);
});

test('workbook canvas bitmap cache keys preserve object identity and semantic parts', () => {
  const owner = {};
  const first = buildWorkbookCanvasBitmapCacheKey('pane', [owner, 'rows:1-10', 48]);
  const second = buildWorkbookCanvasBitmapCacheKey('pane', [owner, 'rows:1-10', 48]);
  const different = buildWorkbookCanvasBitmapCacheKey('pane', [{}, 'rows:1-10', 48]);

  assert.equal(first, second);
  assert.notEqual(first, different);
});

test('workbook canvas bitmap cache bounds concurrent snapshot memory', () => {
  const pending = new WorkbookCanvasBitmapPendingBudget(100, 2);

  assert.equal(pending.reserve('a', 40), true);
  assert.equal(pending.reserve('a', 40), false);
  assert.equal(pending.reserve('b', 40), true);
  assert.equal(pending.reserve('c', 10), false);
  assert.equal(pending.count, 2);
  assert.equal(pending.bytes, 80);

  pending.release('a');
  assert.equal(pending.reserve('c', 60), true);
  assert.equal(pending.count, 2);
  assert.equal(pending.bytes, 100);
});

test('workbook canvas bitmap cache rejects pending snapshots above its byte budget', () => {
  const pending = new WorkbookCanvasBitmapPendingBudget(64, 4);

  assert.equal(pending.reserve('oversized', 65), false);
  assert.equal(pending.count, 0);
  assert.equal(pending.bytes, 0);
});

test('workbook canvas bitmap viewport keys ignore different offscreen overscan windows', () => {
  const visibleFrame = {
    entry: { column: 10, width: 120, displayWidth: 120 },
    drawLeft: 40,
    left: 40,
    right: 160,
    frozen: false,
  };
  const leftOverscan = {
    entry: { column: 9, width: 120, displayWidth: 120 },
    drawLeft: -140,
    left: -140,
    right: -20,
    frozen: false,
  };
  const rightOverscan = {
    entry: { column: 11, width: 120, displayWidth: 120 },
    drawLeft: 640,
    left: 640,
    right: 760,
    frozen: false,
  };

  assert.equal(
    buildWorkbookCanvasBitmapViewportColumnKey([leftOverscan, visibleFrame], 600),
    buildWorkbookCanvasBitmapViewportColumnKey([visibleFrame, rightOverscan], 600),
  );
});
