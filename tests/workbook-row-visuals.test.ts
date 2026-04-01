import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/theme';
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
  assert.equal(resolveWorkbookRowBorderColor(THEMES.light, 'add'), THEMES.light.addBrd);
  assert.equal(resolveWorkbookRowBorderColor(THEMES.light, 'delete'), THEMES.light.delBrd);
  assert.equal(resolveWorkbookRowBorderColor(THEMES.light, 'mixed'), THEMES.light.chgTx);

  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: THEMES.light,
    tone: 'add',
    fallbackTone: 'base',
  }), THEMES.light.addTx);
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: THEMES.light,
    tone: 'delete',
    fallbackTone: 'mine',
  }), THEMES.light.delTx);
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: THEMES.light,
    tone: 'mixed',
    fallbackTone: 'neutral',
  }), THEMES.light.chgTx);
});

test('workbook row visuals fall back to side colors for equal rows and support stacked side accents', () => {
  assert.equal(resolveWorkbookRowLineNumberColor({
    theme: THEMES.light,
    tone: 'equal',
    fallbackTone: 'base',
  }), `${THEMES.light.acc2}bf`);
  assert.equal(resolveWorkbookRowBorderColor(THEMES.light, 'delete', 'mine'), THEMES.light.acc);
  assert.equal(resolveWorkbookRowRuleColor(THEMES.light, 'delete', 'mine'), `${THEMES.light.acc}66`);
});

test('workbook row visuals resolve region and minimap tones consistently', () => {
  assert.equal(resolveWorkbookRegionTone(true, false), 'delete');
  assert.equal(resolveWorkbookRegionTone(false, true), 'add');
  assert.equal(resolveWorkbookRegionTone(true, true), 'mixed');
  assert.equal(resolveWorkbookMiniMapColor(THEMES.light, 'mixed'), THEMES.light.chgTx);
});

test('workbook row visuals resolve row surface, selection accent and gutter background consistently', () => {
  assert.equal(resolveWorkbookRowSurfaceBackground({
    theme: THEMES.light,
    isGuided: true,
    isActiveSearch: false,
    isSearchMatch: false,
  }), `${THEMES.light.acc2}08`);
  assert.equal(resolveWorkbookRowSurfaceBackground({
    theme: THEMES.light,
    isGuided: false,
    isActiveSearch: true,
    isSearchMatch: false,
  }), THEMES.light.searchActiveBg);
  assert.equal(resolveWorkbookRowSelectionAccent(THEMES.light, 'mine'), THEMES.light.acc);
  assert.equal(resolveWorkbookRowGutterBackground({
    theme: THEMES.light,
    selectionAccent: THEMES.light.acc,
    isSelected: true,
  }), `${THEMES.light.acc}26`);
});

test('workbook aux bar palette follows semantic tones', () => {
  const palette = resolveWorkbookAuxBarPalette(THEMES.light, 'mixed');
  assert.equal(palette.accent, THEMES.light.chgTx);
  assert.equal(palette.buttonText, THEMES.light.chgTx);
});

test('workbook accent surface visuals expose shared badge and button tokens', () => {
  assert.deepEqual(resolveWorkbookAccentSurfaceVisual(THEMES.light.acc2), {
    background: `${THEMES.light.acc2}18`,
    border: 'transparent',
    textColor: THEMES.light.acc2,
  });
  assert.deepEqual(resolveWorkbookAccentSurfaceVisual(THEMES.light.acc, 'button'), {
    background: `${THEMES.light.acc}16`,
    border: `${THEMES.light.acc}55`,
    textColor: THEMES.light.acc,
  });
});
