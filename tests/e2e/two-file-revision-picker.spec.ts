import { expect, test } from '@playwright/test';

const baseRevision = {
  id: 'r102',
  revision: 'r102',
  title: 'r102',
  author: 'base-user',
  date: '2026-08-20 10:00',
  message: 'base latest',
  kind: 'revision' as const,
};

const mineRevision = {
  id: 'r205',
  revision: 'r205',
  title: 'r205',
  author: 'mine-user',
  date: '2026-08-20 11:00',
  message: 'mine latest',
  kind: 'revision' as const,
};

test('two-file comparison loads an independent revision timeline for each side', async ({ page }) => {
  await page.addInitScript(({ base, mine }) => {
    const histories = {
      base: [base, { ...base, id: 'r101', revision: 'r101', title: 'r101', message: 'base older' }],
      mine: [mine, { ...mine, id: 'r204', revision: 'r204', title: 'r204', message: 'mine older' }],
    };
    window.svnDiff = {
      getLaunchState: () => new Promise(() => {}),
      queryRevisionOptions: async (query) => ({
        items: histories[query?.targetSide === 'mine' ? 'mine' : 'base'],
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: null,
      }),
    } as NonNullable<typeof window.svnDiff>;
  }, { base: baseRevision, mine: mineRevision });
  const testBaseUrl = process.env.VERSORA_E2E_BASE_URL ?? '';
  await page.goto(`${testBaseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ base, mine }) => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'sample.txt',
      baseName: 'E:\\Project\\Publish\\sample.txt',
      mineName: 'E:\\Project\\Trunk\\sample.txt',
      baseContent: 'base',
      mineContent: 'mine',
      source: {
        kind: 'local',
        label: 'Versioned local files',
        baseKind: 'git',
        targetKind: 'svn',
      },
      revisionOptions: null,
      baseRevisionInfo: base,
      mineRevisionInfo: mine,
      canSwitchRevisions: true,
    });
  }, { base: baseRevision, mine: mineRevision });

  const toolbar = page.locator('.app-toolbar');
  await expect(toolbar).not.toContainText('SvnDiffTool');
  await expect.poll(async () => page.getByTestId('toolbar-view-menu').evaluate(
    (element) => window.getComputedStyle(element).fontSize,
  )).toBe('12px');

  const baseSourceBadge = page.getByTestId('source-badge-base');
  const mineSourceBadge = page.getByTestId('source-badge-mine');
  await expect(baseSourceBadge).toHaveText('GIT');
  await expect(mineSourceBadge).toHaveText('SVN');
  await expect.poll(async () => {
    const [baseColor, mineColor] = await Promise.all([
      baseSourceBadge.evaluate(element => window.getComputedStyle(element).color),
      mineSourceBadge.evaluate(element => window.getComputedStyle(element).color),
    ]);
    return baseColor !== mineColor;
  }).toBe(true);

  const baseTrigger = page.locator('button[aria-expanded]').filter({ hasText: '102' });
  const mineTrigger = page.locator('button[aria-expanded]').filter({ hasText: '205' });
  await expect(baseTrigger).toContainText('102');
  await expect(mineTrigger).toContainText('205');

  await baseTrigger.click();
  await expect(page.getByText('base older', { exact: true })).toBeVisible();
  await expect(page.getByText('mine older', { exact: true })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await mineTrigger.click();
  await expect(page.getByText('mine older', { exact: true })).toBeVisible();
  await expect(page.getByText('base older', { exact: true })).toHaveCount(0);
});

test('mixed two-file comparison only exposes a picker for the versioned side', async ({ page }) => {
  await page.addInitScript(({ base }) => {
    window.svnDiff = {
      getLaunchState: () => new Promise(() => {}),
      queryRevisionOptions: async () => ({
        items: [base],
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: null,
      }),
    } as NonNullable<typeof window.svnDiff>;
  }, { base: baseRevision });
  const testBaseUrl = process.env.VERSORA_E2E_BASE_URL ?? '';
  await page.goto(`${testBaseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async ({ base }) => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'mixed.txt',
      baseName: 'tracked.txt',
      mineName: 'plain.txt',
      baseContent: 'tracked',
      mineContent: 'plain',
      source: {
        kind: 'local',
        label: 'Versioned local files',
        baseKind: 'git',
        targetKind: 'local',
      },
      revisionOptions: null,
      baseRevisionInfo: base,
      mineRevisionInfo: {
        id: '__mine_input__', revision: '', title: 'plain.txt', author: '', date: '', message: '', kind: 'input-file',
      },
      canSwitchRevisions: true,
      revisionSwitchableSides: { base: true, mine: false },
    });
  }, { base: baseRevision });

  await expect(page.locator('button[aria-expanded]').filter({ hasText: '102' })).toBeVisible();
  await expect(page.locator('button[aria-expanded]').filter({ hasText: 'plain.txt' })).toHaveCount(0);
  await expect(page.getByTestId('source-badge-base')).toHaveText('GIT');
  await expect(page.getByTestId('source-badge-mine')).toHaveCount(0);
});
