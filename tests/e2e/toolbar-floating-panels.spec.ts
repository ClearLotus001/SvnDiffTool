import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

async function loadToolbarFixture(page: Page) {
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'toolbar-layering.ts',
      baseName: 'toolbar-layering-base.ts',
      mineName: 'toolbar-layering-mine.ts',
      layout: 'unified',
      collapseCtx: false,
      baseContent: ['alpha', 'beta', 'gamma'].join('\n'),
      mineContent: ['alpha', 'beta changed', 'gamma'].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

test('view menu opens as a fixed overlay without shrinking the app surface', async ({ page }) => {
  await loadToolbarFixture(page);

  await page.getByTestId('toolbar-view-menu').click();
  const menu = page.locator('.motion-floating-panel[role="menu"]').first();
  await expect(menu).toBeVisible();

  const metrics = await menu.evaluate((element) => {
    const root = document.getElementById('root');
    return {
      position: getComputedStyle(element).position,
      rootWidth: root?.getBoundingClientRect().width ?? 0,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.position).toBe('fixed');
  expect(Math.abs(metrics.rootWidth - metrics.viewportWidth)).toBeLessThanOrEqual(1);
});

test('theme menu is layered above the split header', async ({ page }) => {
  await loadToolbarFixture(page);

  await page.locator('button[aria-haspopup="menu"]').last().click();
  const menu = page.locator('div[role="menu"]').first();
  await expect(menu).toBeVisible();

  const menuIsTopLayer = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const topElement = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + Math.min(18, rect.height / 2),
    );
    return topElement === element || element.contains(topElement);
  });

  expect(menuIsTopLayer).toBe(true);
});

test('view menu button tooltips render beside the menu instead of covering controls', async ({ page }) => {
  await loadToolbarFixture(page);

  await page.getByTestId('toolbar-view-menu').click();
  const menu = page.locator('.motion-floating-panel[role="menu"]').first();
  await expect(menu).toBeVisible();

  await page.getByRole('menuitemcheckbox').nth(1).hover();
  const tooltip = page.locator('[role="tooltip"]').first();
  await expect(tooltip).toBeVisible();

  const relation = await tooltip.evaluate((tooltipElement) => {
    const menuElement = document.querySelector('.motion-floating-panel[role="menu"]');
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const menuRect = menuElement?.getBoundingClientRect();
    const tooltipStyle = window.getComputedStyle(tooltipElement);
    const menuStyle = menuElement ? window.getComputedStyle(menuElement) : null;
    const surfaceStyle = tooltipElement.firstElementChild
      ? window.getComputedStyle(tooltipElement.firstElementChild)
      : null;
    const standardBackdrop = surfaceStyle?.backdropFilter ?? '';
    const prefixedBackdrop = surfaceStyle?.getPropertyValue('-webkit-backdrop-filter') ?? '';
    return {
      isBesideMenu: menuRect
        ? tooltipRect.right <= menuRect.left || tooltipRect.left >= menuRect.right
        : false,
      tooltipZIndex: Number(tooltipStyle.zIndex),
      menuZIndex: Number(menuStyle?.zIndex ?? 0),
      tooltipBackdrop: standardBackdrop && standardBackdrop !== 'none' ? standardBackdrop : prefixedBackdrop,
    };
  });

  expect(relation.isBesideMenu).toBe(true);
  expect(relation.tooltipZIndex).toBeGreaterThan(relation.menuZIndex);
  expect(relation.tooltipBackdrop).toContain('blur');
});
