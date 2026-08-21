import { expect, test } from '@playwright/test';

import { ROW_H } from '../../src/hooks/virtualization/useVirtual';
import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../../src/utils/workbook/workbookDisplay';

test('implicit blank row ranges do not render placeholders or reserve scroll height', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'en-US');
    window.localStorage.setItem('svn-excel-diff-tool.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  const content = [
    createWorkbookSheetLine('SparseRows'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(50, ['50', 'After sparse gap']),
  ].join('\n');
  await page.evaluate(async (workbookContent) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'sparse-gap.xlsx',
      baseName: 'sparse-gap-base.xlsx',
      mineName: 'sparse-gap-mine.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: workbookContent,
      mineContent: workbookContent,
    });
  }, content);
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  await expect(page.locator('[data-workbook-sparse-gap="true"]')).toHaveCount(0);

  const paneScrollers = page.locator('.overflow-auto.relative');
  await expect(paneScrollers).toHaveCount(2);
  await expect.poll(() => paneScrollers.evaluateAll((elements) => elements.map((element) => {
    const content = element.firstElementChild;
    return content instanceof HTMLElement ? Number.parseFloat(content.style.height) : -1;
  }))).toEqual([ROW_H * 3, ROW_H * 3]);
});
