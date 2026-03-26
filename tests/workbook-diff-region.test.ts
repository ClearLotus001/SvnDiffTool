import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkbookDiff } from '../src/engine/workbookDiff';
import {
  buildWorkbookDiffRegions,
  findWorkbookDiffRegionIndexForSelection,
  formatWorkbookDiffRegionLabel,
} from '../src/utils/workbookDiffRegion';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbookDisplay';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';
import { getWorkbookSections } from '../src/utils/workbookSections';

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
