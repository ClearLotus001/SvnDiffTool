import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../../src/utils/workbook/workbookDisplay';

function buildWorkbook(rows: string[][]) {
  return [
    createWorkbookSheetLine('WideSheet'),
    ...rows.map((cells, index) => createWorkbookRowLine(index + 1, cells)),
  ].join('\n');
}

async function loadWideWorkbookDiff(page: Page) {
  const header = Array.from({ length: 20 }, (_, index) => `Column ${index + 1}`);
  const stable = Array.from({ length: 20 }, (_, index) => `Stable ${index + 1}`);
  const baseTarget = Array.from({ length: 20 }, (_, index) => `Value ${index + 1}`);
  const mineTarget = [...baseTarget];
  mineTarget[18] = 'Changed off-screen value';

  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ baseContent, mineContent }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'wide-navigation.xlsx',
      baseName: 'wide-navigation-base.xlsx',
      mineName: 'wide-navigation-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent,
      mineContent,
    });
  }, {
    baseContent: buildWorkbook([header, stable, baseTarget]),
    mineContent: buildWorkbook([header, stable, mineTarget]),
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);
}

test('clicking a single workbook hunk again scrolls both panes to its off-screen column', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  const paneScrollers = page.locator('.overflow-auto.relative');
  await expect(paneScrollers).toHaveCount(2);
  await expect(page.getByText('1/1', { exact: true })).toBeVisible();

  await paneScrollers.evaluateAll((elements) => {
    elements.forEach((element) => {
      element.scrollLeft = 0;
      element.dispatchEvent(new Event('scroll'));
    });
  });
  await expect.poll(() => paneScrollers.first().evaluate((element) => element.scrollLeft)).toBe(0);

  await page.getByRole('button', { name: /^(?:下一个差异块|Next hunk) \(F7\)$/ }).click();

  await expect.poll(() => paneScrollers.first().evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const scrollLefts = await paneScrollers.evaluateAll((elements) => (
    elements.map((element) => element.scrollLeft)
  ));
  expect(Math.abs((scrollLefts[0] ?? 0) - (scrollLefts[1] ?? 0))).toBeLessThanOrEqual(1);
});

test('workbook minimap markers stay aligned when the table leaves bottom whitespace', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  const thumb = page.locator('.minimap-viewport-frosted');
  await expect(thumb).toBeVisible();

  const metrics = await thumb.evaluate((element) => {
    const rail = element.parentElement;
    const scroller = document.querySelector('.overflow-auto.relative');
    const content = scroller?.firstElementChild;
    const overlay = rail?.querySelectorAll('canvas')[1];
    if (!(rail instanceof HTMLElement) || !(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(overlay instanceof HTMLCanvasElement)) {
      throw new Error('workbook minimap elements are unavailable');
    }

    const context = overlay.getContext('2d');
    if (!context) throw new Error('workbook minimap overlay context is unavailable');
    const pixels = context.getImageData(0, 0, overlay.width, overlay.height).data;
    let markerTop = -1;
    let markerBottom = -1;
    for (let y = 0; y < overlay.height; y += 1) {
      let hasPaint = false;
      for (let x = 0; x < overlay.width; x += 1) {
        if ((pixels[((y * overlay.width) + x) * 4 + 3] ?? 0) > 0) {
          hasPaint = true;
          break;
        }
      }
      if (!hasPaint) continue;
      if (markerTop < 0) markerTop = y;
      markerBottom = y + 1;
    }

    return {
      contentHeight: content.getBoundingClientRect().height,
      viewportHeight: scroller.clientHeight,
      railHeight: rail.clientHeight,
      markerTop,
      markerBottom,
    };
  });

  expect(metrics.contentHeight).toBeLessThan(metrics.viewportHeight);
  expect(metrics.railHeight).toBeGreaterThan(metrics.contentHeight);
  expect(metrics.markerTop).toBeGreaterThanOrEqual(0);
  expect(metrics.markerBottom).toBeLessThanOrEqual(metrics.contentHeight + 2);
});

test('workbook minimap viewport remains transparent in high contrast mode', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  await page.evaluate(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-hc');
    document.documentElement.classList.add('theme-hc');
  });

  const thumb = page.locator('.minimap-viewport-frosted');
  await expect(thumb).toBeVisible();

  const alphas = await thumb.evaluate((element) => {
    const readAlpha = () => {
      const backgroundColor = getComputedStyle(element).backgroundColor;
      const colorAlpha = backgroundColor.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
      if (colorAlpha) return Number(colorAlpha);
      const rgbaAlpha = backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/)?.[1];
      if (rgbaAlpha) return Number(rgbaAlpha);
      return backgroundColor === 'transparent' ? 0 : 1;
    };

    const idle = readAlpha();
    element.setAttribute('data-dragging', 'true');
    const dragging = readAlpha();
    element.removeAttribute('data-dragging');
    return {
      idle,
      dragging,
      backdropFilter: getComputedStyle(element).backdropFilter,
    };
  });

  expect(alphas.idle).toBe(0);
  expect(alphas.dragging).toBeGreaterThan(alphas.idle);
  expect(alphas.dragging).toBeLessThanOrEqual(0.1);
  expect(alphas.backdropFilter).toBe('none');
});
