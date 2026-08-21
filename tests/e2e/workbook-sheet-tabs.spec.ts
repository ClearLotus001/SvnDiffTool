import { expect, test } from '@playwright/test';

test('workbook sheet menu escapes the tab rail and bottom tags use the compact status spec', async ({ page }) => {
  await page.addInitScript('window.versora = { getLaunchContext: () => new Promise(() => {}) }');
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  await page.evaluate(async () => {
    const sheetNames = Array.from({ length: 14 }, (_, index) => `Sheet${index + 1}`);
    const buildWorkbook = (side: 'base' | 'mine') => sheetNames.map((name, index) => (
      `@@sheet\t${name}\n@@row\t1\tID\tName\n@@row\t2\t${index + 1}\t${side}-${index + 1}`
    )).join('\n');
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'sheet-tabs.xlsx',
      baseName: 'base-sheet-tabs.xlsx',
      mineName: 'mine-sheet-tabs.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: buildWorkbook('base'),
      mineContent: buildWorkbook('mine'),
      revisionOptions: [],
      baseRevisionInfo: null,
      mineRevisionInfo: null,
      canSwitchRevisions: false,
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const tabBar = page.getByTestId('workbook-sheet-tabs');
  const sheetTabs = page.getByTestId('workbook-sheet-tab');
  await expect(tabBar).toBeVisible();
  await expect(sheetTabs).toHaveCount(14);
  await expect.poll(async () => ({
    barHeight: await tabBar.evaluate((element) => element.getBoundingClientRect().height),
    overflow: await tabBar.evaluate((element) => getComputedStyle(element).overflow),
    tabStyles: await sheetTabs.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.height, style.borderTopWidth, style.borderTopLeftRadius];
    })),
  })).toEqual({
    barHeight: 33,
    overflow: 'visible',
    tabStyles: Array.from({ length: 14 }, () => ['28px', '1px', '7px']),
  });

  const menuTrigger = page.getByTestId('workbook-sheet-menu-trigger');
  await menuTrigger.click();
  const sheetMenu = page.getByTestId('workbook-sheet-menu');
  await expect(sheetMenu).toBeVisible();
  await expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => {
    const [barBox, menuBox] = await Promise.all([tabBar.boundingBox(), sheetMenu.boundingBox()]);
    if (!barBox || !menuBox) return false;
    const topElementBelongsToMenu = await page.evaluate(({ x, y }) => {
      const topElement = document.elementFromPoint(x, y);
      return Boolean(topElement?.closest('[data-testid="workbook-sheet-menu"]'));
    }, { x: menuBox.x + 18, y: menuBox.y + 18 });
    return menuBox.y + menuBox.height <= barBox.y + 1 && topElementBelongsToMenu;
  }).toBe(true);

  const statsChips = page.locator('.app-stats-chip');
  await expect.poll(async () => statsChips.count()).toBeGreaterThan(4);
  await expect.poll(async () => statsChips.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return [style.height, style.borderRadius, style.paddingLeft, style.paddingRight];
  }))).toEqual(Array.from({ length: await statsChips.count() }, () => ['20px', '5px', '6px', '6px']));
});
