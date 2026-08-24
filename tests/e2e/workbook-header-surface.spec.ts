import { expect, test } from '@playwright/test';

import { LN_W } from '../../src/constants/layout';
import { WORKBOOK_CELL_WIDTH } from '../../src/utils/workbook/workbookDisplay';

test('workbook header surfaces stay opaque in left-right layout and square in compare layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    const baseContent = '@@sheet\tSheet1\n@@row\t1\tOpen main label\tRequired rank\n@@row\t2\t0\t15';
    const mineContent = '@@sheet\tSheet1\n@@row\t1\tOpen main label\tRequired rank updated\n@@row\t2\t0\t20';
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'header-surface.xlsx',
      baseName: 'header-surface-base.xlsx',
      mineName: 'header-surface-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent,
      mineContent,
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const horizontalHeaderCanvases = page.locator('[data-workbook-header-row-canvas="true"]');
  await expect(horizontalHeaderCanvases).toHaveCount(2);
  const surfaceAlpha = await horizontalHeaderCanvases.evaluateAll((elements, sampleX) => elements.map((element) => {
    if (!(element instanceof HTMLCanvasElement)) return -1;
    const context = element.getContext('2d');
    if (!context) return -1;
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return context.getImageData(
      Math.floor(sampleX * scaleX),
      Math.floor(12 * scaleY),
      1,
      1,
    ).data[3];
  }), LN_W + 3 + WORKBOOK_CELL_WIDTH + 12);
  expect(surfaceAlpha).toEqual([255, 255]);

  const neutralHeaderSurfaces = await horizontalHeaderCanvases.evaluateAll((elements, sampleXs) => (
    elements.map((element) => {
      if (!(element instanceof HTMLCanvasElement)) return [];
      const context = element.getContext('2d');
      if (!context) return [];
      const scaleX = element.width / element.clientWidth;
      const scaleY = element.height / element.clientHeight;
      return sampleXs.map((sampleX) => Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data));
    })
  ), [20, LN_W + 3 + WORKBOOK_CELL_WIDTH - 12]);
  expect(neutralHeaderSurfaces).toEqual([
    [[233, 239, 243, 255], [236, 241, 244, 255]],
    [[233, 239, 243, 255], [236, 241, 244, 255]],
  ]);

  const changedHeaderSurface = await horizontalHeaderCanvases.evaluateAll((elements, sampleX) => elements.map((element) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return Array.from(context.getImageData(
      Math.floor(sampleX * scaleX),
      Math.floor(12 * scaleY),
      1,
      1,
    ).data);
  }), LN_W + 3 + (WORKBOOK_CELL_WIDTH * 2) - 12);
  expect(changedHeaderSurface).toEqual([
    [246, 240, 221, 255],
    [246, 240, 221, 255],
  ]);

  const baseBodyCanvas = page.locator('[data-testid="workbook-pane-canvas-base"]:not([data-workbook-header-row-canvas="true"])');
  await expect(baseBodyCanvas).toHaveCount(1);
  const terminalBoundarySamples = await baseBodyCanvas.evaluate((element, sampleXs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return sampleXs.map((sampleX) => ({
      middle: Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data),
      bottom: Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor((element.clientHeight - 0.5) * scaleY),
        1,
        1,
      ).data),
    }));
  }, [20, LN_W + 3 + WORKBOOK_CELL_WIDTH - 16]);
  terminalBoundarySamples.forEach((sample) => {
    expect(sample.bottom).not.toEqual(sample.middle);
    expect(sample.bottom[3]).toBe(255);
  });

  await page.getByTestId('toolbar-layout-split-v').click();
  const squareHeaderPane = page.locator('[data-workbook-frozen-rows-pane="header"]');
  await expect(squareHeaderPane).toHaveCount(1);
  await expect.poll(() => squareHeaderPane.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('0px');

  const columnsBodyCanvas = page.locator('[data-workbook-cell-canvas="true"]:not([data-workbook-header-row-canvas="true"])');
  await expect(columnsBodyCanvas).toHaveCount(1);
  const versionSurfaceColors = await columnsBodyCanvas.evaluate((element, samplePairs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return samplePairs.map(({ nearLeft, center }) => ({
      nearLeft: Array.from(context.getImageData(
        Math.floor(nearLeft * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data),
      center: Array.from(context.getImageData(
        Math.floor(center * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data),
    }));
  }, [
    {
      nearLeft: LN_W + 4.5,
      center: LN_W + 3 + (WORKBOOK_CELL_WIDTH / 2),
    },
    {
      nearLeft: LN_W + 4.5 + WORKBOOK_CELL_WIDTH,
      center: LN_W + 3 + WORKBOOK_CELL_WIDTH + (WORKBOOK_CELL_WIDTH / 2),
    },
  ]);
  expect(versionSurfaceColors).toHaveLength(2);
  expect(versionSurfaceColors[0]?.nearLeft).toEqual(versionSurfaceColors[0]?.center);
  expect(versionSurfaceColors[1]?.nearLeft).toEqual(versionSurfaceColors[1]?.center);
  expect(versionSurfaceColors[0]?.center).not.toEqual(versionSurfaceColors[1]?.center);
  expect(versionSurfaceColors[0]?.center[3]).toBe(255);
  expect(versionSurfaceColors[1]?.center[3]).toBe(255);

  const changedBaseCellLeft = LN_W + 3 + (WORKBOOK_CELL_WIDTH * 2);
  const changedMineCellLeft = changedBaseCellLeft + WORKBOOK_CELL_WIDTH;
  const changedCellSurfaces = await columnsBodyCanvas.evaluate((element, samplePairs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return samplePairs.map(({ nearLeft, center }) => ({
      nearLeft: Array.from(context.getImageData(
        Math.floor(nearLeft * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data),
      center: Array.from(context.getImageData(
        Math.floor(center * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data),
    }));
  }, [
    {
      nearLeft: changedBaseCellLeft + 1.5,
      center: changedBaseCellLeft + (WORKBOOK_CELL_WIDTH / 2),
    },
    {
      nearLeft: changedMineCellLeft + 1.5,
      center: changedMineCellLeft + (WORKBOOK_CELL_WIDTH / 2),
    },
  ]);
  expect(changedCellSurfaces[0]?.nearLeft).toEqual(changedCellSurfaces[0]?.center);
  expect(changedCellSurfaces[1]?.nearLeft).toEqual(changedCellSurfaces[1]?.center);

  const baseCellCenterX = changedBaseCellLeft + (WORKBOOK_CELL_WIDTH / 2);
  const mineCellCenterX = baseCellCenterX + WORKBOOK_CELL_WIDTH;
  const sharedSelectionSeamX = changedMineCellLeft;
  const semanticEdgesBeforeSelection = await columnsBodyCanvas.evaluate((element, samples) => {
    if (!(element instanceof HTMLCanvasElement)) return null;
    const context = element.getContext('2d');
    if (!context) return null;
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    const sample = (x: number, y: number) => Array.from(context.getImageData(
      Math.floor(x * scaleX),
      Math.floor(y * scaleY),
      1,
      1,
    ).data);
    return {
      horizontal: samples.horizontal.map(x => sample(x, 0.5)),
      vertical: samples.vertical.map(x => sample(x, 12)),
    };
  }, {
    horizontal: [baseCellCenterX, mineCellCenterX],
    vertical: [changedBaseCellLeft + 0.5, changedMineCellLeft + WORKBOOK_CELL_WIDTH - 0.5],
  });
  expect(semanticEdgesBeforeSelection).not.toBeNull();
  const cellInteriorBeforeSelection = await columnsBodyCanvas.evaluate((element, sampleXs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return sampleXs.map((sampleX) => Array.from(context.getImageData(
      Math.floor(sampleX * scaleX),
      Math.floor(12 * scaleY),
      1,
      1,
    ).data));
  }, [baseCellCenterX, mineCellCenterX]);
  await columnsBodyCanvas.click({ position: { x: baseCellCenterX, y: 12 } });
  await expect.poll(() => columnsBodyCanvas.evaluate((element, sampleXs) => {
    if (!(element instanceof HTMLCanvasElement)) return null;
    const context = element.getContext('2d');
    if (!context) return null;
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return {
      outline: sampleXs.map((sampleX) => Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor(0.5 * scaleY),
        1,
        1,
      ).data)),
      interior: sampleXs.map((sampleX) => Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data)),
      sharedSeam: [sampleXs[2]!, sampleXs[3]!].map((sampleX) => Array.from(context.getImageData(
        Math.floor(sampleX * scaleX),
        Math.floor(12 * scaleY),
        1,
        1,
      ).data)),
    };
  }, [baseCellCenterX, mineCellCenterX, sharedSelectionSeamX - 0.5, sharedSelectionSeamX + 0.5])).toEqual({
    outline: [
      [75, 106, 128, 255],
      [116, 98, 82, 255],
      [75, 106, 128, 255],
      [116, 98, 82, 255],
    ],
    interior: [
      cellInteriorBeforeSelection[0],
      cellInteriorBeforeSelection[1],
      [75, 106, 128, 255],
      cellInteriorBeforeSelection[1],
    ],
    sharedSeam: [
      [75, 106, 128, 255],
      cellInteriorBeforeSelection[1],
    ],
  });

  const columnHeaderCanvas = page.locator('[data-workbook-column-header-canvas="true"]');
  await expect(columnHeaderCanvas).toHaveCount(1);
  await columnHeaderCanvas.click({ position: { x: baseCellCenterX, y: 12 } });
  await expect.poll(() => columnsBodyCanvas.evaluate((element, sampleXs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return sampleXs.map(x => Array.from(context.getImageData(
      Math.floor(x * scaleX),
      Math.floor(12 * scaleY),
      1,
      1,
    ).data));
  }, [changedBaseCellLeft + 0.5, changedMineCellLeft + WORKBOOK_CELL_WIDTH - 0.5]))
    .not.toEqual(semanticEdgesBeforeSelection!.vertical);

  const columnPixels = await columnsBodyCanvas.evaluate((element, samples) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const scaleX = (element as HTMLCanvasElement).width / (element as HTMLCanvasElement).clientWidth;
    const scaleY = (element as HTMLCanvasElement).height / (element as HTMLCanvasElement).clientHeight;
    const sample = (x: number, y: number) => Array.from(context.getImageData(
      Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1,
    ).data);
    return {
      horizontal: samples.horizontal.map(x => sample(x, 0.5)),
      vertical: samples.vertical.map(x => sample(x, 12)),
    };
  }, {
    horizontal: [baseCellCenterX, mineCellCenterX],
    vertical: [changedBaseCellLeft + 0.5, changedMineCellLeft + WORKBOOK_CELL_WIDTH - 0.5],
  });
  expect(columnPixels.horizontal).toEqual(semanticEdgesBeforeSelection!.horizontal);
  expect(columnPixels.vertical).not.toEqual(semanticEdgesBeforeSelection!.vertical);

  await columnsBodyCanvas.click({ position: { x: 20, y: 12 } });
  await expect.poll(() => columnsBodyCanvas.evaluate((element, sampleXs) => {
    if (!(element instanceof HTMLCanvasElement)) return [];
    const context = element.getContext('2d');
    if (!context) return [];
    const scaleX = element.width / element.clientWidth;
    const scaleY = element.height / element.clientHeight;
    return sampleXs.map(x => Array.from(context.getImageData(
      Math.floor(x * scaleX),
      Math.floor(0.5 * scaleY),
      1,
      1,
    ).data));
  }, [baseCellCenterX, mineCellCenterX])).not.toEqual(semanticEdgesBeforeSelection!.horizontal);
  const rowPixels = await columnsBodyCanvas.evaluate((element, samples) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const scaleX = (element as HTMLCanvasElement).width / (element as HTMLCanvasElement).clientWidth;
    const scaleY = (element as HTMLCanvasElement).height / (element as HTMLCanvasElement).clientHeight;
    const sample = (x: number, y: number) => Array.from(context.getImageData(
      Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1,
    ).data);
    return {
      horizontal: samples.horizontal.map(x => sample(x, 0.5)),
      vertical: samples.vertical.map(x => sample(x, 12)),
    };
  }, {
    horizontal: [baseCellCenterX, mineCellCenterX],
    vertical: [changedBaseCellLeft + 0.5, changedMineCellLeft + WORKBOOK_CELL_WIDTH - 0.5],
  });
  expect(rowPixels.horizontal).not.toEqual(semanticEdgesBeforeSelection!.horizontal);
  expect(rowPixels.vertical).toEqual(semanticEdgesBeforeSelection!.vertical);
});

test('high contrast workbook grid uses graphite hierarchy instead of pure white', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'hc' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    const content = '@@sheet\tSheet1\n@@row\t1\tID\tName\tStatus\n@@row\t2\t1001\tAlpha\tActive\n@@row\t3\t1002\tBeta\tPaused';
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'high-contrast-grid.xlsx',
      baseName: 'high-contrast-grid-base.xlsx',
      mineName: 'high-contrast-grid-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: content,
      mineContent: content,
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const workbookGridTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      grid: style.getPropertyValue('--workbook-grid-border').trim(),
      gridStrong: style.getPropertyValue('--workbook-grid-border-strong').trim(),
      header: style.getPropertyValue('--workbook-header-border').trim(),
      globalStrong: style.getPropertyValue('--border-strong').trim(),
    };
  });
  expect(workbookGridTokens).toEqual({
    grid: '#3F4952',
    gridStrong: '#56616B',
    header: '#7A8791',
    globalStrong: '#FFFFFF',
  });

  const bodyCanvas = page.locator(
    '[data-testid="workbook-pane-canvas-base"]:not([data-workbook-header-row-canvas="true"])',
  );
  await expect(bodyCanvas).toHaveCount(1);
  const gridPixels = await bodyCanvas.evaluate((element, sampleXs) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const sample = (x: number) => Array.from(context.getImageData(
      Math.floor(x * scaleX),
      Math.floor(12 * scaleY),
      1,
      1,
    ).data);
    return {
      interior: sample(sampleXs.interior),
      edgeCandidates: sampleXs.edges.map(sample),
    };
  }, {
    interior: LN_W + 3 + (WORKBOOK_CELL_WIDTH * 1.5),
    edges: [
      LN_W + 3 + (WORKBOOK_CELL_WIDTH * 2) - 0.5,
      LN_W + 3 + (WORKBOOK_CELL_WIDTH * 2) + 0.5,
    ],
  });
  const brightestGridEdge = gridPixels.edgeCandidates.reduce((brightest, candidate) => (
    Math.max(...candidate.slice(0, 3)) > Math.max(...brightest.slice(0, 3)) ? candidate : brightest
  ));
  expect(Math.max(...gridPixels.interior.slice(0, 3))).toBeGreaterThanOrEqual(24);
  expect(Math.max(...gridPixels.interior.slice(0, 3))).toBeLessThan(64);
  expect(Math.max(...brightestGridEdge.slice(0, 3))).toBeGreaterThanOrEqual(70);
  expect(Math.max(...brightestGridEdge.slice(0, 3))).toBeLessThan(140);
  expect(brightestGridEdge[3]).toBe(255);
});
