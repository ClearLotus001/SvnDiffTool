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
        '  shared stable line',
        'print("selection model")',
        'tail line',
      ].join('\n'),
      mineContent: [
        'alpha beta gamma',
        '  shared stable line',
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

test('multi-line logical selection uses connected editor overlays and whitespace dots without structure guides', async ({ page }) => {
  await loadTextDiff(page);

  const firstLine = page.locator('[data-line-idx="0"] [data-selectable-text-content="true"]').first();
  const secondLine = page.locator('[data-line-idx="1"] [data-selectable-text-content="true"]').first();
  const firstBox = await firstLine.boundingBox();
  const secondBox = await secondLine.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  await page.mouse.move(firstBox!.x + 4, firstBox!.y + (firstBox!.height / 2));
  await page.mouse.down();
  await page.mouse.move(
    secondBox!.x + (secondBox!.width * 0.75),
    secondBox!.y + (secondBox!.height / 2),
    { steps: 16 },
  );
  await page.mouse.up();

  const firstOverlay = firstLine.locator('[data-logical-text-selection-overlay="true"]');
  const secondOverlay = secondLine.locator('[data-logical-text-selection-overlay="true"]');
  await expect(firstOverlay).toBeVisible();
  await expect(secondOverlay).toBeVisible();
  await expect(secondLine.locator('[data-selection-whitespace="true"]')).toContainText('··');
  await expect(page.locator('[data-indent-guides="true"]')).toHaveCount(0);

  const [firstOverlayBox, secondOverlayBox] = await Promise.all([
    firstOverlay.boundingBox(),
    secondOverlay.boundingBox(),
  ]);
  expect(firstOverlayBox).not.toBeNull();
  expect(secondOverlayBox).not.toBeNull();
  expect(Math.abs((firstOverlayBox!.y + firstOverlayBox!.height) - secondOverlayBox!.y)).toBeLessThanOrEqual(1);
});

test('logical text selection context menu exposes copy, version, fold, and clear actions', async ({ page }) => {
  await loadTextDiff(page);

  const firstLine = page.locator('[data-line-idx="0"] [data-selectable-text-content="true"]').first();
  const secondLine = page.locator('[data-line-idx="1"] [data-selectable-text-content="true"]').first();
  const firstBox = await firstLine.boundingBox();
  const secondBox = await secondLine.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  const selectFirstTwoLines = async () => {
    await page.mouse.move(firstBox!.x + 4, firstBox!.y + (firstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(
      secondBox!.x + (secondBox!.width * 0.75),
      secondBox!.y + (secondBox!.height / 2),
      { steps: 16 },
    );
    await page.mouse.up();
  };
  const openSelectionMenu = async () => {
    await page.mouse.click(
      secondBox!.x + (secondBox!.width * 0.5),
      secondBox!.y + (secondBox!.height / 2),
      { button: 'right' },
    );
  };

  await selectFirstTwoLines();
  await openSelectionMenu();

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(5);
  await expect(page.getByRole('menuitem', { name: /Copy selected text|复制所选文本/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Copy selected lines from|复制 .* 选中行/ })).toHaveCount(2);
  await expect(page.getByRole('menuitem', { name: /Fold selected lines|折叠选中行/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Clear text selection|清除文本选择/ }).click();
  await expect(page.locator('[data-logical-text-selection-overlay="true"]')).toHaveCount(0);

  await selectFirstTwoLines();
  await openSelectionMenu();
  await page.getByRole('menuitem', { name: /Fold selected lines|折叠选中行/ }).click();
  await expect(page.locator('[data-collapse-range="true"]')).not.toHaveCount(0);
});
