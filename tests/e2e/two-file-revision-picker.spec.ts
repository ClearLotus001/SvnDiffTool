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
      base: [
        base,
        { ...base, id: 'r101', revision: 'r101', title: 'r101', message: 'base older' },
        ...Array.from({ length: 28 }, (_, index) => ({
          ...base,
          id: `base-history-${index}`,
          revision: `r${100 - index}`,
          title: `r${100 - index}`,
          message: `base history ${index}`,
        })),
      ],
      mine: [
        mine,
        { ...mine, id: 'r204', revision: 'r204', title: 'r204', message: 'mine older' },
        ...Array.from({ length: 28 }, (_, index) => ({
          ...mine,
          id: `mine-history-${index}`,
          revision: `r${203 - index}`,
          title: `r${203 - index}`,
          message: `mine history ${index}`,
        })),
      ],
    };
    window.versora = {
      getLaunchContext: () => new Promise(() => {}),
      queryRevisionOptions: async (query) => ({
        items: histories[query?.targetSide === 'mine' ? 'mine' : 'base'],
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: null,
      }),
    } as NonNullable<typeof window.versora>;
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
  await expect.poll(async () => baseSourceBadge.evaluate((element) => (
    element.parentElement?.nextElementSibling?.getAttribute('data-testid') ?? ''
  ))).toBe('version-role-base');
  await expect.poll(async () => mineSourceBadge.evaluate((element) => (
    element.parentElement?.nextElementSibling?.getAttribute('data-testid') ?? ''
  ))).toBe('version-role-mine');
  await expect.poll(async () => page.evaluate((testIds) => testIds.map((testId) => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    if (!element) return null;
    const style = window.getComputedStyle(element);
    return [style.height, style.borderRadius, style.paddingLeft, style.paddingRight, style.fontSize];
  }), [
    'source-badge-base',
    'version-role-base',
    'reset-compare-tag',
    'axis-tag-left-pane',
  ])).toEqual([
    ['20px', '5px', '6px', '6px', '10px'],
    ['20px', '5px', '6px', '6px', '10px'],
    ['20px', '5px', '6px', '6px', '10px'],
    ['20px', '5px', '6px', '6px', '10px'],
  ]);
  await expect.poll(async () => {
    const [baseColor, mineColor] = await Promise.all([
      baseSourceBadge.evaluate(element => window.getComputedStyle(element).color),
      mineSourceBadge.evaluate(element => window.getComputedStyle(element).color),
    ]);
    return baseColor !== mineColor;
  }).toBe(true);

  const baseTrigger = page.getByTestId('revision-picker-trigger-left');
  const mineTrigger = page.getByTestId('revision-picker-trigger-right');
  await expect(baseTrigger).toContainText('102');
  await expect(mineTrigger).toContainText('205');
  await expect.poll(async () => Promise.all([baseTrigger, mineTrigger].map((trigger) => trigger.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return [style.height, style.borderRadius, style.paddingLeft, style.paddingRight, style.fontSize];
  })))).toEqual([
    ['20px', '5px', '6px', '6px', '10px'],
    ['20px', '5px', '6px', '6px', '10px'],
  ]);

  await baseTrigger.click();
  const basePanel = page.getByTestId('revision-picker-panel');
  const baseSide = page.locator('[data-split-header-side="base"]');
  await expect(basePanel).toBeVisible();
  await expect.poll(async () => {
    const [panelBox, sideBox, triggerBox] = await Promise.all([
      basePanel.boundingBox(), baseSide.boundingBox(), baseTrigger.boundingBox(),
    ]);
    if (!panelBox || !sideBox || !triggerBox) return false;
    return panelBox.x >= sideBox.x + 10
      && panelBox.x + panelBox.width <= sideBox.x + sideBox.width + 1
      && Math.abs((panelBox.x + panelBox.width) - (triggerBox.x + triggerBox.width)) <= 1;
  }).toBe(true);

  const revisionList = page.getByTestId('revision-picker-list');
  await expect.poll(async () => revisionList.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const scrollbarAppearances: Array<{ scrollbarColor: string; thumb: string; track: string; width: string }> = [];
  for (const theme of ['light', 'dark', 'hc'] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-hc');
      document.documentElement.classList.add(`theme-${nextTheme}`);
    }, theme);
    scrollbarAppearances.push(await revisionList.evaluate((element) => ({
      scrollbarColor: window.getComputedStyle(element).scrollbarColor,
      thumb: window.getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
      track: window.getComputedStyle(element, '::-webkit-scrollbar-track').backgroundColor,
      width: window.getComputedStyle(element, '::-webkit-scrollbar').width,
    })));
  }
  for (const appearance of scrollbarAppearances) {
    expect(appearance.scrollbarColor).not.toBe('auto');
    expect(appearance.thumb).not.toBe('rgba(0, 0, 0, 0)');
    expect(appearance.width).toBe('8px');
  }
  expect(new Set(scrollbarAppearances.map((appearance) => appearance.scrollbarColor)).size).toBe(3);
  await expect(page.getByText('base older', { exact: true })).toBeVisible();
  await expect(page.getByText('mine older', { exact: true })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await mineTrigger.click();
  const minePanel = page.getByTestId('revision-picker-panel');
  const mineSide = page.locator('[data-split-header-side="mine"]');
  await expect.poll(async () => {
    const [panelBox, sideBox, triggerBox] = await Promise.all([
      minePanel.boundingBox(), mineSide.boundingBox(), mineTrigger.boundingBox(),
    ]);
    if (!panelBox || !sideBox || !triggerBox) return false;
    return panelBox.x >= sideBox.x + 10
      && panelBox.x + panelBox.width <= sideBox.x + sideBox.width + 1
      && Math.abs((panelBox.x + panelBox.width) - (triggerBox.x + triggerBox.width)) <= 1;
  }).toBe(true);
  await expect(page.getByText('mine older', { exact: true })).toBeVisible();
  await expect(page.getByText('base older', { exact: true })).toHaveCount(0);
});

test('mixed two-file comparison only exposes a picker for the versioned side', async ({ page }) => {
  await page.addInitScript(({ base }) => {
    window.versora = {
      getLaunchContext: () => new Promise(() => {}),
      queryRevisionOptions: async () => ({
        items: [base],
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: null,
      }),
    } as NonNullable<typeof window.versora>;
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
  const staticMineVersion = page.getByTestId('static-version-mine');
  await expect(staticMineVersion).toContainText('plain.txt');
  await expect.poll(async () => staticMineVersion.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.height, style.borderRadius, style.paddingLeft, style.paddingRight, style.fontSize];
  })).toEqual(['20px', '5px', '6px', '6px', '10px']);
});
