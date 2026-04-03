import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
const lightTheme = getThemeTokensSnapshot('light');

import {
  resolveWorkbookAccentSurfaceVisual,
  resolveWorkbookAuxBarPalette,
  resolveWorkbookMiniMapColor,
  resolveWorkbookRowBorderColor,
  resolveWorkbookRowGutterBackground,
  resolveWorkbookRowLineNumberColor,
  resolveWorkbookRowSelectionAccent,
  resolveWorkbookRowSurfaceBackground,
  resolveWorkbookRowRuleColor,
  resolveWorkbookRegionTone,
} from '../src/utils/workbook/workbookRowVisuals';

test('workbook row visuals use semantic add/delete/mixed colors', () => {
  assert.equal(resolveWorkbookRowBorderColor(lightTheme, 'add'), lightTheme.addBrd);
  assert.equal(resolveWorkbookRowBorderColor(lightTheme, 'delete'), lightTheme.delBrd);
  assert.equal(resolveWorkbookRowBorderColor(lightTheme, 'mixed'), lightTheme.chgTx);

  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: lightTheme,
    tone: 'add',
    fallbackTone: 'base',
  }), lightTheme.addTx);
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: lightTheme,
    tone: 'delete',
    fallbackTone: 'mine',
  }), lightTheme.delTx);
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: lightTheme,
    tone: 'mixed',
    fallbackTone: 'neutral',
  }), lightTheme.chgTx);
});

test('workbook row visuals fall back to side colors for equal rows and support stacked side accents', () => {
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: lightTheme,
    tone: 'equal',
    fallbackTone: 'base',
  }), `${lightTheme.acc2}bf`);
  assert.equal(resolveWorkbookRowBorderColor(lightTheme, 'delete', 'mine'), lightTheme.acc);
  assert.equal(resolveWorkbookRowRuleColor(lightTheme, 'delete', 'mine'), `${lightTheme.acc}66`);
});

test('workbook row visuals resolve region and minimap tones consistently', () => {
  assert.equal(resolveWorkbookRegionTone(true, false), 'delete');
  assert.equal(resolveWorkbookRegionTone(false, true), 'add');
  assert.equal(resolveWorkbookRegionTone(true, true), 'mixed');
  const mixedMiniMapColor = resolveWorkbookMiniMapColor(lightTheme, 'mixed');
  assert.notEqual(mixedMiniMapColor, lightTheme.bg2);
  assert.match(mixedMiniMapColor, /^(#|rgba?\()/i);
});

test('workbook row visuals resolve row surface, selection accent and gutter background consistently', () => {
  assert.equal(resolveWorkbookRowSurfaceBackground({
    theme: lightTheme,
    isGuided: true,
    isActiveSearch: false,
    isSearchMatch: false,
  }), `${lightTheme.acc2}08`);
  assert.equal(resolveWorkbookRowSurfaceBackground({
    theme: lightTheme,
    isGuided: false,
    isActiveSearch: true,
    isSearchMatch: false,
  }), lightTheme.searchActiveBg);
  assert.equal(resolveWorkbookRowSelectionAccent(lightTheme, 'mine'), lightTheme.acc);
  assert.equal(resolveWorkbookRowGutterBackground({
    theme: lightTheme,
    selectionAccent: lightTheme.acc,
    isSelected: true,
  }), `${lightTheme.acc}26`);
});

test('workbook aux bar palette follows semantic tones', () => {
  const palette = resolveWorkbookAuxBarPalette(lightTheme, 'mixed');
  assert.equal(palette.accent, lightTheme.chgTx);
  assert.equal(palette.buttonText, lightTheme.chgTx);
});

test('workbook accent surface visuals expose shared badge and button tokens', () => {
  assert.deepEqual(resolveWorkbookAccentSurfaceVisual(lightTheme.acc2), {
    background: `${lightTheme.acc2}18`,
    border: 'transparent',
    textColor: lightTheme.acc2,
  });
  assert.deepEqual(resolveWorkbookAccentSurfaceVisual(lightTheme.acc, 'button'), {
    background: `${lightTheme.acc}16`,
    border: `${lightTheme.acc}55`,
    textColor: lightTheme.acc,
  });
});
