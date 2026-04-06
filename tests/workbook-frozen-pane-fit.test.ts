import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbook/workbookDisplay';
import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbook/workbookSheetIndex';
import { getWorkbookStackedRenderMode } from '../src/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedVisualGroups,
} from '../src/utils/workbook/workbookStackedMergeGroups';

test('single frozen header row still produces a stacked visual group in fit mode', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['10001', 'Alice']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', 'Name']),
    createWorkbookRowLine(2, ['10001', 'Alice']),
  ].join('\n');

  const diffLines = computeWorkbookDiff(base, mine, 'strict');
  const sections = getWorkbookSections(diffLines, 'strict');
  const sectionRows = buildWorkbookSectionRowIndex(diffLines, sections, 'strict').get('Thing')?.rows ?? [];
  const headerRow = sectionRows.find((row) => row.lineIdxs.includes(1));

  assert.ok(headerRow);

  const layoutRows = buildWorkbookStackedLayoutRows({
    rows: [{
      row: headerRow,
      renderMode: getWorkbookStackedRenderMode(headerRow),
      height: 24,
    }],
  });
  const groups = buildWorkbookStackedVisualGroups({
    rows: layoutRows,
    baseMergeRanges: [],
    mineMergeRanges: [],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.rows.length, 1);
  assert.equal(groups[0]?.baseTrack[0]?.rowNumber, 1);
});
