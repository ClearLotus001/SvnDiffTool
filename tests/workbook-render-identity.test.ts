import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookRenderIdentity } from '../src/utils/workbook/workbookRenderIdentity';

test('buildWorkbookRenderIdentity includes mode sheet and theme when mode exists', () => {
  assert.equal(
    buildWorkbookRenderIdentity({
      mode: 'stacked',
      sheetName: 'Sheet1',
      themeKey: 'light',
    }),
    'stacked:Sheet1:light',
  );
});

test('buildWorkbookRenderIdentity falls back to none when sheet is missing', () => {
  assert.equal(
    buildWorkbookRenderIdentity({
      sheetName: null,
      themeKey: 'dark',
    }),
    'none:dark',
  );
});
