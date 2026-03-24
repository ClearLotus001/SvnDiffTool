import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/theme';
import { getWorkbookSelectionOverlay, getWorkbookSelectionVisualState } from '../src/utils/workbookSelectionVisual';

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

  const mirrored = getWorkbookSelectionVisualState(theme, selectedCell, 'Thing', 'mine', 12, 4);
  const focused = getWorkbookSelectionVisualState(theme, selectedCell, 'Thing', 'base', 12, 4);

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

  const mirrored = getWorkbookSelectionVisualState(theme, selectedCell, 'Thing', 'base', 57287, 1);

  assert.equal(mirrored.isMirroredSelection, true);
  assert.equal(getWorkbookSelectionOverlay(mirrored), `${theme.acc2}18`);
});
