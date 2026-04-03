import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
const lightTheme = getThemeTokensSnapshot('light');

import {
  getWorkbookSelectionOverlay,
  getWorkbookSelectionPaint,
  getWorkbookSelectionVisualState,
} from '../src/utils/workbook/workbookSelectionVisual';
import { buildWorkbookSelectionLookup, createWorkbookSelectionState } from '../src/utils/workbook/workbookSelectionState';

test('mirrored workbook cell selection uses the mirrored side accent', () => {
  const theme = lightTheme;
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
  assert.equal(getWorkbookSelectionOverlay(mirrored), `${theme.acc}0d`);
  assert.equal(getWorkbookSelectionOverlay(focused), `${theme.acc2}14`);
});

test('mirrored workbook selection still resolves when the mirrored side has no local entry row number', () => {
  const theme = lightTheme;
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
  assert.equal(getWorkbookSelectionOverlay(mirrored), `${theme.acc2}0d`);
});

test('secondary cell selections render with a lighter direct-selection overlay', () => {
  const theme = lightTheme;
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
  assert.equal(getWorkbookSelectionOverlay(visual), `${theme.acc2}0d`);
});

test('selection paint derives shared frame and overlay tokens from visual state', () => {
  const theme = lightTheme;
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

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(primary));
  const visual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4);
  const paint = getWorkbookSelectionPaint(visual);

  assert.equal(paint.overlay, `${theme.acc2}14`);
  assert.equal(paint.primaryOuterStroke, `${theme.bg0}e6`);
  assert.equal(paint.primaryInnerStroke, theme.acc2);
});

test('active search selection uses stronger search-focused overlay and halo', () => {
  const theme = lightTheme;
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

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(primary));
  const visual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4, true);
  const paint = getWorkbookSelectionPaint(visual);

  assert.equal(visual.isSearchFocused, true);
  assert.equal(getWorkbookSelectionOverlay(visual), `${theme.searchHl}26`);
  assert.equal(paint.searchHaloStroke, `${theme.searchHl}c8`);
  assert.equal(paint.primaryInnerStroke, theme.acc2);
});

test('drag preview selection uses a stronger overlay and dashed preview stroke', () => {
  const theme = lightTheme;
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

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(primary));
  const visual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4, false, true);
  const paint = getWorkbookSelectionPaint(visual);

  assert.equal(visual.isPreviewActive, true);
  assert.equal(getWorkbookSelectionOverlay(visual), `${theme.acc2}22`);
  assert.equal(paint.previewStroke, `${theme.acc2}96`);
});

test('drag preview only draws dashed edges on the outer boundary of a selected range', () => {
  const theme = lightTheme;
  const leftCell = {
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
  const rightCell = {
    ...leftCell,
    colIndex: 5,
    colLabel: 'F',
    address: 'F12',
  };

  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(rightCell, [leftCell, rightCell], leftCell));
  const leftVisual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4, false, true);
  const rightVisual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 5, false, true);

  assert.deepEqual(leftVisual.previewEdges, {
    top: true,
    right: false,
    bottom: true,
    left: true,
  });
  assert.deepEqual(rightVisual.previewEdges, {
    top: true,
    right: true,
    bottom: true,
    left: false,
  });
});
