import { expect, test } from '@playwright/test';

test('floating window corners keep the frame, surface, and page canvas on the active theme', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'en-US');
    window.localStorage.setItem('svn-excel-diff-tool.settings', JSON.stringify({ themeKey: 'dark' }));
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));

  const expectedCanvas = {
    Dark: 'rgb(8, 9, 13)',
    Light: 'rgb(245, 247, 251)',
    'High Contrast': 'rgb(0, 0, 0)',
  } as const;

  let currentTheme: keyof typeof expectedCanvas = 'Dark';
  for (const nextTheme of ['Light', 'Dark', 'High Contrast'] as const) {
    const themeTrigger = page.getByRole('button', { name: currentTheme, exact: true });
    await expect(themeTrigger).toBeVisible();
    await themeTrigger.click();
    await page.getByRole('menuitemradio', { name: nextTheme, exact: true }).click();
    currentTheme = nextTheme;

    const expectedClass = nextTheme === 'Light'
      ? 'theme-light'
      : nextTheme === 'Dark'
        ? 'theme-dark'
        : 'theme-hc';
    await expect.poll(async () => page.evaluate((themeClass) => (
      document.documentElement.classList.contains(themeClass)
    ), expectedClass)).toBe(true);

    await expect.poll(async () => page.evaluate((expectedColor) => {
      const frame = document.querySelector<HTMLElement>('.app-window-frame--floating');
      const surface = document.querySelector<HTMLElement>('.app-window-surface--floating');
      if (!frame || !surface) return false;
      const frameStyle = getComputedStyle(frame);
      const surfaceStyle = getComputedStyle(surface);
      const frameRadius = Number.parseFloat(frameStyle.borderRadius);
      const surfaceRadius = Number.parseFloat(surfaceStyle.borderRadius);
      return Math.abs(frameRadius - 18) < 0.01
        && Math.abs(surfaceRadius - 18) < 0.01
        && frameStyle.overflow === 'hidden'
        && surfaceStyle.overflow === 'hidden'
        && surfaceStyle.backgroundClip.split(',').every((value) => value.trim() === 'border-box')
        && surfaceStyle.borderTopWidth === '0px'
        && surfaceStyle.borderRightWidth === '0px'
        && surfaceStyle.borderBottomWidth === '0px'
        && surfaceStyle.borderLeftWidth === '0px'
        && surfaceStyle.boxShadow === 'none'
        && frameStyle.backgroundColor === expectedColor
        && getComputedStyle(document.body).backgroundColor === expectedColor
        && getComputedStyle(document.getElementById('root')!).backgroundColor === expectedColor;
    }, expectedCanvas[nextTheme])).toBe(true);

    const bootCanvas = await page.evaluate(() => (
      getComputedStyle(document.documentElement).getPropertyValue('--boot-bg').trim()
    ));
    expect(bootCanvas).not.toBe('#09090B');
  }
});
