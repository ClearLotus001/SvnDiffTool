import { expect, test } from '@playwright/test';

test('goto action keeps the correct inverse contrast in every theme', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('svn-excel-diff-tool.locale', 'zh-CN');
    window.versora = { getLaunchContext: () => new Promise(() => {}) } as NonNullable<typeof window.versora>;
  });
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'goto-theme.txt',
      baseName: 'base-goto-theme.txt',
      mineName: 'mine-goto-theme.txt',
      baseContent: 'one\ntwo\nthree',
      mineContent: 'one\nchanged\nthree',
    });
  });

  await page.keyboard.press('Control+g');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox');
  await input.fill('2');
  const submit = page.getByTestId('goto-line-submit');
  await expect(submit).toBeEnabled();

  const expected = {
    light: { color: 'rgb(250, 250, 250)', activeBackground: '#09090B' },
    dark: { color: 'rgb(9, 9, 11)', activeBackground: '#FAFAFA' },
    hc: { color: 'rgb(0, 0, 0)', activeBackground: '#FFFF00' },
  } as const;

  const renderedBackgrounds: string[] = [];
  for (const theme of ['light', 'dark', 'hc'] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-hc');
      document.documentElement.classList.add(`theme-${nextTheme}`);
    }, theme);
    const style = await submit.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        color: computed.color,
        activeBackground: computed.getPropertyValue('--btn-active-bg').trim(),
        visualBackground: getComputedStyle(element, '::after').backgroundColor,
        visualBackgroundImage: getComputedStyle(element, '::after').backgroundImage,
      };
    });
    expect({ color: style.color, activeBackground: style.activeBackground }).toEqual(expected[theme]);
    if (theme === 'hc') {
      expect(style.visualBackground).toBe('rgb(255, 255, 0)');
      expect(style.visualBackgroundImage).toBe('none');
    } else {
      expect(style.visualBackgroundImage).toContain('linear-gradient');
      renderedBackgrounds.push(style.visualBackgroundImage);
    }
  }
  expect(new Set(renderedBackgrounds).size).toBe(2);
});
