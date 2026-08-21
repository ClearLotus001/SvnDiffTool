import { expect, test } from '@playwright/test';

test('clipped workbook text exposes its full value and workbook chrome follows the active theme', async ({ page }) => {
  const longDescription = '通过每日任务、剧情模式、主线活动获得完整奖励说明，并在指定时间内完成挑战后领取额外成长资源与限时道具奖励';
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'en-US');
    window.localStorage.setItem('svn-excel-diff-tool.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ description }) => {
    const content = `@@sheet\tSheet1\n@@row\t1\tID\tDescription\tExtra\n@@row\t2\t1\t${description}\t`;
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'cell-tooltip.xlsx',
      baseName: 'base-cell-tooltip.xlsx',
      mineName: 'mine-cell-tooltip.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: content,
      mineContent: content,
      revisionOptions: [],
      baseRevisionInfo: null,
      mineRevisionInfo: null,
      canSwitchRevisions: false,
    });
  }, { description: longDescription });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const allCanvases = page.locator('canvas');
  await expect.poll(async () => allCanvases.count()).toBeGreaterThan(0);
  const canvasCandidates = await allCanvases.evaluateAll((canvases) => canvases.map((canvas, index) => {
    const rect = canvas.getBoundingClientRect();
    return {
      index,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      pointerEvents: getComputedStyle(canvas).pointerEvents,
    };
  }).filter((canvas) => canvas.width > 500 && canvas.pointerEvents !== 'none')
    .sort((left, right) => right.y - left.y || left.x - right.x));
  expect(canvasCandidates.length).toBeGreaterThan(0);
  const canvasCandidate = canvasCandidates[0]!;
  const leftCanvas = allCanvases.nth(canvasCandidate.index);
  const cellY = Math.min(12, Math.max(1, canvasCandidate.height / 2));
  await leftCanvas.hover({ position: { x: 260, y: cellY } });
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(longDescription);

  await leftCanvas.click({ position: { x: 260, y: cellY } });
  const valueField = page.getByTestId('formula-value-field');
  const formulaField = page.getByTestId('formula-expression-field');
  await expect(valueField).toContainText(longDescription);
  await expect.poll(async () => {
    const [valueBox, formulaBox] = await Promise.all([valueField.boundingBox(), formulaField.boundingBox()]);
    if (!valueBox || !formulaBox) return false;
    return valueBox.width > 180 && valueBox.width <= 480 && formulaBox.width <= 420;
  }).toBe(true);

  const sampleCellLuma = () => leftCanvas.evaluate((canvas) => {
    const workbookCanvas = canvas as HTMLCanvasElement;
    const context = workbookCanvas.getContext('2d');
    if (!context) return -1;
    const scaleX = workbookCanvas.width / workbookCanvas.clientWidth;
    const scaleY = workbookCanvas.height / workbookCanvas.clientHeight;
    const pixel = context.getImageData(Math.floor(300 * scaleX), Math.floor(5 * scaleY), 1, 1).data;
    return (pixel[0]! + pixel[1]! + pixel[2]!) / 3;
  });
  await expect.poll(sampleCellLuma).toBeGreaterThan(220);

  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect.poll(sampleCellLuma).toBeLessThan(70);
});
