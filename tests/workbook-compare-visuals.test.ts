import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
import { getWorkbookCompareCellsTone } from '../src/utils/workbook/workbookCompareTone';
const lightTheme = getThemeTokensSnapshot('light');

import {
  getWorkbookCompareHintVisual,
  getWorkbookMergeContinuationVisual,
  resolveWorkbookCompareCellKind,
  resolveWorkbookCompareCellVisual,
} from '../src/utils/workbook/workbookCompareVisuals';

const changedCell = {
  column: 2,
  baseCell: { value: 'before', formula: '' },
  mineCell: { value: 'after', formula: '' },
  changed: true,
  masked: false,
};

test('paired workbook changes use the yellow modify palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: changedCell,
    side: 'base',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t1,
  });

  assert.deepEqual(visual, {
    background: lightTheme.chgBg,
    border: lightTheme.chgBrd,
    textColor: lightTheme.chgTx,
    maskOverlay: null,
  });
});

test('stacked paired workbook changes can use the base side accent palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: changedCell,
    side: 'base',
    modifyColorMode: 'side-accent',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t1,
  });

  assert.deepEqual(visual, {
    background: `${lightTheme.acc2}12`,
    border: `${lightTheme.acc2}66`,
    textColor: lightTheme.acc2,
    maskOverlay: null,
  });
});

test('stacked paired workbook changes can use the mine side accent palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: changedCell,
    side: 'mine',
    modifyColorMode: 'side-accent',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t0,
  });

  assert.deepEqual(visual, {
    background: `${lightTheme.acc}12`,
    border: `${lightTheme.acc}66`,
    textColor: lightTheme.acc,
    maskOverlay: null,
  });
});

test('strict-only workbook changes use the blue whitespace palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: {
      ...changedCell,
      baseCell: { value: ' ', formula: '' },
      mineCell: { value: '', formula: '' },
      strictOnly: true,
      kind: 'delete',
    },
    side: 'base',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t1,
  });

  assert.deepEqual(visual, {
    background: `${lightTheme.acc2}16`,
    border: `${lightTheme.acc2}66`,
    textColor: lightTheme.acc2,
    maskOverlay: null,
  });
});

test('single-sided workbook additions keep add semantics', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: changedCell,
    side: 'mine',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: false,
    hasMineRow: true,
    defaultTextColor: lightTheme.t0,
  });

  assert.deepEqual(visual, {
    background: lightTheme.addBg,
    border: lightTheme.addBrd,
    textColor: lightTheme.addTx,
    maskOverlay: null,
  });
});

test('single-sided workbook deletions keep delete semantics', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: changedCell,
    side: 'base',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: false,
    defaultTextColor: lightTheme.t1,
  });

  assert.deepEqual(visual, {
    background: lightTheme.delBg,
    border: lightTheme.delBrd,
    textColor: lightTheme.delTx,
    maskOverlay: null,
  });
});

test('paired workbook deletions use the delete palette when one side becomes empty', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: {
      ...changedCell,
      baseCell: { value: 'before', formula: '' },
      mineCell: { value: '', formula: '' },
    },
    compareMode: 'strict',
    side: 'mine',
    hasEntry: true,
    hasContent: false,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t0,
  });

  assert.deepEqual(visual, {
    background: lightTheme.delBg,
    border: lightTheme.delBrd,
    textColor: lightTheme.delTx,
    maskOverlay: null,
  });
});

test('paired workbook additions use the add palette when one side becomes populated', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: {
      ...changedCell,
      baseCell: { value: '', formula: '' },
      mineCell: { value: 'after', formula: '' },
    },
    compareMode: 'strict',
    side: 'mine',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t0,
  });

  assert.deepEqual(visual, {
    background: lightTheme.addBg,
    border: lightTheme.addBrd,
    textColor: lightTheme.addTx,
    maskOverlay: null,
  });
});

test('compare tone marks paired delete-like changes as delete', () => {
  const tone = getWorkbookCompareCellsTone([
    {
      ...changedCell,
      baseCell: { value: 'before', formula: '' },
      mineCell: { value: '', formula: '' },
    },
  ]);

  assert.equal(tone, 'delete');
});

test('compare tone marks paired add-like changes as add', () => {
  const tone = getWorkbookCompareCellsTone([
    {
      ...changedCell,
      baseCell: { value: '', formula: '' },
      mineCell: { value: 'after', formula: '' },
    },
  ]);

  assert.equal(tone, 'add');
});

test('compare tone marks content-preserving value edits as mixed', () => {
  const tone = getWorkbookCompareCellsTone([changedCell]);

  assert.equal(tone, 'mixed');
});

test('masked workbook cells preserve the normal palette and overlay', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: lightTheme,
    compareCell: {
      ...changedCell,
      changed: false,
      masked: true,
    },
    side: 'mine',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: lightTheme.t0,
  });

  assert.deepEqual(visual, {
    background: lightTheme.bg1,
    border: lightTheme.border2,
    textColor: lightTheme.t0,
    maskOverlay: `${lightTheme.bg1}22`,
  });
});

test('compare visuals expose shared semantic hint palettes and merge continuation visuals', () => {
  assert.equal(resolveWorkbookCompareCellKind({
    ...changedCell,
    strictOnly: true,
    kind: 'delete',
  }), 'strict-only');

  assert.deepEqual(getWorkbookCompareHintVisual(lightTheme, 'strict-only'), {
    background: `${lightTheme.acc2}14`,
    border: `${lightTheme.acc2}33`,
    textColor: lightTheme.acc2,
  });

  assert.deepEqual(getWorkbookMergeContinuationVisual(lightTheme, lightTheme.delBrd), {
    background: `${lightTheme.bg0}1c`,
    guideStroke: `${lightTheme.delBrd}66`,
  });
});
