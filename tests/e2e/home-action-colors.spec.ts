import { expect, test } from '@playwright/test';

test('home actions keep a distinct blue teal and gold hierarchy in light and dark themes', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('versora.locale', 'zh-CN');
    window.versora = {
      notifyRendererReady: () => {},
      getLaunchContext: async () => ({
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
      }),
    } as NonNullable<typeof window.versora>;
  });

  await page.goto('/?__e2e=1');
  const cards = page.locator('.home-action-card');
  await expect(cards).toHaveCount(3);

  const expected = {
    light: {
      accents: ['#246FAE', '#007A86', '#8D6200'],
      text: 'rgb(250, 250, 250)',
    },
    dark: {
      accents: ['#8AB8E3', '#76C7D2', '#E6C95A'],
      text: 'rgb(9, 9, 11)',
    },
  } as const;

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-hc');
      document.documentElement.classList.add(`theme-${nextTheme}`);
    }, theme);

    const styles = await cards.evaluateAll((elements) => elements.map((element) => {
      const cardStyle = getComputedStyle(element);
      const button = element.querySelector<HTMLElement>('.home-action-card__button');
      const buttonStyle = button ? getComputedStyle(button) : null;
      return {
        accent: cardStyle.getPropertyValue('--home-card-accent').trim().toUpperCase(),
        text: buttonStyle?.color ?? '',
        background: buttonStyle?.backgroundImage ?? '',
      };
    }));

    expect(styles.map((style) => style.accent)).toEqual(expected[theme].accents);
    expect(styles.map((style) => style.text)).toEqual(Array(3).fill(expected[theme].text));
    styles.forEach((style) => expect(style.background).toContain('linear-gradient'));
    expect(new Set(styles.map((style) => style.background)).size).toBe(3);
  }
});
