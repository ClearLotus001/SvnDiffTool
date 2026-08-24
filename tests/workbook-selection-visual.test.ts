import test from 'node:test';
import assert from 'node:assert/strict';

import { getThemeTokensSnapshot } from '../src/theme';
const lightTheme = getThemeTokensSnapshot('light');

import {
  getWorkbookSelectionBorderVisual,
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

  assert.equal(mirrored.accent, theme.versionMine);
  assert.equal(focused.accent, theme.versionBase);
  assert.equal(mirrored.isActiveComparisonCell, true);
  assert.equal(focused.isActiveComparisonCell, true);
  assert.equal(getWorkbookSelectionOverlay(mirrored), null);
  assert.equal(getWorkbookSelectionOverlay(focused), null);
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
  assert.equal(mirrored.isSelectedComparisonCell, true);
  assert.equal(getWorkbookSelectionOverlay(mirrored), null);
});

test('secondary comparison cells use a lighter outline without obscuring diff surfaces', () => {
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
  const paint = getWorkbookSelectionPaint(visual);

  assert.equal(visual.isSecondarySelected, true);
  assert.equal(getWorkbookSelectionOverlay(visual), null);
  assert.equal(paint.cellStroke, theme.versionBase);
  assert.equal(paint.cellStrokeWidth, 1);
});

test('selection paint reuses version identity and adds no persistent cell overlay', () => {
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

  assert.equal(paint.overlay, null);
  assert.equal(paint.cellStroke, theme.versionBase);
  assert.equal(paint.cellStrokeWidth, 2);
});

test('primary and mirrored cells resolve ordered border replacements', () => {
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
    value: 'changed',
    formula: '',
  };
  const selectionLookup = buildWorkbookSelectionLookup(createWorkbookSelectionState(primary));
  const visual = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'base', 12, 4);
  assert.deepEqual(getWorkbookSelectionBorderVisual(visual), {
    color: theme.versionBase,
    thickness: 2,
    priority: 6,
    edges: { top: true, right: true, bottom: true, left: true },
  });

  const mirrored = getWorkbookSelectionVisualState(theme, selectionLookup, 'Thing', 'mine', 12, 4);
  assert.deepEqual(getWorkbookSelectionBorderVisual(mirrored), {
    color: theme.versionMine,
    thickness: 2,
    priority: 4,
    edges: { top: true, right: true, bottom: true, left: true },
  });
});

test('whole-row and whole-column selections expose axis-only border candidates', () => {
  const theme = lightTheme;
  const rowSelection = {
    kind: 'row' as const,
    sheetName: 'Thing',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 12,
    colIndex: 0,
    colLabel: 'A',
    address: '12',
    value: '',
    formula: '',
  };
  const rowVisual = getWorkbookSelectionVisualState(
    theme,
    buildWorkbookSelectionLookup(createWorkbookSelectionState(rowSelection)),
    'Thing',
    'base',
    12,
    4,
  );
  assert.deepEqual(getWorkbookSelectionBorderVisual(rowVisual), {
    color: `${theme.versionBase}a6`,
    thickness: 2,
    priority: 3,
    edges: { top: true, right: false, bottom: true, left: false },
  });

  const columnSelection = {
    ...rowSelection,
    kind: 'column' as const,
    colIndex: 4,
    colLabel: 'E',
    address: 'E',
  };
  const columnVisual = getWorkbookSelectionVisualState(
    theme,
    buildWorkbookSelectionLookup(createWorkbookSelectionState(columnSelection)),
    'Thing',
    'mine',
    18,
    4,
  );
  assert.deepEqual(getWorkbookSelectionBorderVisual(columnVisual), {
    color: `${theme.versionMine}a6`,
    thickness: 2,
    priority: 3,
    edges: { top: false, right: true, bottom: false, left: true },
  });
});

test('active search selection replaces the comparison outline without adding a halo', () => {
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
  assert.equal(getWorkbookSelectionOverlay(visual), null);
  assert.equal(paint.cellStroke, theme.searchHl);
  assert.equal(paint.cellStrokeWidth, 2);
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
  assert.equal(getWorkbookSelectionOverlay(visual), `${theme.versionBase}0d`);
  assert.equal(paint.previewStroke, `${theme.versionBase}96`);
  assert.equal(paint.cellStroke, null);
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
