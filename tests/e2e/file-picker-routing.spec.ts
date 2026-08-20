import { expect, test } from '@playwright/test';

test('toolbar switch file keeps single working-copy and two-file sessions separate', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'zh-CN');
    (window as Window & { __pickDiffFileCalls?: number }).__pickDiffFileCalls = 0;
    window.svnDiff = {
      getLaunchState: () => new Promise(() => {}),
      pickDiffFile: async () => {
        const state = window as Window & { __pickDiffFileCalls?: number };
        state.__pickDiffFileCalls = (state.__pickDiffFileCalls ?? 0) + 1;
        return null;
      },
    } as NonNullable<typeof window.svnDiff>;
  });
  const testBaseUrl = process.env.SVN_DIFF_E2E_BASE_URL ?? '';
  await page.goto(`${testBaseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'working-copy.txt',
      baseName: 'working-copy.txt',
      mineName: 'working-copy.txt',
      baseContent: 'base',
      mineContent: 'mine',
      basePath: 'E:\\WorkingCopy\\working-copy.txt',
      minePath: 'E:\\WorkingCopy\\working-copy.txt',
    });
  });
  await page.getByTestId('toolbar-pick-file').click();
  await expect.poll(() => page.evaluate(
    () => (window as Window & { __pickDiffFileCalls?: number }).__pickDiffFileCalls,
  )).toBe(1);
  await expect(page.getByRole('heading', { name: '对比两份文件', exact: true })).toHaveCount(0);

  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'two-files.txt',
      baseName: 'publish.txt',
      mineName: 'trunk.txt',
      baseContent: 'publish',
      mineContent: 'trunk',
      basePath: 'E:\\Publish\\two-files.txt',
      minePath: 'E:\\Trunk\\two-files.txt',
    });
  });
  await page.getByTestId('toolbar-pick-file').click();
  await expect(page.getByRole('heading', { name: '对比两份文件', exact: true })).toBeVisible();
});
