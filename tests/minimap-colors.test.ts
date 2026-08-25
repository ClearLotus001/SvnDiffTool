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

test('shared minimap palette uses the same semantic anchors as cells and status pills', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'add'), lightTheme.addBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'delete'), lightTheme.delBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'modify'), lightTheme.chgBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(lightTheme, 'mixed'), lightTheme.chgBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(darkTheme, 'add'), darkTheme.addBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(darkTheme, 'delete'), darkTheme.delBrd);
});

test('shared minimap mixed paint uses the delete/modify/add accent gradient stops', () => {
  assert.deepEqual(resolveDiffMiniMapPaint(lightTheme, 'mixed'), {
    kind: 'gradient',
    stops: [
      { offset: 0, color: lightTheme.delBrd },
      { offset: 0.5, color: lightTheme.chgBrd },
      { offset: 1, color: lightTheme.addBrd },
    ],
  });
});

test('shared minimap keeps dark-mode delete and modify colors visually distinct', () => {
  assert.notEqual(resolveDiffMiniMapHighlightColor(darkTheme, 'delete'), resolveDiffMiniMapHighlightColor(darkTheme, 'modify'));
});

test('shared minimap palette falls back to visible accent colors when diff surfaces are transparent', () => {
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'add'), hcTheme.addBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'delete'), hcTheme.delBrd);
  assert.equal(resolveDiffMiniMapHighlightColor(hcTheme, 'modify'), hcTheme.chgBrd);
});
