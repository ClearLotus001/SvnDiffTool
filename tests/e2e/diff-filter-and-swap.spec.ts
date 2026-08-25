import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'en-US');
    window.localStorage.setItem('versora.settings', JSON.stringify({
      themeKey: 'light',
      showOnlyDifferences: false,
      diffTypeFilter: 'all',
      settingsSchemaVersion: 4,
    }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
});

test('diff type toolbar composes with the differences-only scope', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'filter-types.xlsx',
      layout: 'split-h',
      showOnlyDifferences: false,
      baseContent: [
        '@@sheet\tStable',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tSame',
        '@@sheet\tModified',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tBefore',
        '@@sheet\tDeleted',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tOld',
      ].join('\n'),
      mineContent: [
        '@@sheet\tStable',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tSame',
        '@@sheet\tModified',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tAfter',
        '@@sheet\tAdded',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tNew',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const tabs = page.getByTestId('workbook-sheet-tab');
  await expect(tabs).toHaveCount(4);
  await expect(page.getByTestId('diff-filter-toolbar')).not.toContainText('DIFF TYPE');
  await expect(page.getByTestId('diff-filter-scope')).toHaveCount(0);

  await page.getByTestId('diff-filter-add').click();
  await expect(page.getByTestId('diff-filter-add')).toHaveAttribute('aria-checked', 'true');
  await expect(tabs).toHaveCount(1);
  await expect(tabs).toContainText('Added');

  await page.getByTestId('diff-filter-modify').click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs).toContainText('Modified');

  await page.getByTestId('diff-filter-delete').click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs).toContainText('Deleted');

  await page.getByTestId('diff-filter-all').click();
  await expect(tabs).toHaveCount(4);

  await page.getByTestId('toolbar-diff-only').click();
  await expect(page.getByTestId('toolbar-diff-only')).toHaveAttribute('aria-pressed', 'true');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ hasText: 'Stable' })).toHaveCount(0);
});

test('workbook type filters remove non-matching rows from the rendered canvas', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'mixed-row-types.xlsx',
      layout: 'split-h',
      showOnlyDifferences: false,
      baseContent: [
        '@@sheet\tMixed',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tSame',
        '@@row\t3\t2\tBefore',
        '@@row\t4\t3\tDeleted',
        '@@row\t6\t5\tAnchor',
        '@@row\t9\t9\tEnd',
      ].join('\n'),
      mineContent: [
        '@@sheet\tMixed',
        '@@row\t1\tID\tValue',
        '@@row\t2\t1\tSame',
        '@@row\t3\t2\tAfter',
        '@@row\t6\t5\tAnchor',
        '@@row\t8\t4\tAdded',
        '@@row\t9\t9\tEnd',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const bodyCanvases = page.locator(
    '[data-workbook-cell-canvas="true"]:not([data-workbook-header-row-canvas="true"])',
  );
  const renderedHeight = () => bodyCanvases.evaluateAll((canvases) => (
    canvases.reduce((sum, canvas) => sum + canvas.clientHeight, 0)
  ));
  await expect(bodyCanvases.first()).toBeVisible();
  const fullHeight = await renderedHeight();

  await page.getByTestId('diff-filter-modify').click();
  await expect.poll(renderedHeight).toBeLessThan(fullHeight);
  const modifiedHeight = await renderedHeight();

  await page.getByTestId('diff-filter-add').click();
  await expect.poll(renderedHeight).toBe(modifiedHeight);

  await page.getByTestId('diff-filter-delete').click();
  await expect.poll(renderedHeight).toBe(modifiedHeight);

  await page.getByTestId('diff-filter-all').click();
  await expect.poll(renderedHeight).toBe(fullHeight);
});

test('swap button exchanges the complete left and right comparison sides', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'swap.txt',
      baseName: 'left-version.txt',
      mineName: 'right-version.txt',
      baseContent: 'same\nleft only\nbefore',
      mineContent: 'same\nright only\nafter',
      layout: 'split-h',
      source: {
        kind: 'local',
        label: 'Mixed sources',
        baseKind: 'git',
        targetKind: 'svn',
      },
    });
  });

  const leftHeader = page.locator('[data-split-header-side="base"]');
  const rightHeader = page.locator('[data-split-header-side="mine"]');
  await expect(leftHeader).toContainText('left-version.txt');
  await expect(rightHeader).toContainText('right-version.txt');
  await expect(page.getByTestId('source-badge-base')).toHaveText('GIT');
  await expect(page.getByTestId('source-badge-mine')).toHaveText('SVN');

  const swapButton = page.getByTestId('split-header-swap');
  await swapButton.hover();
  const swapTooltip = page.getByRole('tooltip');
  await expect(swapTooltip).toHaveText('Swap left and right versions');
  await expect.poll(async () => {
    const [buttonBox, tooltipBox] = await Promise.all([
      swapButton.boundingBox(),
      swapTooltip.boundingBox(),
    ]);
    if (!buttonBox || !tooltipBox) return Number.POSITIVE_INFINITY;
    const buttonCenter = buttonBox.x + (buttonBox.width / 2);
    const tooltipCenter = tooltipBox.x + (tooltipBox.width / 2);
    return Math.abs(buttonCenter - tooltipCenter);
  }).toBeLessThanOrEqual(2);

  await swapButton.click();
  await expect(leftHeader).toContainText('right-version.txt');
  await expect(rightHeader).toContainText('left-version.txt');
  await expect(page.getByTestId('source-badge-base')).toHaveText('SVN');
  await expect(page.getByTestId('source-badge-mine')).toHaveText('GIT');

  await swapButton.click();
  await expect(leftHeader).toContainText('left-version.txt');
  await expect(rightHeader).toContainText('right-version.txt');
});
