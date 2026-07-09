import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

async function loadLargeUnifiedDiff(page: Page) {
  const wideTail = 'x'.repeat(360);
  const baseLines = Array.from({ length: 1200 }, (_, index) => `stable line ${index + 1} ${wideTail}`);
  const mineLines = [...baseLines];
  mineLines[640] = `stable line 641 changed ${wideTail}`;

  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ baseContent, mineContent }) => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'minimap-viewport.lua',
      baseName: 'minimap-viewport-base.lua',
      mineName: 'minimap-viewport-mine.lua',
      layout: 'unified',
      collapseCtx: false,
      baseContent,
      mineContent,
    });
  }, {
    baseContent: baseLines.join('\n'),
    mineContent: mineLines.join('\n'),
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

test('minimap viewport thumb stays visible above the diff overlay', async ({ page }) => {
  await loadLargeUnifiedDiff(page);

  const scroller = page.locator('.overflow-y-auto.overflow-x-auto').first();
  await scroller.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.45;
  });

  const thumb = page.locator('.minimap-viewport-frosted').first();
  await expect(thumb).toBeVisible();

  const metrics = await thumb.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const railRect = element.parentElement?.getBoundingClientRect() ?? rect;
    const overlay = element.parentElement?.querySelector('canvas.pointer-events-none');
    const overlayZIndex = overlay ? getComputedStyle(overlay).zIndex : '0';
    const shell = element.parentElement?.parentElement;
    const scroller = shell?.querySelector('.overflow-y-auto.overflow-x-auto, .overflow-auto') as HTMLElement | null;
    const mapHeight = scroller
      ? Math.min(railRect.height, scroller.clientHeight)
      : railRect.height;
    const maxScrollTop = scroller
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : 0;
    const scrollTop = scroller?.scrollTop ?? 0;
    const expectedHeight = scroller
      ? Math.min(mapHeight, Math.max(20, (scroller.clientHeight / Math.max(scroller.scrollHeight, scroller.clientHeight, 1)) * mapHeight))
      : 20;
    const expectedTop = maxScrollTop > 0
      ? (scrollTop / maxScrollTop) * Math.max(0, mapHeight - expectedHeight)
      : 0;
    const topElement = document.elementFromPoint(
      rect.left + (rect.width / 2),
      rect.top + Math.min(rect.height / 2, 12),
    );

    return {
      height: rect.height,
      backgroundImage: style.backgroundImage,
      borderTopColor: style.borderTopColor,
      opacity: Number(style.opacity),
      zIndex: Number(style.zIndex),
      overlayZIndex: Number(overlayZIndex),
      top: rect.top - railRect.top,
      expectedHeight,
      expectedTop,
      isTopElement: topElement === element,
    };
  });

  expect(metrics.height).toBeGreaterThanOrEqual(20);
  expect(Math.abs(metrics.height - metrics.expectedHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.top - metrics.expectedTop)).toBeLessThanOrEqual(1);
  expect(metrics.backgroundImage).not.toBe('none');
  expect(metrics.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics.opacity).toBeGreaterThanOrEqual(0.7);
  expect(metrics.opacity).toBeLessThan(0.9);
  expect(metrics.zIndex).toBeGreaterThan(metrics.overlayZIndex);
  expect(metrics.isTopElement).toBe(true);
});

test('diff scroll viewport keeps the native vertical scrollbar available', async ({ page }) => {
  await loadLargeUnifiedDiff(page);

  const scroller = page.locator('.overflow-y-auto.overflow-x-auto').first();
  await expect(scroller).toBeVisible();

  const verticalScrollbar = await scroller.evaluate((element) => {
    const style = getComputedStyle(element, '::-webkit-scrollbar');
    return {
      width: style.width,
    };
  });

  expect(verticalScrollbar.width).not.toBe('0px');
});

test('mouse wheel over the minimap thumb scrolls the diff viewport', async ({ page }) => {
  await loadLargeUnifiedDiff(page);

  const thumb = page.locator('.minimap-viewport-frosted').first();
  const scroller = page.locator('.overflow-y-auto.overflow-x-auto').first();
  await expect(thumb).toBeVisible();
  await expect(scroller).toBeVisible();

  const before = await scroller.evaluate((element) => element.scrollTop);
  const box = await thumb.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + (box!.width / 2), box!.y + Math.min(box!.height / 2, 8));
  await page.mouse.wheel(0, 420);

  await expect.poll(
    () => scroller.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(before);
});
