import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookSheetPresentation, type WorkbookMetadataMap } from '../src/utils/workbookMeta';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbookDisplay';
import { computeWorkbookDiff } from '../src/engine/workbookDiff';
import { getWorkbookSections } from '../src/utils/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';

test('buildWorkbookSheetPresentation can include hidden columns when requested', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['ID', '', 'Name']),
    createWorkbookRowLine(2, ['10001', '', 'A']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, base);
  const sections = getWorkbookSections(diffLines);
  const rows = buildWorkbookSectionRowIndex(diffLines, sections).get('Thing')?.rows ?? [];

  const metadata: WorkbookMetadataMap = {
    sheets: {
      Thing: {
        name: 'Thing',
        hiddenColumns: [1],
        mergeRanges: [],
      },
    },
  };

  const hiddenOff = buildWorkbookSheetPresentation(rows, 'Thing', metadata, metadata, 3, false);
  const hiddenOn = buildWorkbookSheetPresentation(rows, 'Thing', metadata, metadata, 3, true);

  assert.deepEqual(hiddenOff.visibleColumns, [0, 2]);
  assert.deepEqual(hiddenOn.visibleColumns, [0, 1, 2]);
});
