import { expect, test } from '@playwright/test';

test('plain app launch reaches home without requesting or revealing diff loading', async ({ page }) => {
  await page.addInitScript(() => {
    type HomeLaunchState = {
      diffDataCalls: number;
      readyCalls: number;
      loadingVisibleAtReady: boolean;
      homeVisibleAtReady: boolean;
      backgroundAtReady: string;
    };
    const state: HomeLaunchState = {
      diffDataCalls: 0,
      readyCalls: 0,
      loadingVisibleAtReady: false,
      homeVisibleAtReady: false,
      backgroundAtReady: '',
    };
    (window as unknown as { __homeLaunchState: HomeLaunchState }).__homeLaunchState = state;
    window.versora = {
      notifyRendererReady: () => {
        state.readyCalls += 1;
        state.loadingVisibleAtReady = Boolean(document.querySelector('[data-testid="diff-loading-state"]'));
        state.homeVisibleAtReady = Boolean(document.querySelector('.home-stage'));
        state.backgroundAtReady = getComputedStyle(document.body).backgroundColor;
      },
      getLaunchContext: async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          hasDiffRequest: false,
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
        };
      },
      getDiffData: async () => {
        state.diffDataCalls += 1;
        throw new Error('Plain launch must not request diff data.');
      },
    } as unknown as NonNullable<typeof window.versora>;
  });

  await page.goto('/');
  await expect(page.locator('.home-stage')).toBeVisible();
  await expect(page.getByTestId('diff-loading-state')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __homeLaunchState: { readyCalls: number } }).__homeLaunchState.readyCalls
  ))).toBe(1);

  const state = await page.evaluate(() => (
    (window as unknown as {
      __homeLaunchState: {
        diffDataCalls: number;
        readyCalls: number;
        loadingVisibleAtReady: boolean;
        homeVisibleAtReady: boolean;
        backgroundAtReady: string;
      };
    }).__homeLaunchState
  ));
  expect(state).toEqual({
    diffDataCalls: 0,
    readyCalls: 1,
    loadingVisibleAtReady: false,
    homeVisibleAtReady: true,
    backgroundAtReady: 'rgb(8, 9, 13)',
  });
});

test('file comparison launch still requests data and reveals diff loading', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      diffDataCalls: 0,
      readyCalls: 0,
      loadingVisibleAtReady: false,
    };
    (window as unknown as { __diffLaunchState: typeof state }).__diffLaunchState = state;
    window.versora = {
      notifyRendererReady: () => {
        state.readyCalls += 1;
        state.loadingVisibleAtReady = Boolean(document.querySelector('[data-testid="diff-loading-state"]'));
      },
      getLaunchContext: async () => ({
        hasDiffRequest: true,
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
      }),
      getDiffData: () => {
        state.diffDataCalls += 1;
        return new Promise<never>(() => {});
      },
    } as unknown as NonNullable<typeof window.versora>;
  });

  await page.goto('/');
  await expect(page.getByTestId('diff-loading-state')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __diffLaunchState: { diffDataCalls: number } }).__diffLaunchState.diffDataCalls
  ))).toBe(1);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __diffLaunchState: { readyCalls: number } }).__diffLaunchState.readyCalls
  ))).toBe(1);
  expect(await page.evaluate(() => (
    (window as unknown as {
      __diffLaunchState: { loadingVisibleAtReady: boolean };
    }).__diffLaunchState.loadingVisibleAtReady
  ))).toBe(true);
});
