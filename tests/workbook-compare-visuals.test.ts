import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/theme';
import { getWorkbookCompareCellsTone } from '../src/utils/workbookCompareTone';
import { resolveWorkbookCompareCellVisual } from '../src/utils/workbookCompareVisuals';

const changedCell = {
  column: 2,
  baseCell: { value: 'before', formula: '' },
  mineCell: { value: 'after', formula: '' },
  changed: true,
  masked: false,
};

test('paired workbook changes use the yellow modify palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
    compareCell: changedCell,
    side: 'base',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: THEMES.light.t1,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.chgBg,
    border: THEMES.light.chgTx,
    textColor: THEMES.light.chgTx,
    maskOverlay: null,
  });
});

test('stacked paired workbook changes can use the base side accent palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
    compareCell: changedCell,
    side: 'base',
    modifyColorMode: 'side-accent',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: THEMES.light.t1,
  });

  assert.deepEqual(visual, {
    background: `${THEMES.light.acc2}12`,
    border: `${THEMES.light.acc2}66`,
    textColor: THEMES.light.acc2,
    maskOverlay: null,
  });
});

test('stacked paired workbook changes can use the mine side accent palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
    compareCell: changedCell,
    side: 'mine',
    modifyColorMode: 'side-accent',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: true,
    defaultTextColor: THEMES.light.t0,
  });

  assert.deepEqual(visual, {
    background: `${THEMES.light.acc}12`,
    border: `${THEMES.light.acc}66`,
    textColor: THEMES.light.acc,
    maskOverlay: null,
  });
});

test('strict-only workbook changes use the blue whitespace palette', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
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
    defaultTextColor: THEMES.light.t1,
  });

  assert.deepEqual(visual, {
    background: `${THEMES.light.acc2}16`,
    border: `${THEMES.light.acc2}66`,
    textColor: THEMES.light.acc2,
    maskOverlay: null,
  });
});

test('single-sided workbook additions keep add semantics', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
    compareCell: changedCell,
    side: 'mine',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: false,
    hasMineRow: true,
    defaultTextColor: THEMES.light.t0,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.addBg,
    border: THEMES.light.addBrd,
    textColor: THEMES.light.addTx,
    maskOverlay: null,
  });
});

test('single-sided workbook deletions keep delete semantics', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
    compareCell: changedCell,
    side: 'base',
    hasEntry: true,
    hasContent: true,
    hasBaseRow: true,
    hasMineRow: false,
    defaultTextColor: THEMES.light.t1,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.delBg,
    border: THEMES.light.delBrd,
    textColor: THEMES.light.delTx,
    maskOverlay: null,
  });
});

test('paired workbook deletions use the delete palette when one side becomes empty', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
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
    defaultTextColor: THEMES.light.t0,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.delBg,
    border: THEMES.light.delBrd,
    textColor: THEMES.light.delTx,
    maskOverlay: null,
  });
});

test('paired workbook additions use the add palette when one side becomes populated', () => {
  const visual = resolveWorkbookCompareCellVisual({
    theme: THEMES.light,
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
    defaultTextColor: THEMES.light.t0,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.addBg,
    border: THEMES.light.addBrd,
    textColor: THEMES.light.addTx,
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
    theme: THEMES.light,
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
    defaultTextColor: THEMES.light.t0,
  });

  assert.deepEqual(visual, {
    background: THEMES.light.bg1,
    border: THEMES.light.border2,
    textColor: THEMES.light.t0,
    maskOverlay: `${THEMES.light.bg1}22`,
  });
});
