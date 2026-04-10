import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useSplitPanelWorkbookNavigationRows } from '../src/hooks/diff/useSplitPanelWorkbookNavigationRows';
import { useWorkbookCompareNavigationRows } from '../src/hooks/workbook/useWorkbookCompareNavigationRows';
import { useWorkbookHorizontalNavigationRows } from '../src/hooks/workbook/useWorkbookHorizontalNavigationRows';
import { projectWorkbookNavigationRowsFromEntryMapParts } from '../src/utils/workbook/workbookPanelHelpers';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

test('useWorkbookHorizontalNavigationRows skips body row materialization when selection is absent', () => {
  const throwingItems = {
    flatMap: () => {
      throw new Error('items.flatMap should not be called without an active selection');
    },
  } as unknown as Parameters<typeof useWorkbookHorizontalNavigationRows>[0]['items'];

  let resolvedLength = -1;
  function Probe() {
    resolvedLength = useWorkbookHorizontalNavigationRows({
      activeSheetName: 'Sheet1',
      selectedCell: null,
      frozenRows: [],
      items: throwingItems,
      baseVersion: 'BASE',
      mineVersion: 'MINE',
      visibleColumns: [],
    }).length;
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(resolvedLength, 0);
});

test('useWorkbookCompareNavigationRows skips body row materialization when active sheet is absent', () => {
  const throwingItems = {
    flatMap: () => {
      throw new Error('items.flatMap should not be called without an active sheet');
    },
  } as unknown as Parameters<typeof useWorkbookCompareNavigationRows>[0]['items'];

  let resolvedLength = -1;
  function Probe() {
    resolvedLength = useWorkbookCompareNavigationRows({
      activeSheetName: null,
      selectedCell: {
        kind: 'row',
        sheetName: 'Sheet1',
        side: 'base',
        versionLabel: 'BASE',
        rowNumber: 1,
        colIndex: -1,
        colLabel: '',
        address: '',
        value: '',
        formula: '',
      },
      frozenRows: [],
      items: throwingItems,
      baseVersion: 'BASE',
      mineVersion: 'MINE',
      visibleColumns: [],
    }).length;
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(resolvedLength, 0);
});

test('projectWorkbookNavigationRowsFromEntryMapParts reuses prebuilt row entry objects in visible order', () => {
  const frozenRow = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['Frozen Base']),
      mine: createWorkbookRowLine(2, ['Frozen Mine']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['Frozen Base']),
      mine: createWorkbookRowLine(2, ['Frozen Mine']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 10,
    lineIdxs: [10],
  };
  const bodyRow = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['Body Base']),
      mine: createWorkbookRowLine(3, ['Body Mine']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['Body Base']),
      mine: createWorkbookRowLine(3, ['Body Mine']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 11,
    lineIdxs: [11],
  };

  const frozenBaseEntry = {
    sheetName: 'Sheet1',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 2,
    cells: [{ value: 'Frozen Base', formula: '' }],
    visibleColumns: [],
    lineIdxs: [10],
  };
  const frozenMineEntry = {
    sheetName: 'Sheet1',
    side: 'mine' as const,
    versionLabel: 'MINE',
    rowNumber: 2,
    cells: [{ value: 'Frozen Mine', formula: '' }],
    visibleColumns: [],
    lineIdxs: [10],
  };
  const bodyBaseEntry = {
    sheetName: 'Sheet1',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 3,
    cells: [{ value: 'Body Base', formula: '' }],
    visibleColumns: [],
    lineIdxs: [11],
  };
  const bodyMineEntry = {
    sheetName: 'Sheet1',
    side: 'mine' as const,
    versionLabel: 'MINE',
    rowNumber: 3,
    cells: [{ value: 'Body Mine', formula: '' }],
    visibleColumns: [],
    lineIdxs: [11],
  };

  const projected = projectWorkbookNavigationRowsFromEntryMapParts(
    [[frozenRow], [bodyRow]],
    {
      base: new Map([
        [2, frozenBaseEntry],
        [3, bodyBaseEntry],
      ]),
      mine: new Map([
        [2, frozenMineEntry],
        [3, bodyMineEntry],
      ]),
    },
  );

  assert.deepEqual(projected, [
    frozenBaseEntry,
    frozenMineEntry,
    bodyBaseEntry,
    bodyMineEntry,
  ]);
  assert.equal(projected[0], frozenBaseEntry);
  assert.equal(projected[3], bodyMineEntry);
});

test('useSplitPanelWorkbookNavigationRows can reuse prebuilt row entry maps for frozen and body rows', () => {
  const frozenRow = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['Frozen Base']),
      mine: createWorkbookRowLine(2, ['Frozen Mine']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(2, ['Frozen Base']),
      mine: createWorkbookRowLine(2, ['Frozen Mine']),
      baseLineNo: 2,
      mineLineNo: 2,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 10,
    lineIdxs: [10],
  };
  const bodyRow = {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['Body Base']),
      mine: createWorkbookRowLine(3, ['Body Mine']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(3, ['Body Base']),
      mine: createWorkbookRowLine(3, ['Body Mine']),
      baseLineNo: 3,
      mineLineNo: 3,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx: 11,
    lineIdxs: [11],
  };

  const frozenBaseEntry = {
    sheetName: 'Sheet1',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 2,
    cells: [{ value: 'Frozen Base', formula: '' }],
    visibleColumns: [],
    lineIdxs: [10],
  };
  const frozenMineEntry = {
    sheetName: 'Sheet1',
    side: 'mine' as const,
    versionLabel: 'MINE',
    rowNumber: 2,
    cells: [{ value: 'Frozen Mine', formula: '' }],
    visibleColumns: [],
    lineIdxs: [10],
  };
  const bodyBaseEntry = {
    sheetName: 'Sheet1',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 3,
    cells: [{ value: 'Body Base', formula: '' }],
    visibleColumns: [],
    lineIdxs: [11],
  };
  const bodyMineEntry = {
    sheetName: 'Sheet1',
    side: 'mine' as const,
    versionLabel: 'MINE',
    rowNumber: 3,
    cells: [{ value: 'Body Mine', formula: '' }],
    visibleColumns: [],
    lineIdxs: [11],
  };

  const items = [
    { kind: 'split-line' as const, row: bodyRow },
  ];

  let resolved: ReturnType<typeof useSplitPanelWorkbookNavigationRows> | null = null;
  function Probe() {
    resolved = useSplitPanelWorkbookNavigationRows({
      activeSheetName: 'Sheet1',
      selectedCell: {
        kind: 'row',
        sheetName: 'Sheet1',
        side: 'base',
        versionLabel: 'BASE',
        rowNumber: 2,
        colIndex: -1,
        colLabel: '',
        address: '',
        value: '',
        formula: '',
      },
      frozenRow,
      items,
      baseVersion: 'BASE',
      mineVersion: 'MINE',
      rowEntryByRowNumber: {
        base: new Map([
          [2, frozenBaseEntry],
          [3, bodyBaseEntry],
        ]),
        mine: new Map([
          [2, frozenMineEntry],
          [3, bodyMineEntry],
        ]),
      },
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  if (!resolved) throw new Error('expected resolved split navigation rows');
  assert.deepEqual(resolved, [
    frozenBaseEntry,
    frozenMineEntry,
    bodyBaseEntry,
    bodyMineEntry,
  ]);
  assert.equal(resolved[0], frozenBaseEntry);
  assert.equal(resolved[3], bodyMineEntry);
});
