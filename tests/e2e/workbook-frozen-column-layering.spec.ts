import { expect, test, type Page } from '@playwright/test';

import { LN_W } from '../../src/constants/layout';
import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
  WORKBOOK_CELL_WIDTH,
} from '../../src/utils/workbook/workbookDisplay';

function buildWideWorkbook(lastValue: string): string {
  const columns = Array.from({ length: 20 }, (_, index) => `Column ${index + 1}`);
  return [
    createWorkbookSheetLine('Layering'),
    createWorkbookRowLine(1, columns),
    createWorkbookRowLine(2, columns.map((_, index) => (
      index === columns.length - 1 ? lastValue : `Value ${index + 1}`
    ))),
  ].join('\n');
}

async function loadWideWorkbookDiff(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  const baseContent = buildWideWorkbook('Before');
  const mineContent = buildWideWorkbook('After');
  await page.evaluate(async ({ baseContent: baseWorkbookContent, mineContent: mineWorkbookContent }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'frozen-column-layering.xlsx',
      baseName: 'frozen-column-layering-base.xlsx',
      mineName: 'frozen-column-layering-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: baseWorkbookContent,
      mineContent: mineWorkbookContent,
    });
  }, { baseContent, mineContent });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);
}

test('scrolling columns keeps floating header borders out of the frozen column', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  const paneScrollers = page.locator('.overflow-auto.relative');
  await expect(paneScrollers).toHaveCount(2);
  const headerCanvases = page.locator('[data-workbook-column-header-canvas="true"]');
  await expect(headerCanvases).toHaveCount(2);
  await expect.poll(() => paneScrollers.first().evaluate((element) => (
    element.scrollWidth - element.clientWidth
  ))).toBeGreaterThan(64);

  await paneScrollers.first().evaluate((element) => {
    element.scrollLeft = 64;
  });
  await expect.poll(() => paneScrollers.first().evaluate((element) => element.scrollLeft)).toBe(64);

  await expect.poll(() => headerCanvases.first().evaluate((canvas, sample) => {
    if (!(canvas instanceof HTMLCanvasElement)) return Number.POSITIVE_INFINITY;
    const context = canvas.getContext('2d');
    if (!context) return Number.POSITIVE_INFINITY;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const colors = new Set<string>();
    for (let x = sample.startX; x <= sample.endX; x += 1) {
      const pixel = context.getImageData(
        Math.floor(x * scaleX),
        Math.floor(sample.y * scaleY),
        1,
        1,
      ).data;
      colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
    }
    return colors.size;
  }, {
    startX: LN_W + 3 + 8,
    endX: LN_W + 3 + WORKBOOK_CELL_WIDTH - 8,
    y: 4,
  })).toBe(1);
});
