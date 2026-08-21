import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine } from '../src/types';
import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
  getWorkbookSearchableContentStart,
} from '../src/utils/workbook/workbookDisplay';
import type { WorkbookLineSheetContext } from '../src/utils/workbook/workbookSections';
import {
  buildWorkbookRowEntry,
  buildWorkbookSearchSelectionFromTarget,
  resolveWorkbookSearchMatchColumnIndex,
  resolveWorkbookSearchMatchTarget,
  resolveWorkbookSearchSide,
} from '../src/utils/workbook/workbookNavigation';

function createDiffLine(
  type: DiffLine['type'],
  base: string | null,
  mine: string | null,
): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo: null,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('workbook search resolves mine-side cell coordinates for equal rows', () => {
  const rowLine = createWorkbookRowLine(12, [
    'Alpha',
    { value: 'Budget Report', formula: 'SUM(A1:A3)' },
    'Gamma',
  ]);
  const line = createDiffLine('equal', rowLine, rowLine);
  const matchStart = rowLine.indexOf('Budget');

  assert.equal(resolveWorkbookSearchSide(line), 'mine');
  assert.equal(
    resolveWorkbookSearchMatchColumnIndex(line, {
      start: matchStart,
      end: matchStart + 'Budget'.length,
    }),
    1,
  );

  const context: WorkbookLineSheetContext = {
    baseSheetName: 'Sheet1',
    mineSheetName: 'Sheet1',
  };
  const target = resolveWorkbookSearchMatchTarget(
    line,
    {
      start: rowLine.indexOf('SUM('),
      end: rowLine.indexOf('SUM(') + 3,
    },
    context,
  );
  const rowEntry = buildWorkbookRowEntry(
    {
      left: line,
      right: line,
      lineIdx: 4,
      lineIdxs: [4],
    },
    'mine',
    'Sheet1',
    'Mine',
    [0, 1, 2],
  );
  const selection = buildWorkbookSearchSelectionFromTarget(
    target,
    {
      base: new Map(),
      mine: new Map(rowEntry ? [[rowEntry.rowNumber, rowEntry]] : []),
    },
  );

  assert.deepEqual(target, {
    sheetName: 'Sheet1',
    side: 'mine',
    rowNumber: 12,
    colIndex: 1,
  });
  assert.ok(selection);
  assert.equal(selection?.side, 'mine');
  assert.equal(selection?.colIndex, 1);
  assert.equal(selection?.address, 'B12');
});

test('workbook search resolves base-side cell coordinates for delete rows', () => {
  const rowLine = createWorkbookRowLine(7, ['Removed', 'Legacy Value']);
  const line = createDiffLine('delete', rowLine, null);
  const matchStart = rowLine.indexOf('Legacy');

  assert.equal(resolveWorkbookSearchSide(line), 'base');
  assert.equal(
    resolveWorkbookSearchMatchColumnIndex(line, {
      start: matchStart,
      end: matchStart + 'Legacy'.length,
    }),
    1,
  );

  const target = resolveWorkbookSearchMatchTarget(
    line,
    {
      start: matchStart,
      end: matchStart + 'Legacy'.length,
    },
    {
      baseSheetName: 'DeletedSheet',
      mineSheetName: null,
    },
  );
  const rowEntry = buildWorkbookRowEntry(
    {
      left: line,
      right: null,
      lineIdx: 8,
      lineIdxs: [8],
    },
    'base',
    'DeletedSheet',
    'Base',
    [0, 1],
  );
  const selection = buildWorkbookSearchSelectionFromTarget(
    target,
    {
      base: new Map(rowEntry ? [[rowEntry.rowNumber, rowEntry]] : []),
      mine: new Map(),
    },
  );

  assert.deepEqual(target, {
    sheetName: 'DeletedSheet',
    side: 'base',
    rowNumber: 7,
    colIndex: 1,
  });
  assert.ok(selection);
  assert.equal(selection?.side, 'base');
  assert.equal(selection?.colIndex, 1);
  assert.equal(selection?.address, 'B7');
});

test('workbook search does not force a cell focus for non-cell prefixes', () => {
  const rowLine = createWorkbookRowLine(5, ['Hello']);
  const line = createDiffLine('equal', rowLine, rowLine);

  assert.equal(
    resolveWorkbookSearchMatchColumnIndex(line, {
      start: rowLine.indexOf('@@row'),
      end: rowLine.indexOf('@@row') + '@@row'.length,
    }),
    null,
  );
});

test('workbook search starts after row metadata and excludes sheet protocol lines', () => {
  const rowLine = createWorkbookRowLine(25, ['Alpha', 'World']);
  const sheetLine = createWorkbookSheetLine('World Data');

  assert.equal(
    getWorkbookSearchableContentStart(rowLine),
    rowLine.indexOf('Alpha'),
  );
  assert.equal(
    getWorkbookSearchableContentStart(sheetLine),
    sheetLine.length,
  );
  assert.equal(getWorkbookSearchableContentStart('plain text'), 0);
});

test('workbook search can preserve hidden target columns instead of clamping to visible columns', () => {
  const rowLine = createWorkbookRowLine(9, ['A', 'Hidden B', 'Visible C']);
  const line = createDiffLine('equal', rowLine, rowLine);
  const target = resolveWorkbookSearchMatchTarget(
    line,
    {
      start: rowLine.indexOf('Hidden'),
      end: rowLine.indexOf('Hidden') + 'Hidden'.length,
    },
    {
      baseSheetName: 'SheetHidden',
      mineSheetName: 'SheetHidden',
    },
  );
  const rowEntry = buildWorkbookRowEntry(
    {
      left: line,
      right: line,
      lineIdx: 2,
      lineIdxs: [2],
    },
    'mine',
    'SheetHidden',
    'Mine',
    [0, 2],
  );
  const selection = buildWorkbookSearchSelectionFromTarget(
    target,
    {
      base: new Map(),
      mine: new Map(rowEntry ? [[rowEntry.rowNumber, rowEntry]] : []),
    },
  );

  assert.equal(target?.colIndex, 1);
  assert.equal(selection?.kind, 'cell');
  assert.equal(selection?.colIndex, 1);
  assert.equal(selection?.address, 'B9');
});

test('workbook search can fall back to row selection when the match is on row metadata', () => {
  const rowLine = createWorkbookRowLine(25, ['Alpha']);
  const line = createDiffLine('equal', rowLine, rowLine);
  const rowNumberStart = rowLine.indexOf('\t25\t') + 1;
  const target = resolveWorkbookSearchMatchTarget(
    line,
    {
      start: rowNumberStart,
      end: rowNumberStart + 2,
    },
    {
      baseSheetName: 'SheetRow',
      mineSheetName: 'SheetRow',
    },
  );
  const rowEntry = buildWorkbookRowEntry(
    {
      left: line,
      right: line,
      lineIdx: 6,
      lineIdxs: [6],
    },
    'mine',
    'SheetRow',
    'Mine',
    [0],
  );
  const selection = buildWorkbookSearchSelectionFromTarget(
    target,
    {
      base: new Map(),
      mine: new Map(rowEntry ? [[rowEntry.rowNumber, rowEntry]] : []),
    },
  );

  assert.deepEqual(target, {
    sheetName: 'SheetRow',
    side: 'mine',
    rowNumber: 25,
    colIndex: null,
  });
  assert.equal(selection?.kind, 'row');
  assert.equal(selection?.rowNumber, 25);
  assert.equal(selection?.address, '25');
});
