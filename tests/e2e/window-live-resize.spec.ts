import { expect, test } from '@playwright/test';

test('home surface follows rapid viewport resizing before the ambient canvas rebuilds', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'zh-CN');
    window.localStorage.setItem('versora.settings', JSON.stringify({ themeKey: 'light' }));
    window.versora = {
      notifyRendererReady: () => {},
      getLaunchContext: async () => ({
        hasDiffRequest: false,
        isDevMode: true,
        usesNativeWindowControls: false,
        windowFrameState: { isMaximized: false },
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
      }),
    } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await expect(page.locator('.home-stage')).toBeVisible();

  const viewportSizes = [
    { width: 1320, height: 780 },
    { width: 1480, height: 860 },
    { width: 1640, height: 940 },
  ];

  for (const size of viewportSizes) {
    await page.setViewportSize(size);
    const coverage = await page.evaluate(() => {
      const fullViewportSelectors = [
        '#root',
        '.app-window-frame',
        '.app-window-surface',
        '.home-ambient-canvas',
      ];
      const fullViewportRects = fullViewportSelectors.map((selector) => {
        const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        return {
          selector,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        };
      });
      const homeStageRect = document.querySelector<HTMLElement>('.home-stage')?.getBoundingClientRect();
      return {
        fullViewportRects,
        homeStage: {
          width: homeStageRect?.width ?? 0,
          bottom: homeStageRect?.bottom ?? 0,
        },
      };
    });

    for (const rect of coverage.fullViewportRects) {
      expect(rect.width, `${rect.selector} width`).toBe(size.width);
      expect(rect.height, `${rect.selector} height`).toBe(size.height);
    }
    expect(coverage.homeStage.width, '.home-stage width').toBe(size.width);
    expect(coverage.homeStage.bottom, '.home-stage bottom').toBe(size.height);
  }

  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.home-ambient-canvas');
    if (!canvas) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    return canvas.width === Math.floor(window.innerWidth * dpr)
      && canvas.height === Math.floor(window.innerHeight * dpr);
  })).toBe(true);
});
