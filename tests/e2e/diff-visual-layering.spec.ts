import { expect, test, type Page } from '@playwright/test';
import '../../src/utils/app/e2eBridge';

async function loadSplitInsertion(page: Page) {
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'visual-layering.py',
      baseName: 'visual-layering-base.py',
      mineName: 'visual-layering-mine.py',
      layout: 'split-h',
      collapseCtx: false,
      baseContent: [
        'shared tail',
      ].join('\n'),
      mineContent: [
        'inserted line',
        'shared tail',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

async function loadUnifiedModification(page: Page) {
  await page.goto('/?__e2e=1');
  await page.waitForFunction(() => Boolean(window.__SVN_DIFF_E2E__));
  await page.evaluate(async () => {
    await window.__SVN_DIFF_E2E__!.loadTextDiff({
      fileName: 'visual-selection.py',
      baseName: 'visual-selection-base.py',
      mineName: 'visual-selection-mine.py',
      layout: 'unified',
      collapseCtx: false,
      baseContent: [
        'def create_bug_group(data):',
      ].join('\n'),
      mineContent: [
        'def create_urgent_bug_group(data):',
      ].join('\n'),
    });
  });
  await page.waitForFunction(() => window.__SVN_DIFF_E2E__?.getSnapshot().hasLoadedDiff === true);
}

test('split diff preserves semantic color under selected rows and renders striped empty sides', async ({ page }) => {
  await loadSplitInsertion(page);

  const addedCell = page.locator('[data-copy-side="mine"][data-line-idx="0"]').first();
  const emptyCell = page.locator('[data-empty-side="true"][data-copy-side="base"]').first();

  await expect(addedCell).toBeVisible();
  await expect(emptyCell).toBeVisible();

  await addedCell.locator('button').click();

  await expect(addedCell).toHaveAttribute('style', /--diff-add-bg/);
  await expect(addedCell).toHaveAttribute('style', /--acc2/);
  await expect(emptyCell).toHaveAttribute('style', /repeating-linear-gradient\(135deg/);
});

test('text diff accents sit on the content edge after the line-number gutter', async ({ page }) => {
  await loadSplitInsertion(page);

  const splitRow = page.locator('[data-copy-side="mine"][data-line-idx="0"]').first();
  const splitAccent = splitRow.locator('[data-diff-row-accent="true"]');
  const splitContent = splitRow.locator('[data-diff-row-content="true"]');

  await expect(splitAccent).toBeVisible();
  await expect(splitContent).toBeVisible();

  const [splitAccentBox, splitContentBox] = await Promise.all([
    splitAccent.boundingBox(),
    splitContent.boundingBox(),
  ]);
  expect(splitAccentBox).not.toBeNull();
  expect(splitContentBox).not.toBeNull();
  expect(Math.abs(splitAccentBox!.x - splitContentBox!.x)).toBeLessThanOrEqual(0.5);

  await loadUnifiedModification(page);

  const unifiedRow = page.locator('[data-line-idx="1"]').first();
  const unifiedAccent = unifiedRow.locator('[data-diff-row-accent="true"]');
  const unifiedContent = unifiedRow.locator('[data-diff-row-content="true"]');

  await expect(unifiedAccent).toBeVisible();
  await expect(unifiedContent).toBeVisible();

  const [unifiedAccentBox, unifiedContentBox] = await Promise.all([
    unifiedAccent.boundingBox(),
    unifiedContent.boundingBox(),
  ]);
  expect(unifiedAccentBox).not.toBeNull();
  expect(unifiedContentBox).not.toBeNull();
  expect(Math.abs(unifiedAccentBox!.x - unifiedContentBox!.x)).toBeLessThanOrEqual(0.5);
});

test('logical text selection keeps character diff highlight visible', async ({ page }) => {
  await loadUnifiedModification(page);

  const changedText = page.locator('[data-line-idx="1"] [data-selectable-text-content="true"]').first();
  await expect(changedText).toBeVisible();

  const box = await changedText.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + 4, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 4, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();

  const selectedDiffMark = page.locator('[data-line-idx="1"] [data-selectable-text-content="true"] mark').filter({
    hasText: /urgent|bug/,
  }).first();
  await expect(selectedDiffMark).toBeVisible();
  await expect(selectedDiffMark).toHaveAttribute('style', /--text-selection-bg/);
  await expect(selectedDiffMark).toHaveAttribute('style', /--diff-modify-hl/);
});

test('character diff highlight preserves syntax foreground color', async ({ page }) => {
  await loadUnifiedModification(page);

  const highlightedSyntaxText = page.locator('[data-line-idx="1"] [data-diff-char-highlight="true"]').filter({
    hasText: 'urgent',
  }).first();
  await expect(highlightedSyntaxText).toBeVisible();
  await expect(highlightedSyntaxText).toHaveAttribute('style', /-webkit-text-fill-color/);

  const visuals = await highlightedSyntaxText.evaluate((element) => {
    const style = getComputedStyle(element);
    const rootStyle = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    probe.style.color = rootStyle.getPropertyValue('--diff-modify-text').trim();
    document.body.append(probe);
    const diffTextColor = getComputedStyle(probe).color;
    probe.remove();

    return {
      color: style.color,
      textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
      diffTextColor,
      backgroundImage: style.backgroundImage,
    };
  });

  expect(visuals.backgroundImage).toContain('linear-gradient');
  expect(visuals.textFillColor).toBe(visuals.color);
  expect(visuals.color).not.toBe(visuals.diffTextColor);
});
