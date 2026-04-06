import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
import {
  resolveDiffMiniMapHighlightColor,
  resolveDiffMiniMapPaint,
} from '../src/utils/diff/minimapColors';

const lightTheme = getThemeTokensSnapshot('light');
const hcTheme = getThemeTokensSnapshot('hc');

test('shared minimap palette uses semantic surface colors', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'add'), lightTheme.addBg);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'delete'), lightTheme.delBg);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'modify'), lightTheme.chgBg);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'mixed'), lightTheme.chgBg);
});

test('shared minimap mixed paint uses the delete/modify/add gradient stops', () => {
  assert.deepEqual(resolveDiffMiniMapPaint(lightTheme, 'mixed'), {
    kind: 'gradient',
    stops: [
      { offset: 0, color: lightTheme.delBg },
      { offset: 0.5, color: lightTheme.chgBg },
      { offset: 1, color: lightTheme.addBg },
    ],
  });
});

test('shared minimap palette falls back to visible accent colors when diff surfaces are transparent', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'add'), hcTheme.addBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'delete'), hcTheme.delBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'modify'), hcTheme.chgTx);
});
