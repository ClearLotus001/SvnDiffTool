import { expect, test } from '@playwright/test';

import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../../src/utils/workbook/workbookDisplay';

function buildFastScrollWorkbook(rowCount: number, columnCount: number, changed: boolean): string {
  const columns = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  return [
    createWorkbookSheetLine('FastScroll'),
    createWorkbookRowLine(1, columns),
    ...Array.from({ length: rowCount }, (_, rowIndex) => (
      createWorkbookRowLine(rowIndex + 2, columns.map((_, columnIndex) => (
        changed && columnIndex === columnCount - 1 && rowIndex % 137 === 0
          ? `changed-${rowIndex + 1}`
          : `R${rowIndex + 1}C${columnIndex + 1}`
      )))
    )),
  ].join('\n');
}

for (const layout of ['split-v', 'unified', 'split-h'] as const) {
test(`fast workbook minimap dragging keeps a rendered canvas over the ${layout} viewport`, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  const baseContent = buildFastScrollWorkbook(1_600, 32, false);
  const mineContent = buildFastScrollWorkbook(1_600, 32, true);
  await page.evaluate(async ({ baseContent: base, mineContent: mine, layout: targetLayout }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'fast-scroll.xlsx',
      baseName: 'fast-scroll-base.xlsx',
      mineName: 'fast-scroll-mine.xlsx',
      layout: targetLayout,
      collapseCtx: false,
      baseContent: base,
      mineContent: mine,
    });
  }, { baseContent, mineContent, layout });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const scrollers = layout === 'split-h'
    ? page.locator('.overflow-auto.relative')
    : page.locator('.overflow-y-auto.overflow-x-auto.relative.min-w-0.min-h-0');
  const miniMap = page.getByRole('navigation', { name: 'Worksheet diff mini map; use arrow and page keys to scroll' });
  const thumb = miniMap.locator('.minimap-viewport-frosted');
  await expect(scrollers).toHaveCount(layout === 'split-h' ? 2 : 1);
  await expect(thumb).toBeVisible();

  await page.evaluate((targetLayout) => {
    type FastDragProbeWindow = Window & {
      __workbookFastDragProbe?: {
        active: boolean;
        samples: Array<{ scrollTop: number; paintedCanvasCount: number; fastCanvasIds: number[] }>;
      };
    };
    const probeWindow = window as FastDragProbeWindow;
    const selector = targetLayout === 'split-h'
      ? '.overflow-auto.relative'
      : '.overflow-y-auto.overflow-x-auto.relative.min-w-0.min-h-0';
    const targetScroller = document.querySelector<HTMLDivElement>(selector);
    if (!targetScroller) throw new Error('Workbook scroller not found');
    const canvasIds = new WeakMap<HTMLCanvasElement, number>();
    let nextCanvasId = 1;
    const probe = {
      active: true,
      samples: [] as Array<{ scrollTop: number; paintedCanvasCount: number; fastCanvasIds: number[] }>,
    };
    probeWindow.__workbookFastDragProbe = probe;

    const sample = () => {
      if (!probe.active) return;
      const viewport = targetScroller.getBoundingClientRect();
      const fastViewportCanvases = [...document.querySelectorAll<HTMLDivElement>('[data-workbook-fast-scroll-viewport]')]
        .flatMap(surface => [...surface.querySelectorAll<HTMLCanvasElement>('[data-workbook-cell-canvas="true"]')]);
      const candidates = fastViewportCanvases.length > 0
        ? fastViewportCanvases
        : [...document.querySelectorAll<HTMLCanvasElement>('[data-workbook-cell-canvas="true"]')];
      const paintedCanvasCount = candidates
        .filter(canvas => canvas.getAttribute('data-workbook-header-row-canvas') !== 'true')
        .filter(canvas => {
          const rect = canvas.getBoundingClientRect();
          return rect.bottom > viewport.top && rect.top < viewport.bottom;
        })
        .filter(canvas => {
          const context = canvas.getContext('2d');
          if (!context || canvas.width <= 0 || canvas.height <= 0) return false;
          let opaqueSamples = 0;
          for (let yIndex = 1; yIndex <= 3; yIndex += 1) {
            for (let xIndex = 1; xIndex <= 4; xIndex += 1) {
              const x = Math.min(canvas.width - 1, Math.floor((canvas.width * xIndex) / 5));
              const y = Math.min(canvas.height - 1, Math.floor((canvas.height * yIndex) / 4));
              const pixel = context.getImageData(x, y, 1, 1).data;
              if ((pixel[3] ?? 0) > 0) opaqueSamples += 1;
            }
          }
          return opaqueSamples > 0;
        })
        .length;
      const fastCanvasIds = fastViewportCanvases.map(canvas => {
        const existing = canvasIds.get(canvas);
        if (existing) return existing;
        const id = nextCanvasId;
        nextCanvasId += 1;
        canvasIds.set(canvas, id);
        return id;
      });
      probe.samples.push({ scrollTop: targetScroller.scrollTop, paintedCanvasCount, fastCanvasIds });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, layout);

  const thumbBox = await thumb.boundingBox();
  const miniMapBox = await miniMap.boundingBox();
  expect(thumbBox).not.toBeNull();
  expect(miniMapBox).not.toBeNull();
  const pointerX = thumbBox!.x + (thumbBox!.width / 2);
  const startY = thumbBox!.y + (thumbBox!.height / 2);
  const endY = miniMapBox!.y + miniMapBox!.height - 12;
  await page.mouse.move(pointerX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 18; step += 1) {
    await page.mouse.move(pointerX, startY + ((endY - startY) * (step / 18)));
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
  await page.waitForTimeout(180);

  const result = await page.evaluate(() => {
    type FastDragProbeWindow = Window & {
      __workbookFastDragProbe?: {
        active: boolean;
        samples: Array<{ scrollTop: number; paintedCanvasCount: number; fastCanvasIds: number[] }>;
      };
    };
    const probe = (window as FastDragProbeWindow).__workbookFastDragProbe;
    if (!probe) throw new Error('Fast drag probe missing');
    probe.active = false;
    const movingSamples = probe.samples.filter(sample => sample.scrollTop > 0);
    const fastSamples = movingSamples.filter(sample => sample.fastCanvasIds.length > 0);
    let primaryCanvasReplacements = 0;
    for (let index = 1; index < fastSamples.length; index += 1) {
      if (fastSamples[index]?.fastCanvasIds[0] !== fastSamples[index - 1]?.fastCanvasIds[0]) {
        primaryCanvasReplacements += 1;
      }
    }
    return {
      movingSampleCount: movingSamples.length,
      emptyFrameCount: movingSamples.filter(sample => sample.paintedCanvasCount === 0).length,
      maxScrollTop: Math.max(0, ...movingSamples.map(sample => sample.scrollTop)),
      primaryCanvasReplacements,
    };
  });

  expect(result.movingSampleCount).toBeGreaterThan(0);
  expect(result.maxScrollTop).toBeGreaterThan(10_000);
  expect(result.emptyFrameCount).toBe(0);
  expect(result.primaryCanvasReplacements).toBe(0);
  await expect(page.locator('[data-workbook-fast-scroll-viewport]')).toHaveCount(0);
  if (layout === 'split-h') {
    await expect.poll(() => scrollers.evaluateAll(elements => elements.map(element => Math.round(element.scrollTop))))
      .toEqual([Math.round(result.maxScrollTop), Math.round(result.maxScrollTop)]);
  }

  const implicitSession = await scrollers.first().evaluate(async (element) => {
    element.scrollTop = 0;
    await new Promise(resolve => setTimeout(resolve, 220));
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.4;
    await new Promise(resolve => setTimeout(resolve, 40));
    const activeViewportCount = document.querySelectorAll('[data-workbook-fast-scroll-viewport]').length;
    await new Promise(resolve => setTimeout(resolve, 240));
    return {
      activeViewportCount,
      settledViewportCount: document.querySelectorAll('[data-workbook-fast-scroll-viewport]').length,
    };
  });
  expect(implicitSession.activeViewportCount).toBeGreaterThan(0);
  expect(implicitSession.settledViewportCount).toBe(0);

  const beforeClickScrollTop = await scrollers.first().evaluate(element => element.scrollTop);
  await page.mouse.click(
    miniMapBox!.x + (miniMapBox!.width / 2),
    miniMapBox!.y + (miniMapBox!.height * 0.2),
  );
  await page.waitForTimeout(8);
  const clickPreview = page.locator('[data-workbook-fast-scroll-viewport]');
  await expect.poll(() => clickPreview.count()).toBeGreaterThan(0);
  const clickPreviewOpaquePixels = await clickPreview.locator('canvas').evaluateAll(canvases => canvases.reduce(
    (opaque, canvas) => {
      const workbookCanvas = canvas as HTMLCanvasElement;
      const context = workbookCanvas.getContext('2d');
      if (!context || workbookCanvas.width <= 0 || workbookCanvas.height <= 0) return opaque;
      const pixel = context.getImageData(
        Math.floor(workbookCanvas.width / 2),
        Math.floor(workbookCanvas.height / 2),
        1,
        1,
      ).data;
      return opaque + ((pixel[3] ?? 0) > 0 ? 1 : 0);
    },
    0,
  ));
  expect(clickPreviewOpaquePixels).toBeGreaterThan(0);
  await page.waitForTimeout(180);
  await expect(clickPreview).toHaveCount(0);
  await expect.poll(() => scrollers.first().evaluate(element => element.scrollTop)).not.toBe(beforeClickScrollTop);
});
}
