import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookSplitRowCompareState } from '../src/utils/workbook/workbookCompare';
import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbook/workbookDisplay';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import {
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from '../src/utils/workbook/workbookSheetIndex';
import { buildWorkbookSheetPresentation } from '../src/utils/workbook/workbookMeta';
import {
  buildWorkbookCompareCellsMaps,
  buildWorkbookRowEntryMaps,
} from '../src/utils/workbook/workbookPanelHelpers';
import type { SplitRow } from '../src/types/view';
import type { WorkbookPrecomputedDeltaPayload, WorkbookRowDelta } from '../src/types/workbook';

function buildPrecomputedRowDelta(columnCount = 8): WorkbookRowDelta {
  const cellDeltas = new Map<number, WorkbookRowDelta['cellDeltas'] extends Map<number, infer T> ? T : never>();

  for (let column = 0; column < columnCount; column += 1) {
    cellDeltas.set(column, {
      column,
      baseCell: { value: `base-${column}`, formula: '' },
      mineCell: { value: column % 2 === 0 ? `base-${column}` : `mine-${column}`, formula: '' },
      changed: column % 2 === 1,
      masked: column % 2 === 0,
      strictOnly: false,
      kind: column % 2 === 1 ? 'modify' : 'equal',
      hasBaseContent: true,
      hasMineContent: true,
      hasContent: true,
    });
  }

  const deltas = [...cellDeltas.values()];
  return {
    cellDeltas,
    changedColumns: deltas.filter(delta => delta.changed).map(delta => delta.column),
    strictOnlyColumns: [],
    changedCount: deltas.filter(delta => delta.changed).length,
    hasChanges: deltas.some(delta => delta.changed),
    tone: 'mixed',
  };
}

test('buildWorkbookSplitRowCompareState reuses cached subset deltas for repeated visible-column requests', () => {
  const row: SplitRow = {
    left: null,
    right: null,
    lineIdx: 10,
    lineIdxs: [10],
    workbookRowDelta: buildPrecomputedRowDelta(),
  };
  const visibleColumns = [1, 3, 5, 7];

  const first = buildWorkbookSplitRowCompareState(row, visibleColumns, 'strict');
  const second = buildWorkbookSplitRowCompareState(row, visibleColumns, 'strict');

  assert.equal(first, second);
  assert.deepEqual(first.changedColumns, visibleColumns);
  assert.equal(first.changedCount, visibleColumns.length);
});

test('buildWorkbookSplitRowCompareState keeps different visible-column subsets isolated', () => {
  const row: SplitRow = {
    left: null,
    right: null,
    lineIdx: 11,
    lineIdxs: [11],
    workbookRowDelta: buildPrecomputedRowDelta(),
  };

  const oddColumns = buildWorkbookSplitRowCompareState(row, [1, 3, 5, 7], 'strict');
  const mixedColumns = buildWorkbookSplitRowCompareState(row, [0, 1, 2], 'strict');

  assert.notEqual(oddColumns, mixedColumns);
  assert.deepEqual(oddColumns.changedColumns, [1, 3, 5, 7]);
  assert.deepEqual(mixedColumns.changedColumns, [1]);
  assert.equal(mixedColumns.changedCount, 1);
});

test('buildWorkbookSectionRowIndex reuses cached result for identical inputs', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alice']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alicia']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, mine, 'strict');
  const sections = getWorkbookSections(diffLines, 'strict');

  const first = buildWorkbookSectionRowIndex(diffLines, sections, 'strict');
  const second = buildWorkbookSectionRowIndex(diffLines, sections, 'strict');

  assert.equal(first, second);
});

test('buildWorkbookSectionRowIndexFromPrecomputedDelta reuses cached result for identical inputs', () => {
  const diffLines = [
    {
      type: 'equal' as const,
      base: '@@sheet\tThing',
      mine: '@@sheet\tThing',
      baseLineNo: null,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    {
      type: 'equal' as const,
      base: '@@row\t1\tID\tName',
      mine: '@@row\t1\tID\tName',
      baseLineNo: 1,
      mineLineNo: 1,
      baseCharSpans: null,
      mineCharSpans: null,
    },
  ];

  const payload: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [
      {
        name: 'Thing',
        rows: [
          {
            lineIdx: 1,
            lineIdxs: [1],
            leftLineIdx: 1,
            rightLineIdx: 1,
            cellDeltas: [],
            changedColumns: [],
            strictOnlyColumns: [],
            changedCount: 0,
            hasChanges: false,
            tone: 'equal',
          },
        ],
      },
    ],
  };

  const first = buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, payload);
  const second = buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, payload);

  assert.equal(first, second);
});

test('buildWorkbookSheetPresentation reuses cached result for identical inputs', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alice']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alicia']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, mine, 'strict');
  const sections = getWorkbookSections(diffLines, 'strict');
  const rows = buildWorkbookSectionRowIndex(diffLines, sections, 'strict').get('Thing')?.rows ?? [];

  const first = buildWorkbookSheetPresentation(rows, 'Thing', null, null, 2, false, 'strict', []);
  const second = buildWorkbookSheetPresentation(rows, 'Thing', null, null, 2, false, 'strict', []);

  assert.equal(first, second);
});

test('buildWorkbookRowEntryMaps reuses cached result for identical inputs', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alice']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alicia']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, mine, 'strict');
  const sections = getWorkbookSections(diffLines, 'strict');
  const rows = buildWorkbookSectionRowIndex(diffLines, sections, 'strict').get('Thing')?.rows ?? [];
  const presentation = buildWorkbookSheetPresentation(rows, 'Thing', null, null, 2, false, 'strict', []);

  const first = buildWorkbookRowEntryMaps(rows, 'Thing', 'base', 'mine', presentation.visibleColumns);
  const second = buildWorkbookRowEntryMaps(rows, 'Thing', 'base', 'mine', presentation.visibleColumns);

  assert.equal(first, second);
});

test('buildWorkbookCompareCellsMaps reuses cached result for identical inputs', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alice']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['1001', 'Alicia']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, mine, 'strict');
  const sections = getWorkbookSections(diffLines, 'strict');
  const rows = buildWorkbookSectionRowIndex(diffLines, sections, 'strict').get('Thing')?.rows ?? [];
  const presentation = buildWorkbookSheetPresentation(rows, 'Thing', null, null, 2, false, 'strict', []);

  const first = buildWorkbookCompareCellsMaps(rows, presentation.visibleColumns, 'strict');
  const second = buildWorkbookCompareCellsMaps(rows, presentation.visibleColumns, 'strict');

  assert.equal(first, second);
});
