import test from 'node:test';
import assert from 'node:assert/strict';

import { computeHunks } from '../src/engine/diff';
import { computeSmartDiff } from '../src/engine/smartDiff';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbookDisplay';
import { findWorkbookHunkTargetCell } from '../src/utils/workbookHunkTarget';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';
import { getWorkbookSections } from '../src/utils/workbookSections';

function buildWorkbook(rows: Array<Array<string>>, sheetName = 'Thing') {
  return [
    createWorkbookSheetLine(sheetName),
    ...rows.map((cells, index) => createWorkbookRowLine(index + 1, cells)),
  ].join('\n');
}

test('findWorkbookHunkTargetCell points to the changed workbook cell', () => {
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

  const diffLines = computeSmartDiff(base, mine);
  const hunks = computeHunks(diffLines);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);

  const targetCell = findWorkbookHunkTargetCell(
    hunks[0]!,
    sections,
    rowIndex,
    'BASE',
    'MINE',
  );

  assert.ok(targetCell);
  assert.equal(targetCell.sheetName, 'Thing');
  assert.equal(targetCell.side, 'mine');
  assert.equal(targetCell.rowNumber, 3);
  assert.equal(targetCell.colIndex, 1);
  assert.equal(targetCell.address, 'B3');
});
