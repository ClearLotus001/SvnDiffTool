import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbook/workbookSheetIndex';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import {
  buildWorkbookVisibilityModel,
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
