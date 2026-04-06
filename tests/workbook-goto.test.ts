import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine } from '../src/types';
import type { WorkbookLineSheetContext } from '../src/utils/workbook/workbookSections';
import {
  collectWorkbookGotoRowCandidates,
  getWorkbookSheetMaxRowNumber,
  resolveWorkbookGotoTarget,
} from '../src/utils/workbook/workbookGoto';

function createDiffLine(
  type: DiffLine['type'],
  baseLineNo: number | null,
  mineLineNo: number | null,
): DiffLine {
  return {
    type,
    base: '',
    mine: '',
    baseLineNo,
    mineLineNo,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('collectWorkbookGotoRowCandidates only keeps rows from the active sheet', () => {
  const diffLines = [
    createDiffLine('equal', 3, 3),
    createDiffLine('delete', 4, null),
    createDiffLine('add', null, 9),
  ];
  const lineSheetContexts: WorkbookLineSheetContext[] = [
    { baseSheetName: 'Thing', mineSheetName: 'Thing' },
    { baseSheetName: 'Thing', mineSheetName: null },
    { baseSheetName: null, mineSheetName: 'Other' },
  ];

  const candidates = collectWorkbookGotoRowCandidates(diffLines, lineSheetContexts, 'Thing');

  assert.deepEqual(candidates, [
    { lineIdx: 0, rowNumber: 3, side: 'base', sheetName: 'Thing' },
    { lineIdx: 0, rowNumber: 3, side: 'mine', sheetName: 'Thing' },
    { lineIdx: 1, rowNumber: 4, side: 'base', sheetName: 'Thing' },
  ]);
});

test('resolveWorkbookGotoTarget prefers the preferred side for exact workbook rows', () => {
  const diffLines = [createDiffLine('equal', 12, 12)];
  const lineSheetContexts: WorkbookLineSheetContext[] = [
    { baseSheetName: 'Thing', mineSheetName: 'Thing' },
  ];

  const resolved = resolveWorkbookGotoTarget({
    lineNo: 12,
    diffLines,
    lineSheetContexts,
    sheetName: 'Thing',
    preferredSide: 'mine',
    preferredColumn: 2,
    preferredColumnLabel: 'C',
    baseVersionLabel: 'BASE',
    mineVersionLabel: 'MINE',
  });

  assert.equal(resolved?.lineIdx, 0);
  assert.deepEqual(resolved?.selection, {
    kind: 'row',
    sheetName: 'Thing',
    side: 'mine',
    versionLabel: 'MINE',
    rowNumber: 12,
    colIndex: 2,
    colLabel: 'C',
    address: '12',
    value: '',
    formula: '',
  });
});

test('resolveWorkbookGotoTarget keeps base-side row selection for deleted rows', () => {
  const diffLines = [createDiffLine('delete', 7, null)];
  const lineSheetContexts: WorkbookLineSheetContext[] = [
    { baseSheetName: 'Thing', mineSheetName: null },
  ];

  const resolved = resolveWorkbookGotoTarget({
    lineNo: 7,
    diffLines,
    lineSheetContexts,
    sheetName: 'Thing',
    preferredSide: 'mine',
    baseVersionLabel: 'BASE',
    mineVersionLabel: 'MINE',
  });

  assert.equal(resolved?.selection.side, 'base');
  assert.equal(resolved?.selection.versionLabel, 'BASE');
  assert.equal(resolved?.selection.rowNumber, 7);
});

test('resolveWorkbookGotoTarget falls back to the nearest row in the active sheet and clamps past the end', () => {
  const diffLines = [
    createDiffLine('equal', 3, 3),
    createDiffLine('equal', 8, 8),
  ];
  const lineSheetContexts: WorkbookLineSheetContext[] = [
    { baseSheetName: 'Thing', mineSheetName: 'Thing' },
    { baseSheetName: 'Thing', mineSheetName: 'Thing' },
  ];

  const nearest = resolveWorkbookGotoTarget({
    lineNo: 5,
    diffLines,
    lineSheetContexts,
    sheetName: 'Thing',
    preferredSide: 'mine',
    baseVersionLabel: 'BASE',
    mineVersionLabel: 'MINE',
  });
  const clamped = resolveWorkbookGotoTarget({
    lineNo: 99,
    diffLines,
    lineSheetContexts,
    sheetName: 'Thing',
    preferredSide: 'mine',
    baseVersionLabel: 'BASE',
    mineVersionLabel: 'MINE',
  });

  assert.equal(nearest?.selection.rowNumber, 8);
  assert.equal(clamped?.selection.rowNumber, 8);
});

test('getWorkbookSheetMaxRowNumber returns the maximum row number for the active sheet only', () => {
  const diffLines = [
    createDiffLine('equal', 10, 10),
    createDiffLine('add', null, 15),
    createDiffLine('equal', 88, 88),
  ];
  const lineSheetContexts: WorkbookLineSheetContext[] = [
    { baseSheetName: 'Thing', mineSheetName: 'Thing' },
    { baseSheetName: null, mineSheetName: 'Thing' },
    { baseSheetName: 'Other', mineSheetName: 'Other' },
  ];

  assert.equal(getWorkbookSheetMaxRowNumber(diffLines, lineSheetContexts, 'Thing'), 15);
  assert.equal(getWorkbookSheetMaxRowNumber(diffLines, lineSheetContexts, 'Other'), 88);
});
