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

test('search results panel supports width height and proportional resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await loadSearchWorkbook(page);
  await page.keyboard.press('Control+f');
  await page.locator('.searchbar-input').fill('Needle');

  const panel = page.getByTestId('search-results-panel');
  const widthHandle = page.getByTestId('search-results-width-handle');
  const heightHandle = page.getByTestId('search-results-height-handle');
  const proportionalHandle = page.getByTestId('search-results-proportional-handle');
  await expect(panel).toBeVisible();
  await expect(widthHandle).toHaveAttribute('role', 'separator');
  await expect(heightHandle).toHaveAttribute('role', 'separator');
  await expect(proportionalHandle).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  const initialBox = await panel.boundingBox();
  const handleBox = await widthHandle.boundingBox();
  if (!initialBox || !handleBox) throw new Error('Search results resize controls are not visible.');

  await page.mouse.move(handleBox.x + (handleBox.width / 2), handleBox.y + (handleBox.height / 2));
  await page.mouse.down();
  await expect(panel).toHaveAttribute('data-resizing', 'width');
  await page.mouse.move(handleBox.x + (handleBox.width / 2) - 180, handleBox.y + (handleBox.height / 2));
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeLessThan(initialBox.width - 150);
  const resizedBox = await panel.boundingBox();
  if (!resizedBox) throw new Error('Search results panel disappeared after resizing.');
  const storedRatio = await page.evaluate(() => Number(
    window.localStorage.getItem('versora.searchResultsPanelWidthRatio'),
  ));
  expect(storedRatio).toBeCloseTo(resizedBox.width / 1600, 2);

  const heightHandleBox = await heightHandle.boundingBox();
  if (!heightHandleBox) throw new Error('Search results height handle is not visible.');
  await page.mouse.move(
    heightHandleBox.x + (heightHandleBox.width / 2),
    heightHandleBox.y + (heightHandleBox.height / 2),
  );
  await page.mouse.down();
  await page.mouse.move(
    heightHandleBox.x + (heightHandleBox.width / 2),
    heightHandleBox.y + (heightHandleBox.height / 2) - 100,
  );
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())?.height ?? 0).toBeLessThan(initialBox.height - 80);
  const heightResizedBox = await panel.boundingBox();
  if (!heightResizedBox) throw new Error('Search results panel disappeared after height resizing.');

  const proportionalHandleBox = await proportionalHandle.boundingBox();
  if (!proportionalHandleBox) throw new Error('Search results proportional handle is not visible.');
  const aspectRatioBefore = heightResizedBox.width / heightResizedBox.height;
  await page.mouse.move(
    proportionalHandleBox.x + (proportionalHandleBox.width / 2),
    proportionalHandleBox.y + (proportionalHandleBox.height / 2),
  );
  await page.mouse.down();
  await page.mouse.move(
    proportionalHandleBox.x + (proportionalHandleBox.width / 2) - 72,
    proportionalHandleBox.y + (proportionalHandleBox.height / 2) - 36,
  );
  await page.mouse.up();
  const proportionalBox = await panel.boundingBox();
  if (!proportionalBox) throw new Error('Search results panel disappeared after proportional resizing.');
  expect(proportionalBox.width).toBeLessThan(heightResizedBox.width - 40);
  expect(proportionalBox.height).toBeLessThan(heightResizedBox.height - 20);
  expect(proportionalBox.width / proportionalBox.height).toBeCloseTo(aspectRatioBefore, 2);

  const storedRatios = await page.evaluate(() => ({
    width: Number(window.localStorage.getItem('versora.searchResultsPanelWidthRatio')),
    height: Number(window.localStorage.getItem('versora.searchResultsPanelHeightRatio')),
  }));
  expect(storedRatios.width).toBeCloseTo(proportionalBox.width / 1600, 2);
  expect(storedRatios.height).toBeCloseTo(proportionalBox.height / 900, 2);

  await page.setViewportSize({ width: 1400, height: 800 });
  await expect.poll(async () => Math.abs(
    ((await panel.boundingBox())?.width ?? 0) - (storedRatios.width * 1400),
  )).toBeLessThanOrEqual(1);
  await expect.poll(async () => Math.abs(
    ((await panel.boundingBox())?.height ?? 0) - (storedRatios.height * 800),
  )).toBeLessThanOrEqual(1);

  await widthHandle.focus();
  const beforeKeyboardResize = (await panel.boundingBox())?.width ?? 0;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeCloseTo(beforeKeyboardResize + 32, 0);

  await heightHandle.focus();
  await expect(heightHandle).toBeFocused();
  const beforeKeyboardHeightResize = (await panel.boundingBox())?.height ?? 0;
  const beforeKeyboardHeightValue = Number(await heightHandle.getAttribute('aria-valuenow'));
  await heightHandle.press('ArrowDown');
  await expect(heightHandle).toHaveAttribute('aria-valuenow', String(beforeKeyboardHeightValue + 28));
  await expect.poll(async () => (await panel.boundingBox())?.height ?? 0).toBeCloseTo(beforeKeyboardHeightResize + 28, 0);
});
