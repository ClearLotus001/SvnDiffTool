import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../../src/utils/workbook/workbookDisplay';

function buildWorkbook(rows: string[][]) {
  return [
    createWorkbookSheetLine('WideSheet'),
    ...rows.map((cells, index) => createWorkbookRowLine(index + 1, cells)),
  ].join('\n');
}

async function loadWideWorkbookDiff(page: Page) {
  const header = Array.from({ length: 20 }, (_, index) => `Column ${index + 1}`);
  const stable = Array.from({ length: 20 }, (_, index) => `Stable ${index + 1}`);
  const baseTarget = Array.from({ length: 20 }, (_, index) => `Value ${index + 1}`);
  const mineTarget = [...baseTarget];
  mineTarget[18] = 'Changed off-screen value';

  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ baseContent, mineContent }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'wide-navigation.xlsx',
      baseName: 'wide-navigation-base.xlsx',
      mineName: 'wide-navigation-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent,
      mineContent,
    });
  }, {
    baseContent: buildWorkbook([header, stable, baseTarget]),
    mineContent: buildWorkbook([header, stable, mineTarget]),
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);
}

test('clicking a single workbook hunk again scrolls both panes to its off-screen column', async ({ page }) => {
  await loadWideWorkbookDiff(page);

  const paneScrollers = page.locator('.overflow-auto.relative');
  await expect(paneScrollers).toHaveCount(2);
  await expect(page.getByText('1/1', { exact: true })).toBeVisible();

  await paneScrollers.evaluateAll((elements) => {
    elements.forEach((element) => {
      element.scrollLeft = 0;
      element.dispatchEvent(new Event('scroll'));
    });
  });
  await expect.poll(() => paneScrollers.first().evaluate((element) => element.scrollLeft)).toBe(0);

  await page.getByRole('button', { name: /^(?:下一个差异块|Next hunk) \(F7\)$/ }).click();

  await expect.poll(() => paneScrollers.first().evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const scrollLefts = await paneScrollers.evaluateAll((elements) => (
    elements.map((element) => element.scrollLeft)
  ));
  expect(Math.abs((scrollLefts[0] ?? 0) - (scrollLefts[1] ?? 0))).toBeLessThanOrEqual(1);
});
