import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

async function loadSplitDiff(page: Page) {
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'selection-menu-sample.py',
      baseName: 'selection-menu-base.py',
      mineName: 'selection-menu-mine.py',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
      ].join('\n'),
      mineContent: [
        'line 1 changed',
        'line 2',
        'line 3',
        'line 4',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
  await page.waitForSelector('[data-line-idx="2"] button');
}

test('split view line selection context menu folds the selected range', async ({ page }) => {
  await loadSplitDiff(page);

  const leftLineNumber = page.locator('[data-line-idx="2"] button').first();
  await leftLineNumber.click();

  await page.locator('[data-line-idx="2"]').first().click({ button: 'right' });
  const foldAction = page.getByRole('menuitem', { name: /Fold selected lines|折叠选中行/ });
  await expect(foldAction).toBeVisible();

  await foldAction.click();
  await expect.poll(async () => page.locator('[data-collapse-range="true"]').count()).toBeGreaterThan(0);
});
