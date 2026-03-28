import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { computeHunks } from '../src/engine/text/diff';
import {
  buildWorkbookDiffRegions,
  buildWorkbookNavigationRegions,
  findWorkbookDiffRegionIndexForSelection,
  formatWorkbookDiffRegionLabel,
} from '../src/utils/workbook/workbookDiffRegion';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbook/workbookDisplay';
import {
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from '../src/utils/workbook/workbookSheetIndex';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import type { WorkbookPrecomputedDeltaPayload } from '../src/types';

function buildWorkbook(rows: Array<Array<string>>, sheetName = 'Thing') {
  return [
    createWorkbookSheetLine(sheetName),
    ...rows.map((cells, index) => createWorkbookRowLine(index + 1, cells)),
  ].join('\n');
}

test('buildWorkbookDiffRegions splits disjoint workbook change islands into separate regions', () => {
  const base = buildWorkbook([
    ['ID', 'Name', 'Type', 'Slot', 'Buff', 'Tag', 'Desc'],
    ['10001', 'Sword', 'Weapon', 'L', 'A', 'Alpha', 'Keep'],
    ['10002', 'Potion', 'Consumable', 'L', 'B', 'Beta', 'Keep'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name', 'Type', 'Slot', 'Buff', 'Tag', 'Desc'],
    ['10001', 'Long Sword', 'Rare Weapon', 'L', 'A', 'Alpha+', 'Keep+'],
    ['10002', 'Hi-Potion', 'Epic Consumable', 'L', 'B', 'Beta', 'Keep'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const regions = buildWorkbookDiffRegions(
    sections,
    rowIndex,
    'BASE',
    'MINE',
  );

  assert.equal(regions.length, 2);
  assert.equal(regions[0]?.sheetName, 'Thing');
  assert.equal(regions[0]?.startCol, 1);
  assert.equal(regions[0]?.endCol, 2);
  assert.equal(regions[0]?.rowNumberStart, 2);
  assert.equal(regions[0]?.rowNumberEnd, 3);
  assert.equal(regions[1]?.startCol, 5);
  assert.equal(regions[1]?.endCol, 6);
  assert.equal(regions[1]?.rowNumberStart, 2);
  assert.equal(regions[1]?.rowNumberEnd, 2);
});

test('workbook diff regions expose region-level labels and selection lookup', () => {
  const base = buildWorkbook([
    ['ID', 'Name', 'Type'],
    ['10001', 'Sword', 'Weapon'],
    ['10002', 'Potion', 'Consumable'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name', 'Type'],
    ['10001', 'Sword', 'Weapon'],
    ['10002', 'Hi-Potion', 'Consumable'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const regions = buildWorkbookDiffRegions(
    sections,
    rowIndex,
    'BASE',
    'MINE',
  );
  const activeRegion = regions[0];

  assert.ok(activeRegion);
  assert.equal(formatWorkbookDiffRegionLabel(activeRegion), 'Thing!B3');
  assert.equal(
    findWorkbookDiffRegionIndexForSelection(regions, activeRegion?.anchorSelection ?? null),
    0,
  );
});

test('buildWorkbookDiffRegions merges diagonal workbook cells into one normalized region', () => {
  const base = buildWorkbook([
    ['ID', 'Name', 'Type'],
    ['10001', 'Sword', 'Weapon'],
    ['10002', 'Potion', 'Consumable'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name', 'Type'],
    ['10001', 'Long Sword', 'Weapon'],
    ['10002', 'Potion', 'Epic Consumable'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const regions = buildWorkbookDiffRegions(
    sections,
    rowIndex,
    'BASE',
    'MINE',
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.startCol, 1);
  assert.equal(regions[0]?.endCol, 2);
  assert.equal(regions[0]?.rowNumberStart, 2);
  assert.equal(regions[0]?.rowNumberEnd, 3);
});

test('buildWorkbookNavigationRegions groups disjoint cell islands within the same workbook hunk', () => {
  const base = buildWorkbook([
    ['ID', 'Name', 'Type', 'Slot', 'Buff', 'Tag', 'Desc'],
    ['10001', 'Sword', 'Weapon', 'L', 'A', 'Alpha', 'Keep'],
    ['10002', 'Potion', 'Consumable', 'L', 'B', 'Beta', 'Keep'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name', 'Type', 'Slot', 'Buff', 'Tag', 'Desc'],
    ['10001', 'Long Sword', 'Rare Weapon', 'L', 'A', 'Alpha+', 'Keep+'],
    ['10002', 'Hi-Potion', 'Epic Consumable', 'L', 'B', 'Beta', 'Keep'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const hunks = computeHunks(diffLines);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const cellRegions = buildWorkbookDiffRegions(
    sections,
    rowIndex,
    'BASE',
    'MINE',
  );
  const navigationRegions = buildWorkbookNavigationRegions(cellRegions, hunks);

  assert.equal(cellRegions.length, 2);
  assert.equal(navigationRegions.length, 1);
  assert.equal(navigationRegions[0]?.sheetName, 'Thing');
  assert.equal(navigationRegions[0]?.startCol, 1);
  assert.equal(navigationRegions[0]?.endCol, 6);
  assert.equal(navigationRegions[0]?.rowNumberStart, 2);
  assert.equal(navigationRegions[0]?.rowNumberEnd, 3);
  assert.equal(
    navigationRegions[0]?.patches.length,
    cellRegions.reduce((count, region) => count + region.patches.length, 0),
  );
  assert.equal(
    findWorkbookDiffRegionIndexForSelection(
      navigationRegions,
      cellRegions[1]?.anchorSelection ?? null,
    ),
    0,
  );
});

test('buildWorkbookDiffRegions honors precomputed merge-aware deltas in content mode', () => {
  const diffLines = [
    {
      type: 'equal' as const,
      base: createWorkbookSheetLine('Thing'),
      mine: createWorkbookSheetLine('Thing'),
      baseLineNo: null,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    {
      type: 'equal' as const,
      base: createWorkbookRowLine(1, ['Group']),
      mine: createWorkbookRowLine(1, ['Group']),
      baseLineNo: 1,
      mineLineNo: 1,
      baseCharSpans: null,
      mineCharSpans: null,
    },
  ];
  const payload: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'content',
    sections: [
      {
        name: 'Thing',
        rows: [
          {
            lineIdx: 1,
            lineIdxs: [1],
            leftLineIdx: 1,
            rightLineIdx: 1,
            cellDeltas: [
              {
                column: 0,
                baseCell: { value: 'Group', formula: '' },
                mineCell: { value: 'Group', formula: '' },
                changed: true,
                masked: false,
                strictOnly: false,
                kind: 'modify',
                hasBaseContent: true,
                hasMineContent: true,
                hasContent: true,
              },
            ],
            changedColumns: [0],
            strictOnlyColumns: [],
            changedCount: 1,
            hasChanges: true,
            tone: 'mixed',
          },
        ],
      },
    ],
  };

  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, payload);
  const regions = buildWorkbookDiffRegions(
    sections,
    rowIndex,
    'BASE',
    'MINE',
    'content',
    {
      sheets: {
        Thing: {
          name: 'Thing',
          hiddenColumns: [],
          mergeRanges: [{ startRow: 1, endRow: 2, startCol: 0, endCol: 1 }],
        },
      },
    },
    {
      sheets: {
        Thing: {
          name: 'Thing',
          hiddenColumns: [],
          mergeRanges: [{ startRow: 1, endRow: 2, startCol: 0, endCol: 2 }],
        },
      },
    },
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.startCol, 0);
  assert.equal(regions[0]?.endCol, 2);
  assert.equal(regions[0]?.rowNumberStart, 1);
  assert.equal(regions[0]?.rowNumberEnd, 2);
});
