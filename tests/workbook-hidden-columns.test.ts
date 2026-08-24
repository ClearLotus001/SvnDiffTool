import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbookSheetPresentation, type WorkbookMetadataMap } from '../src/utils/workbook/workbookMeta';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbook/workbookDisplay';
import { computeWorkbookDiff } from '../src/engine/workbook/workbookDiff';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbook/workbookSheetIndex';
import {
  formatWorkbookHiddenColumnMarkerCount,
  getWorkbookHiddenColumnMarkerWidth,
  resolveWorkbookHiddenColumnMarkerLeft,
} from '../src/utils/workbook/workbookHiddenColumnVisuals';

test('hidden column marker uses a neutral count label and scales for large groups', () => {
  assert.equal(formatWorkbookHiddenColumnMarkerCount(5), '5');
  assert.equal(formatWorkbookHiddenColumnMarkerCount(-2), '0');
  assert.equal(getWorkbookHiddenColumnMarkerWidth(5), 36);
  assert.ok(getWorkbookHiddenColumnMarkerWidth(10_000) > getWorkbookHiddenColumnMarkerWidth(5));
});

test('hidden column marker stays on its own side of the frozen boundary', () => {
  const common = {
    boundaryX: 220,
    width: 50,
    contentLeft: 68,
    contentRight: 900,
    frozenBoundaryX: 220,
  };
  const scrollLeft = resolveWorkbookHiddenColumnMarkerLeft({ ...common, layer: 'scroll' });
  const frozenLeft = resolveWorkbookHiddenColumnMarkerLeft({ ...common, layer: 'frozen' });

  assert.equal(scrollLeft, 224);
  assert.equal(frozenLeft + common.width, 216);
});

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

test('buildWorkbookSheetPresentation keeps covered merged columns visible to avoid workbook data loss', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['Merged title', '']),
    createWorkbookRowLine(2, ['10001', '']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, base);
  const sections = getWorkbookSections(diffLines);
  const rows = buildWorkbookSectionRowIndex(diffLines, sections).get('Thing')?.rows ?? [];

  const metadata: WorkbookMetadataMap = {
    sheets: {
      Thing: {
        name: 'Thing',
        hiddenColumns: [],
        mergeRanges: [
          {
            startRow: 1,
            endRow: 1,
            startCol: 0,
            endCol: 1,
          },
        ],
      },
    },
  };

  const withoutMetadata = buildWorkbookSheetPresentation(rows, 'Thing', null, null, 2, false);
  const withMetadata = buildWorkbookSheetPresentation(rows, 'Thing', metadata, metadata, 2, false);
  const withAutoCollapse = buildWorkbookSheetPresentation(
    rows,
    'Thing',
    metadata,
    metadata,
    2,
    false,
    'strict',
    [],
    true,
  );

  assert.deepEqual(withoutMetadata.visibleColumns, [0]);
  assert.deepEqual(withMetadata.visibleColumns, [0, 1]);
  assert.deepEqual(withAutoCollapse.visibleColumns, [0, 1]);
  assert.deepEqual(withAutoCollapse.autoCollapsedColumns, []);
});

test('buildWorkbookSheetPresentation auto-collapses unchanged column runs and preserves changed columns', () => {
  const base = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    createWorkbookRowLine(2, ['a', 'b', 'c', 'before', 'e', 'f', 'g']),
  ].join('\n');
  const mine = [
    createWorkbookSheetLine('Thing'),
    createWorkbookRowLine(1, ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    createWorkbookRowLine(2, ['a', 'b', 'c', 'after', 'e', 'f', 'g']),
  ].join('\n');
  const diffLines = computeWorkbookDiff(base, mine);
  const sections = getWorkbookSections(diffLines);
  const rows = buildWorkbookSectionRowIndex(diffLines, sections).get('Thing')?.rows ?? [];

  const collapsed = buildWorkbookSheetPresentation(
    rows,
    'Thing',
    null,
    null,
    7,
    false,
    'strict',
    [],
    true,
  );
  const revealed = buildWorkbookSheetPresentation(
    rows,
    'Thing',
    null,
    null,
    7,
    false,
    'strict',
    [],
    true,
    [1],
  );

  assert.deepEqual(collapsed.autoCollapsedColumns, [1, 5]);
  assert.deepEqual(collapsed.visibleColumns, [0, 2, 3, 4, 6]);
  assert.deepEqual(revealed.autoCollapsedColumns, [5]);
  assert.deepEqual(revealed.visibleColumns, [0, 1, 2, 3, 4, 6]);
});
