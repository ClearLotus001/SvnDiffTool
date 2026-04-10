import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
import {
  resolveDiffMiniMapHighlightColor,
  resolveDiffMiniMapPaint,
} from '../src/utils/diff/minimapColors';

const lightTheme = getThemeTokensSnapshot('light');
const darkTheme = getThemeTokensSnapshot('dark');
const hcTheme = getThemeTokensSnapshot('hc');

test('shared minimap palette prefers high-contrast semantic colors', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'add'), lightTheme.miniAdd);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'delete'), lightTheme.miniDel);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'modify'), lightTheme.chgBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'mixed'), lightTheme.chgBrd);
});

test('shared minimap mixed paint uses the delete/modify/add accent gradient stops', () => {
  assert.deepEqual(resolveDiffMiniMapPaint(lightTheme, 'mixed'), {
    kind: 'gradient',
    stops: [
      { offset: 0, color: lightTheme.miniDel },
      { offset: 0.5, color: lightTheme.chgBrd },
      { offset: 1, color: lightTheme.miniAdd },
    ],
  });
});

test('shared minimap keeps dark-mode delete and modify colors visually distinct', () => {
  assert.notEqual(resolveDiffMiniMapHighlightColor(darkTheme, 'delete'), resolveDiffMiniMapHighlightColor(darkTheme, 'modify'));
});

test('shared minimap palette falls back to visible accent colors when diff surfaces are transparent', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'add'), hcTheme.miniAdd);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'delete'), hcTheme.miniDel);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'modify'), hcTheme.chgBrd);
});
