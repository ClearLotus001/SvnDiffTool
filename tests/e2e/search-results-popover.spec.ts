import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../../src/utils/workbook/workbookDisplay';

function buildSearchWorkbook(rowCount: number) {
  return [
    createWorkbookSheetLine('SearchSheet'),
    ...Array.from({ length: rowCount }, (_, index) => (
      createWorkbookRowLine(index + 1, [
        String(index + 1),
        `Needle result ${index + 1} with enough content to require a workbook hover tooltip`,
      ])
    )),
  ].join('\n');
}

async function loadSearchWorkbook(page: Page) {
  const content = buildSearchWorkbook(70);
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async (workbookContent) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'search-results.xlsx',
      baseName: 'search-base.xlsx',
      mineName: 'search-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: workbookContent,
      mineContent: workbookContent,
    });
  }, content);
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);
}

test('last active search result has no compositor mask or clipped viewport overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await loadSearchWorkbook(page);

  const allCanvases = page.locator('canvas');
  await expect.poll(async () => allCanvases.count()).toBeGreaterThan(0);
  const canvasCandidates = await allCanvases.evaluateAll((canvases) => canvases.map((canvas, index) => {
    const rect = canvas.getBoundingClientRect();
    return {
      index,
      width: rect.width,
      height: rect.height,
      y: rect.y,
      pointerEvents: getComputedStyle(canvas).pointerEvents,
    };
  }).filter((canvas) => canvas.width > 500 && canvas.pointerEvents !== 'none')
    .sort((left, right) => right.y - left.y));
  expect(canvasCandidates.length).toBeGreaterThan(0);
  const workbookCanvas = allCanvases.nth(canvasCandidates[0]!.index);
  await workbookCanvas.hover({ position: { x: 260, y: 12 } });
  await expect(page.getByRole('tooltip')).toBeVisible();

  await page.keyboard.press('Control+f');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const input = page.locator('.searchbar-input');
  await expect(input).toBeVisible();
  await input.fill('Need');

  const scroll = page.getByTestId('search-results-scroll');
  await expect(scroll).toBeVisible();
  await expect.poll(() => page.locator('[data-search-result-index]').count()).toBeGreaterThan(0);
  const panel = page.locator('.motion-floating-panel');
  const initialPanelBox = await panel.boundingBox();
  expect(initialPanelBox).not.toBeNull();
  await panel.evaluate((element) => {
    element.setAttribute('data-stability-token', 'stable');
  });

  await input.fill('Needle');
  await expect(panel).toHaveAttribute('data-stability-token', 'stable');
  await expect.poll(() => page.locator('[data-search-result-index]').count()).toBeGreaterThan(0);
  const nextPanelBox = await panel.boundingBox();
  expect(nextPanelBox).not.toBeNull();
  expect(Math.abs(nextPanelBox!.x - initialPanelBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(nextPanelBox!.y - initialPanelBox!.y)).toBeLessThanOrEqual(1);

  await input.press('ArrowUp');

  const activeResult = page.locator('[data-search-result-active="true"]');
  const preview = activeResult.locator('[data-search-result-preview="true"]');
  await expect(activeResult).toBeVisible();
  await expect(preview).toBeVisible();
  const activeHighlight = activeResult.locator('[data-search-highlight-active="true"]').first();
  await expect(activeHighlight).toBeVisible();
  const highlightStyle = await activeHighlight.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      boxDecorationBreak: style.boxDecorationBreak,
      hasRoundedUtilityClass: element.className.includes('rounded'),
      fontWeight: Number(style.fontWeight),
    };
  });
  expect(highlightStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(highlightStyle.backgroundImage).toBe('none');
  expect(highlightStyle.boxShadow).not.toBe('none');
  expect(highlightStyle.boxDecorationBreak).toBe('clone');
  expect(highlightStyle.hasRoundedUtilityClass).toBe(false);
  expect(highlightStyle.fontWeight).toBeGreaterThanOrEqual(600);

  const visuals = await activeResult.evaluate((element) => {
    const previewElement = element.querySelector<HTMLElement>('[data-search-result-preview="true"]');
    const virtualWindow = element.closest('[data-testid="search-results-window"]');
    const scrollElement = element.closest('[data-testid="search-results-scroll"]');
    const elementRect = element.getBoundingClientRect();
    const scrollRect = scrollElement?.getBoundingClientRect();
    const elementStyle = getComputedStyle(element);
    const previewStyle = previewElement ? getComputedStyle(previewElement) : null;
    const virtualWindowStyle = virtualWindow ? getComputedStyle(virtualWindow) : null;
    return {
      contentVisibility: elementStyle.contentVisibility,
      maskImage: previewStyle?.maskImage ?? '',
      webkitMaskImage: previewStyle?.webkitMaskImage ?? '',
      opacity: previewStyle?.opacity ?? '',
      filter: previewStyle?.filter ?? '',
      virtualWindowTransform: virtualWindowStyle?.transform ?? '',
      withinViewport: Boolean(
        scrollRect
        && elementRect.top >= scrollRect.top - 1
        && elementRect.bottom <= scrollRect.bottom + 1
      ),
    };
  });

  expect(visuals).toEqual({
    contentVisibility: 'visible',
    maskImage: 'none',
    webkitMaskImage: 'none',
    opacity: '1',
    filter: 'none',
    virtualWindowTransform: 'none',
    withinViewport: true,
  });
});
