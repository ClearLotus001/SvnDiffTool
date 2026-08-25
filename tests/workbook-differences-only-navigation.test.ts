import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { buildWorkbookSplitRowCompareState } from '../src/utils/workbook/workbookCompare';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbook/workbookSheetIndex';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import {
  buildWorkbookVisibilityModel,
  filterWorkbookRowsByVisibility,
  filterWorkbookSectionsByVisibility,
  isWorkbookSearchTargetVisible,
} from '../src/utils/workbook/workbookVisibilityModel';

const base = [
  '@@sheet\tStable',
  '@@row\t1\tID\tName',
  '@@row\t2\t1\tHidden needle',
  '@@sheet\tChanged',
  '@@row\t1\tID\tName\tStatus',
  '@@row\t2\t2\tSame\tkeep',
  '@@row\t3\t3\tBefore\told',
].join('\n');
const mine = [
  '@@sheet\tStable',
  '@@row\t1\tID\tName',
  '@@row\t2\t1\tHidden needle',
  '@@sheet\tChanged',
  '@@row\t1\tID\tName\tStatus',
  '@@row\t2\t2\tSame\tkeep',
  '@@row\t3\t3\tAfter\tnew',
].join('\n');

test('differences-only navigation includes only modified sheets rows and cells', () => {
  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const rowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const scope = buildWorkbookVisibilityModel({
    showOnlyDifferences: true,
    diffTypeFilter: 'all',
    sections,
    sectionRowIndex: rowIndex,
    modifiedSheetNames: new Set(['Changed']),
    compareMode: 'strict',
  });

  assert.equal(scope.visibleLineIndexesBySheet.has('Stable'), false);
  assert.deepEqual(
    filterWorkbookSectionsByVisibility(scope, sections).map((section) => section.name),
    ['Changed'],
  );
  assert.equal(scope.visibleLineIndexesBySheet.get('Changed')?.size, 2);
  assert.equal(isWorkbookSearchTargetVisible(scope, {
    sheetName: 'Changed', side: 'mine', rowNumber: 3, colIndex: 1,
  }), true);
  assert.equal(isWorkbookSearchTargetVisible(scope, {
    sheetName: 'Changed', side: 'mine', rowNumber: 2, colIndex: 1,
  }), false);
  assert.equal(isWorkbookSearchTargetVisible(scope, {
    sheetName: 'Stable', side: 'mine', rowNumber: 2, colIndex: 1,
  }), false);
});

test('full visibility policy keeps every sheet searchable and disables masking', () => {
  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const model = buildWorkbookVisibilityModel({
    showOnlyDifferences: false,
    diffTypeFilter: 'all',
    sections,
    sectionRowIndex: buildWorkbookSectionRowIndex(diffLines, sections),
    modifiedSheetNames: new Set(['Changed']),
    compareMode: 'strict',
  });

  assert.equal(model.policy.mode, 'full');
  assert.equal(model.policy.maskIrrelevantCells, false);
  assert.deepEqual([...model.visibleSheetNames], ['Stable', 'Changed']);
  assert.equal(isWorkbookSearchTargetVisible(model, null), true);
});

test('type filters compose with both states of the differences-only toggle', () => {
  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const sectionRowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const build = (showOnlyDifferences: boolean, diffTypeFilter: 'all' | 'add' | 'modify') => (
    buildWorkbookVisibilityModel({
      showOnlyDifferences,
      diffTypeFilter,
      sections,
      sectionRowIndex,
      modifiedSheetNames: new Set(['Changed']),
      compareMode: 'strict',
    })
  );

  assert.deepEqual([...build(false, 'all').visibleSheetNames], ['Stable', 'Changed']);
  assert.deepEqual([...build(true, 'all').visibleSheetNames], ['Changed']);
  assert.deepEqual([...build(false, 'modify').visibleSheetNames], ['Changed']);
  assert.deepEqual([...build(false, 'add').visibleSheetNames], []);
  assert.equal(build(false, 'add').policy.mode, 'differences-only');
  assert.equal(build(true, 'all'), build(true, 'all'));
  assert.equal(build(false, 'modify'), build(false, 'modify'));
});

test('type filters project only matching rows into workbook render surfaces', () => {
  const mixedBase = [
    '@@sheet\tMixed',
    '@@row\t1\tID\tValue',
    '@@row\t2\t1\tSame',
    '@@row\t3\t2\tBefore',
    '@@row\t4\t3\tDeleted',
    '@@row\t6\t5\tAnchor',
    '@@row\t9\t9\tEnd',
  ].join('\n');
  const mixedMine = [
    '@@sheet\tMixed',
    '@@row\t1\tID\tValue',
    '@@row\t2\t1\tSame',
    '@@row\t3\t2\tAfter',
    '@@row\t6\t5\tAnchor',
    '@@row\t8\t4\tAdded',
    '@@row\t9\t9\tEnd',
  ].join('\n');
  const diffLines = computeWorkbookDiff(mixedBase, mixedMine);
  const sections = getWorkbookSections(diffLines);
  const section = sections[0]!;
  const sectionRowIndex = buildWorkbookSectionRowIndex(diffLines, sections);
  const rows = sectionRowIndex.get(section.name)?.rows ?? [];
  const tonesFor = (diffTypeFilter: 'add' | 'modify' | 'delete') => {
    const model = buildWorkbookVisibilityModel({
      showOnlyDifferences: false,
      diffTypeFilter,
      sections,
      sectionRowIndex,
      modifiedSheetNames: new Set(['Mixed']),
      compareMode: 'strict',
    });
    const filteredRows = filterWorkbookRowsByVisibility(model, section, rows);
    assert.equal(filterWorkbookRowsByVisibility(model, section, rows), filteredRows);
    return filteredRows.map((row) => buildWorkbookSplitRowCompareState(row).tone);
  };

  assert.deepEqual(tonesFor('add'), ['equal', 'add']);
  assert.deepEqual(tonesFor('modify'), ['equal', 'mixed']);
  assert.deepEqual(tonesFor('delete'), ['equal', 'delete']);
});
