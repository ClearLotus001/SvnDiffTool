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

function buildTallWorkbook(rowCount = 80): string {
  return [
    createWorkbookSheetLine('VerticalFocus'),
    createWorkbookRowLine(1, ['ID', 'Name', 'Value']),
    ...Array.from({ length: rowCount }, (_, index) => (
      createWorkbookRowLine(index + 2, [String(index + 1), `Item ${index + 1}`, String(index * 10)])
    )),
  ].join('\n');
}

async function loadWideWorkbookDiff(
  page: Page,
  layout: 'unified' | 'split-h' | 'split-v' = 'split-h',
  withChangedTail = true,
) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  const baseContent = buildWideWorkbook('Before');
  const mineContent = buildWideWorkbook(withChangedTail ? 'After' : 'Before');
  await page.evaluate(async ({
    baseContent: baseWorkbookContent,
    mineContent: mineWorkbookContent,
    layout: workbookLayout,
  }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'frozen-column-layering.xlsx',
      baseName: 'frozen-column-layering-base.xlsx',
      mineName: 'frozen-column-layering-mine.xlsx',
      layout: workbookLayout,
      collapseCtx: false,
      baseContent: baseWorkbookContent,
      mineContent: mineWorkbookContent,
    });
  }, { baseContent, mineContent, layout });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);
}

for (const layout of ['split-h', 'split-v', 'unified'] as const) {
  test(`selecting a column hidden behind frozen columns reveals it in ${layout}`, async ({ page }) => {
    await loadWideWorkbookDiff(page, layout, false);

    const scrollContainers = layout === 'split-h'
      ? page.locator('.overflow-auto.relative')
      : page.locator('.overflow-y-auto.overflow-x-auto.relative.min-w-0.min-h-0');
    await expect(scrollContainers).toHaveCount(layout === 'split-h' ? 2 : 1);
    await expect.poll(() => scrollContainers.evaluateAll((elements) => (
      elements.map(element => getComputedStyle(element).overflowX)
    ))).toEqual(Array.from({ length: layout === 'split-h' ? 2 : 1 }, () => 'scroll'));
    await expect.poll(() => scrollContainers.first().evaluate((element) => (
      element.scrollWidth - element.clientWidth
    ))).toBeGreaterThan(96);
    const scrollableWidthsBeforeFocus = await scrollContainers.evaluateAll((elements) => (
      elements.map(element => element.scrollWidth - element.clientWidth)
    ));
    await page.waitForTimeout(600);

    await scrollContainers.evaluateAll((elements) => {
      elements.forEach((element) => {
        element.scrollLeft = 96;
      });
    });

    const frozenBoundaryX = LN_W + 3 + (WORKBOOK_CELL_WIDTH * (layout === 'split-v' ? 2 : 1));
    const bodyCanvas = layout === 'split-h'
      ? page.locator('[data-testid="workbook-pane-canvas-base"]:not([data-workbook-header-row-canvas="true"])')
      : page.locator('[data-workbook-cell-canvas="true"]:not([data-workbook-header-row-canvas="true"])');
    await expect(bodyCanvas).toHaveCount(1);
    await bodyCanvas.click({ position: { x: frozenBoundaryX + 24, y: 12 } });

    await expect.poll(() => scrollContainers.evaluateAll((elements) => (
      elements.map(element => Math.round(element.scrollLeft))
    ))).toEqual(Array.from({ length: layout === 'split-h' ? 2 : 1 }, () => 0));
    expect(await scrollContainers.evaluateAll((elements) => (
      elements.map(element => element.scrollWidth - element.clientWidth)
    ))).toEqual(scrollableWidthsBeforeFocus);

    await scrollContainers.evaluateAll((elements) => {
      elements.forEach((element) => {
        element.scrollLeft = 96;
      });
    });
    await bodyCanvas.click({ position: { x: frozenBoundaryX + 24, y: 12 } });
    await expect.poll(() => scrollContainers.evaluateAll((elements) => (
      elements.map(element => Math.round(element.scrollLeft))
    ))).toEqual(Array.from({ length: layout === 'split-h' ? 2 : 1 }, () => 0));
    expect(await scrollContainers.evaluateAll((elements) => (
      elements.map(element => element.scrollWidth - element.clientWidth)
    ))).toEqual(scrollableWidthsBeforeFocus);
  });
}

test('stacked selection outside the active diff still reveals a covered column', async ({ page }) => {
  await loadWideWorkbookDiff(page, 'unified', true);

  const scrollContainer = page.locator('.overflow-y-auto.overflow-x-auto.relative.min-w-0.min-h-0');
  await expect(scrollContainer).toHaveCount(1);
  await expect.poll(() => scrollContainer.evaluate((element) => (
    element.scrollWidth - element.clientWidth
  ))).toBeGreaterThan(96);
  const scrollableWidthBeforeFocus = await scrollContainer.evaluate((element) => (
    element.scrollWidth - element.clientWidth
  ));
  await page.waitForTimeout(700);
  await scrollContainer.evaluate((element) => {
    element.scrollLeft = 96;
  });

  const bodyCanvas = page.locator('[data-workbook-cell-canvas="true"]:not([data-workbook-header-row-canvas="true"])');
  await expect(bodyCanvas).toHaveCount(1);
  const frozenBoundaryX = LN_W + 3 + WORKBOOK_CELL_WIDTH;
  await bodyCanvas.click({ position: { x: frozenBoundaryX + 24, y: 12 } });

  await expect.poll(() => scrollContainer.evaluate((element) => (
    Math.round(element.scrollLeft)
  ))).toBe(0);
  expect(await scrollContainer.evaluate((element) => (
    element.scrollWidth - element.clientWidth
  ))).toBe(scrollableWidthBeforeFocus);
});

test('stacked explicit cell focus restores vertical positioning after a manual scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  const content = buildTallWorkbook();
  await page.evaluate(async ({ workbookContent }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'vertical-focus.xlsx',
      baseName: 'vertical-focus-base.xlsx',
      mineName: 'vertical-focus-mine.xlsx',
      layout: 'unified',
      collapseCtx: false,
      baseContent: workbookContent,
      mineContent: workbookContent,
    });
  }, { workbookContent: content });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const scrollContainer = page.locator('.overflow-y-auto.overflow-x-auto.relative.min-w-0.min-h-0');
  await expect(scrollContainer).toHaveCount(1);
  await expect.poll(() => scrollContainer.evaluate((element) => (
    element.scrollHeight - element.clientHeight
  ))).toBeGreaterThan(600);
  await page.waitForTimeout(600);
  await scrollContainer.evaluate((element) => {
    element.scrollTop = 360;
  });

  const bounds = await scrollContainer.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(
    bounds!.x + LN_W + 3 + WORKBOOK_CELL_WIDTH + 24,
    bounds!.y + bounds!.height - 48,
  );

  await expect.poll(() => scrollContainer.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(420);
});

test('scrolling columns keeps floating header borders out of the frozen column', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  const paneScrollers = page.locator('.overflow-auto.relative');
  await expect(paneScrollers).toHaveCount(2);
  const headerCanvases = page.locator('[data-workbook-column-header-canvas="true"]');
  await expect(headerCanvases).toHaveCount(2);
  await expect.poll(() => paneScrollers.first().evaluate((element) => (
    element.scrollWidth - element.clientWidth
  ))).toBeGreaterThan(64);

  await expect.poll(() => paneScrollers.evaluateAll((elements) => {
    elements.forEach((element) => {
      element.scrollLeft = 64;
    });
    return elements.map((element) => element.scrollLeft);
  })).toEqual([64, 64]);

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

test('collapsed column marker stays outside the frozen column hit area', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  const columns = Array.from({ length: 20 }, (_, index) => `Column ${index + 1}`);
  const baseContent = [
    createWorkbookSheetLine('CollapsedBoundary'),
    createWorkbookRowLine(1, columns),
    createWorkbookRowLine(2, columns.map(() => '0')),
  ].join('\n');
  const mineContent = [
    createWorkbookSheetLine('CollapsedBoundary'),
    createWorkbookRowLine(1, columns),
    createWorkbookRowLine(2, columns.map((_, index) => (index === 10 ? '1' : '0'))),
  ].join('\n');
  await page.evaluate(async ({ baseContent: baseWorkbook, mineContent: mineWorkbook }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'collapsed-boundary.xlsx',
      baseName: 'collapsed-boundary-base.xlsx',
      mineName: 'collapsed-boundary-mine.xlsx',
      layout: 'split-v',
      collapseCtx: true,
      baseContent: baseWorkbook,
      mineContent: mineWorkbook,
    });
  }, { baseContent, mineContent });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const headerCanvas = page.locator('[data-workbook-column-header-canvas="true"]');
  await expect(headerCanvas).toHaveCount(1);
  const frozenBoundaryX = LN_W + 3 + (WORKBOOK_CELL_WIDTH * 2);
  const tooltip = page.getByRole('tooltip');

  await headerCanvas.hover({ position: { x: frozenBoundaryX - 8, y: 12 } });
  await expect(tooltip).toBeHidden();
  const headerWidth = await headerCanvas.evaluate((element) => element.clientWidth);
  let markerFoundInScrollLayer = false;
  for (let x = frozenBoundaryX + 4; x < Math.min(headerWidth, frozenBoundaryX + 520); x += 8) {
    await headerCanvas.hover({ position: { x, y: 12 } });
    await page.waitForTimeout(12);
    if (await tooltip.isVisible().catch(() => false)) {
      markerFoundInScrollLayer = true;
      break;
    }
  }
  expect(markerFoundInScrollLayer).toBe(true);
  await expect(tooltip).toContainText('collapsed');
});
