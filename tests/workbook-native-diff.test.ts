import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkbookDiff } from '../src/engine/workbookDiff';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbookDisplay';
import { getWorkbookSections } from '../src/utils/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';
import { buildWorkbookCompareCells, parseWorkbookRowLine } from '../src/utils/workbookCompare';

function buildWorkbook(rows: Array<Array<string>>, sheetName = 'Thing') {
  return [
    createWorkbookSheetLine(sheetName),
    ...rows.map((cells, index) => createWorkbookRowLine(index + 1, cells)),
  ].join('\n');
}

function getSectionRows(diffLines: ReturnType<typeof computeWorkbookDiff>, sheetName = 'Thing') {
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  return rowIndex.get(sheetName)?.rows ?? [];
}

test('workbook-native diff keeps rows aligned after insertion', () => {
  const base = buildWorkbook([
    ['ID', 'Name'],
    ['10001', 'A'],
    ['10002', 'B'],
    ['10003', 'C'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name'],
    ['10001', 'A'],
    ['10009', 'X'],
    ['10002', 'B'],
    ['10003', 'C'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines).filter(section => section.name === 'Thing');
  const rows = getSectionRows(diffLines);
  const preview = rows.map((row) => ({
    leftRow: parseWorkbookRowLine(row.left)?.rowNumber ?? null,
    rightRow: parseWorkbookRowLine(row.right)?.rowNumber ?? null,
    leftA: parseWorkbookRowLine(row.left)?.cells[0]?.value ?? null,
    rightA: parseWorkbookRowLine(row.right)?.cells[0]?.value ?? null,
  }));

  assert.equal(sections.length, 1);
  assert.deepEqual(preview, [
    { leftRow: 1, rightRow: 1, leftA: 'ID', rightA: 'ID' },
    { leftRow: 2, rightRow: 2, leftA: '10001', rightA: '10001' },
    { leftRow: null, rightRow: 3, leftA: null, rightA: '10009' },
    { leftRow: 3, rightRow: 4, leftA: '10002', rightA: '10002' },
    { leftRow: 4, rightRow: 5, leftA: '10003', rightA: '10003' },
  ]);
});

test('workbook-native diff pairs changed rows at the same logical position', () => {
  const base = buildWorkbook([
    ['ID', 'Name'],
    ['10001', 'A'],
    ['10002', 'B'],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Name'],
    ['10001', 'A'],
    ['10002', 'X'],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  const rows = getSectionRows(diffLines);
  const changedRow = rows.find((row) => {
    const left = parseWorkbookRowLine(row.left);
    const right = parseWorkbookRowLine(row.right);
    return left?.rowNumber === 3 && right?.rowNumber === 3;
  });

  assert.ok(changedRow);
  const compareCells = buildWorkbookCompareCells(changedRow.left, changedRow.right);
  assert.equal(compareCells.get(0)?.changed, false);
  assert.equal(compareCells.get(1)?.changed, true);
});

test('workbook-native diff keeps whitespace-only cell changes visible to compare cells', () => {
  const base = buildWorkbook([
    ['ID', 'Flag'],
    ['10001', ' '],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Flag'],
    ['10001', ''],
  ]);

  const diffLines = computeWorkbookDiff(base, mine);
  assert.equal(diffLines.some((line) => line.type === 'delete' && line.baseLineNo === 2), true);
  assert.equal(diffLines.some((line) => line.type === 'add' && line.mineLineNo === 2), true);

  const rows = getSectionRows(diffLines);
  const changedRow = rows.find((row) => {
    const left = parseWorkbookRowLine(row.left);
    const right = parseWorkbookRowLine(row.right);
    return left?.rowNumber === 2 && right?.rowNumber === 2;
  });

  assert.ok(changedRow);
  const compareCells = buildWorkbookCompareCells(changedRow.left, changedRow.right);
  assert.equal(compareCells.get(1)?.changed, true);
  assert.equal(compareCells.get(1)?.baseCell.value, ' ');
  assert.equal(compareCells.get(1)?.mineCell.value, '');
});

test('workbook content mode ignores whitespace-only cell diffs consistently', () => {
  const base = buildWorkbook([
    ['ID', 'Flag'],
    ['10001', ' '],
  ]);
  const mine = buildWorkbook([
    ['ID', 'Flag'],
    ['10001', ''],
  ]);

  const diffLines = computeWorkbookDiff(base, mine, 'content');
  assert.equal(diffLines.every((line) => line.type === 'equal'), true);

  const rows = getSectionRows(diffLines);
  const targetRow = rows.find((row) => {
    const left = parseWorkbookRowLine(row.left);
    const right = parseWorkbookRowLine(row.right);
    return left?.rowNumber === 2 && right?.rowNumber === 2;
  });

  assert.ok(targetRow);
  const compareCells = buildWorkbookCompareCells(targetRow.left, targetRow.right, undefined, 'content');
  assert.equal([...compareCells.values()].filter((cell) => cell.changed).length, 0);
});

test('workbook-native diff does not degrade large workbooks into duplicated sheet sections', () => {
  const rowCount = 60010;
  const baseRows = Array.from({ length: rowCount }, (_, index) => [`ID-${index + 1}`, `Name-${index + 1}`]);
  const mineRows = [
    ['ID-NEW', 'Name-NEW'],
    ...baseRows,
  ];

  const diffLines = computeWorkbookDiff(buildWorkbook(baseRows), buildWorkbook(mineRows));
  const sections = getWorkbookSections(diffLines).filter(section => section.name === 'Thing');
  const rows = getSectionRows(diffLines);
  const insertedRow = rows.find((row) => (
    parseWorkbookRowLine(row.left)?.rowNumber == null
    && parseWorkbookRowLine(row.right)?.rowNumber === 1
  ));
  const shiftedRow = rows.find((row) => (
    parseWorkbookRowLine(row.left)?.rowNumber === 1
    && parseWorkbookRowLine(row.right)?.rowNumber === 2
  ));
  const equalCount = diffLines.filter((line) => line.type === 'equal').length;

  assert.equal(sections.length, 1);
  assert.ok(insertedRow);
  assert.ok(shiftedRow);
  assert.ok(equalCount > rowCount);
});
