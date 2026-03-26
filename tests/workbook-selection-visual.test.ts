import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/theme';
import { getWorkbookSelectionOverlay, getWorkbookSelectionVisualState } from '../src/utils/workbookSelectionVisual';
import { buildWorkbookSelectionLookup, createWorkbookSelectionState } from '../src/utils/workbookSelectionState';

test('mirrored workbook cell selection uses the mirrored side accent', () => {
  const theme = THEMES.light;
  const selectedCell = {
    kind: 'cell' as const,
    sheetName: 'Thing',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 12,
    colIndex: 4,
    colLabel: 'E',
    address: 'E12',
    value: 'x',
    formula: '',
  };

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(selectedCell));
  const mirrored = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'mine', 12, 4);
  const focused = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4);

  assert.equal(mirrored.accent, theme.acc);
  assert.equal(focused.accent, theme.acc2);
  assert.equal(getWorkbookSelectionOverlay(mirrored), `${theme.acc}18`);
  assert.equal(getWorkbookSelectionOverlay(focused), `${theme.acc2}2c`);
});

test('mirrored workbook selection still resolves when the mirrored side has no local entry row number', () => {
  const theme = THEMES.light;
  const selectedCell = {
    kind: 'cell' as const,
    sheetName: 'Thing',
    side: 'mine' as const,
    versionLabel: 'LOCAL',
    rowNumber: 57287,
    colIndex: 1,
    colLabel: 'B',
    address: 'B57287',
    value: 'x',
    formula: '',
  };

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(selectedCell));
  const mirrored = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 57287, 1);

  assert.equal(mirrored.isMirroredSelection, true);
  assert.equal(getWorkbookSelectionOverlay(mirrored), `${theme.acc2}18`);
});

test('secondary cell selections render with a lighter direct-selection overlay', () => {
  const theme = THEMES.light;
  const primary = {
    kind: 'cell' as const,
    sheetName: 'Thing',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 12,
    colIndex: 4,
    colLabel: 'E',
    address: 'E12',
    value: 'x',
    formula: '',
  };
  const secondary = {
    ...primary,
    rowNumber: 13,
    address: 'E13',
  };

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(primary, [primary, secondary]));
  const visual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 13, 4);

  assert.equal(visual.isSecondarySelected, true);
  assert.equal(getWorkbookSelectionOverlay(visual), `${theme.acc2}18`);
});
