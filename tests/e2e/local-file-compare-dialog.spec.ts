import { expect, test } from '@playwright/test';

test('two-file dialog explains automatic SVN revision and local fallback behavior', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'zh-CN');
    window.svnDiff = {
      getPathForDroppedFile: (file) => `E:\\Dropped\\${file.name}`,
      getLaunchState: async () => ({
        isDevMode: true,
        usesNativeWindowControls: false,
        windowFrameState: { isMaximized: true },
        launchedAfterUpdate: false,
        updateState: {
          status: 'disabled',
          platform: 'win32',
          supportsAutoUpdate: false,
          currentVersion: 'test',
          availableVersion: null,
          downloadPercent: 0,
          releaseName: null,
          releaseNotes: null,
          publishedAt: null,
          lastCheckedAt: null,
          errorMessage: null,
        },
        diffData: {
          svnUrl: '',
          fileName: '',
          baseName: '',
          mineName: '',
          launchBaseName: '',
          launchMineName: '',
          compareContext: 'literal_two_file_compare',
          baseContent: null,
          mineContent: null,
          baseBytes: null,
          mineBytes: null,
          revisionOptions: null,
          baseRevisionInfo: null,
          mineRevisionInfo: null,
          canSwitchRevisions: false,
          workbookArtifactDiff: null,
          sourceNoticeCode: null,
          perf: null,
        },
      }),
    } as NonNullable<typeof window.svnDiff>;
  });
  const testBaseUrl = process.env.SVN_DIFF_E2E_BASE_URL ?? '';
  await page.goto(`${testBaseUrl}/?__e2e=1`);
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  const openDialog = page.getByRole('button', { name: '选择两份文件', exact: true });
  await expect(openDialog).toBeVisible();
  await openDialog.click();

  await expect(page.getByRole('heading', { name: '对比两份文件', exact: true })).toBeVisible();
  await expect(page.getByText('自动选择对比来源', { exact: true })).toBeVisible();
  const svnRule = page.getByText('两份均为 SVN 工作副本：默认对比各自最新修订，可分别切换版本。', { exact: true });
  const localRule = page.getByText('任一文件非工作副本：直接对比两份本地文件。', { exact: true });
  await expect(svnRule).toBeVisible();
  await expect(localRule).toBeVisible();
  await expect.poll(async () => svnRule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(async () => localRule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const baseDropZone = page.getByTestId('local-file-drop-base');
  const mineDropZone = page.getByTestId('local-file-drop-mine');
  await expect(baseDropZone.getByText('可拖放', { exact: true })).toBeVisible();
  await expect(mineDropZone.getByText('可拖放', { exact: true })).toBeVisible();
  await baseDropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['base'], 'publish.xlsx'));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(baseDropZone.getByText('松开以放入此文件', { exact: true })).toBeVisible();
  await baseDropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['base'], 'publish.xlsx'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(baseDropZone.getByText('publish.xlsx', { exact: true })).toBeVisible();
  await expect(baseDropZone.getByText('拖入可替换', { exact: true })).toBeVisible();

  await mineDropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['first'], 'first.xlsx'));
    transfer.items.add(new File(['second'], 'second.xlsx'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole('alert')).toContainText('每侧一次只能拖入一个文件。');

  await mineDropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['mine'], 'trunk.xlsx'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(mineDropZone.getByText('trunk.xlsx', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始对比', exact: true })).toBeEnabled();
});
