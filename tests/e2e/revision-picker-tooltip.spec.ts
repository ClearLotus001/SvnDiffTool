import { expect, test } from '@playwright/test';

const baseRevision = {
  id: 'base-r1926065',
  revision: 'r1926065',
  title: 'r1926065',
  author: 'svn-user',
  date: '2026-07-24 10:30',
  message: '周末银行8.3-8.30',
  kind: 'revision' as const,
};

const mineRevision = {
  id: 'mine-working-copy',
  revision: 'WC',
  title: '本地工作副本',
  author: 'svn-user',
  date: '2026-07-24 11:00',
  message: '本地工作副本',
  kind: 'working-copy' as const,
};

test('revision picker uses the app tooltip and hides it before opening the timeline', async ({ page }) => {
  await page.addInitScript('window.versora = { getLaunchContext: () => new Promise(() => {}) }');
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ base, mine }) => {
    await window.__SVN_DIFF_E2E__!.loadWorkbookDiff({
      fileName: 'revision-tooltip.xlsx',
      baseName: '[1926065]revision-tooltip.xlsx',
      mineName: '[WC]revision-tooltip.xlsx',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: '@@sheet\tSheet1\n@@row\t1\tID\tName\n@@row\t2\t10001\tBase',
      mineContent: '@@sheet\tSheet1\n@@row\t1\tID\tName\n@@row\t2\t10001\tMine',
      revisionOptions: [base, mine],
      baseRevisionInfo: base,
      mineRevisionInfo: mine,
      canSwitchRevisions: true,
    });
  }, { base: baseRevision, mine: mineRevision });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().isWorkbookMode === true);

  const trigger = page.locator('button[aria-expanded]').filter({ hasText: '1926065' });
  await expect(trigger).toBeVisible();
  await expect(trigger).not.toHaveAttribute('title');

  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('1926065');
  await expect(tooltip).toContainText('周末银行8.3-8.30');
  await expect(tooltip).toContainText('svn-user');
  await expect(tooltip).toContainText('2026-07-24 10:30');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(tooltip).toBeHidden();
});
