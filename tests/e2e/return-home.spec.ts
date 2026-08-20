import { expect, test } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

test('toolbar home action returns from a comparison to the start surface', async ({ page }) => {
  const baseUrl = process.env.VERSORA_E2E_BASE_URL?.trim() || '';
  await page.goto(`${baseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'return-home.ts',
      baseName: 'return-home-base.ts',
      mineName: 'return-home-mine.ts',
      baseContent: 'before',
      mineContent: 'after',
      layout: 'unified',
      collapseCtx: false,
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);

  const homeButton = page.getByTestId('toolbar-home');
  await expect(homeButton).toBeVisible();
  await homeButton.click();

  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === false);
  await expect(page.getByRole('heading', { name: /看清每一次变化|See every change clearly/i })).toBeVisible();
  await expect(page.getByTestId('toolbar-home-brand')).toBeVisible();
  await expect(homeButton).toBeHidden();
});
