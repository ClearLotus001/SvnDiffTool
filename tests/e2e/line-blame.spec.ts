import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';
import type { LayoutMode } from '../../src/types';

async function loadBlameDiff(page: Page, layout: LayoutMode) {
  const baseUrl = process.env.VERSORA_E2E_BASE_URL?.trim() || '';
  await page.goto(`${baseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async (targetLayout) => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'blame-sample.ts',
      baseName: 'blame-base.ts',
      mineName: 'blame-mine.ts',
      layout: targetLayout,
      collapseCtx: false,
      baseContent: 'const answer = 41;\nconst local = false;',
      mineContent: 'const answer = 42;\nconst local = true;',
      baseBlame: [
        { lineNo: 1, revision: 'a1b2c3d4e5', author: 'alice', date: '2026-08-20 11:04', uncommitted: false },
        { lineNo: 2, revision: 'r11', author: 'bob', date: '2026-08-19 10:00', uncommitted: false },
      ],
      mineBlame: [
        { lineNo: 1, revision: 'r13', author: 'carol', date: '2026-08-20 12:30', uncommitted: false },
        { lineNo: 2, revision: '', author: '', date: '', uncommitted: true },
      ],
    });
  }, layout);
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

for (const layout of ['unified', 'split-h', 'split-v'] as const) {
  test(`${layout} line gutters expose version attribution and hover details`, async ({ page }) => {
    await loadBlameDiff(page, layout);

    const committedLine = page.locator('button[aria-label*="alice"]');
    await expect(committedLine).toHaveCount(1);
    await expect(committedLine.getByText('a1b2c3d', { exact: true })).toBeVisible();

    await committedLine.hover();
    const committedTooltip = page.getByRole('tooltip');
    await expect(committedTooltip).toContainText('a1b2c3d4e5');
    await expect(committedTooltip).toContainText('alice');
    await expect(committedTooltip).toContainText('2026-08-20 11:04');

    const mineLine = page.locator('button[aria-label*="carol"]');
    await expect(mineLine).toHaveCount(1);
    const baseBadge = committedLine.locator('[data-line-blame-badge="true"]');
    const mineBadge = mineLine.locator('[data-line-blame-badge="true"]');
    const [baseBadgeStyle, mineBadgeStyle] = await Promise.all([
      baseBadge.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shape: [style.height, style.padding, style.borderRadius, style.borderStyle].join('|'),
          color: style.color,
          background: style.backgroundColor,
        };
      }),
      mineBadge.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shape: [style.height, style.padding, style.borderRadius, style.borderStyle].join('|'),
          color: style.color,
          background: style.backgroundColor,
        };
      }),
    ]);
    expect(mineBadgeStyle.shape).toBe(baseBadgeStyle.shape);
    expect(mineBadgeStyle.color).not.toBe(baseBadgeStyle.color);
    expect(mineBadgeStyle.background).not.toBe(baseBadgeStyle.background);

    const uncommittedLine = page.locator('button').filter({ hasText: 'WC*' });
    await expect(uncommittedLine).toHaveCount(1);
    await uncommittedLine.hover();
    await expect(page.getByRole('tooltip')).toContainText(/Uncommitted|未提交/);
  });
}
