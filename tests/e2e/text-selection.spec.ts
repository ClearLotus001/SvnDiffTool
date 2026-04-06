import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';

async function loadTextDiff(page: Page) {
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'selection-sample.py',
      baseName: 'selection-base.py',
      mineName: 'selection-mine.py',
      layout: 'unified',
      collapseCtx: false,
      baseContent: [
        'alpha beta gamma',
        'shared stable line',
        'print("selection model")',
        'tail line',
      ].join('\n'),
      mineContent: [
        'alpha beta gamma',
        'shared stable line',
        'print("selection model updated")',
        'tail line',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

test('double click selects a word and Shift+ArrowRight extends the logical selection', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadTextDiff(page);

  const line = page.locator('[data-line-idx="0"] [data-selectable-text-content="true"]').first();
  await expect(line).toBeVisible();
  const box = await line.boundingBox();
  expect(box).not.toBeNull();

  const text = 'alpha beta gamma';
  const charWidth = box!.width / text.length;
  const targetX = box!.x + (charWidth * 7.5); // inside "beta"
  const targetY = box!.y + (box!.height / 2);

  await page.mouse.dblclick(targetX, targetY);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press(COPY_SHORTCUT);

  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe('beta ');
});

test('dragging from the blank area creates a logical selection and clicking blank space clears it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadTextDiff(page);

  const row = page.locator('[data-line-idx="0"]').first();
  const text = page.locator('[data-line-idx="0"] [data-selectable-text-content="true"]').first();
  await expect(row).toBeVisible();
  await expect(text).toBeVisible();

  const rowBox = await row.boundingBox();
  const textBox = await text.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(textBox).not.toBeNull();

  const startX = rowBox!.x + rowBox!.width - 12;
  const startY = rowBox!.y + (rowBox!.height / 2);
  const endX = textBox!.x + (textBox!.width * 0.35);
  const endY = textBox!.y + (textBox!.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  const selectedMarks = page.locator('[data-line-idx="0"] [data-selectable-text-content="true"] mark');
  await expect(selectedMarks).not.toHaveCount(0);
  await page.keyboard.press(COPY_SHORTCUT);

  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('beta gamma');

  await page.mouse.click(startX, startY);
  await expect(selectedMarks).toHaveCount(0);
});
