import test from 'node:test';
import assert from 'node:assert/strict';

import type { WorkbookSection } from '../src/types';
import {
  buildWorkbookAutoCollapsedColumns,
  buildWorkbookSheetTabItems,
} from '../src/utils/workbook/workbookAutoCollapse';

function createSection(index: number, changeType: WorkbookSection['changeType'] = 'equal'): WorkbookSection {
  return {
    name: `Sheet${index + 1}`,
    displayName: `Sheet${index + 1}`,
    changeType,
    hasBaseSide: true,
    hasMineSide: true,
    renamePeerName: null,
    renameRole: null,
    startLineIdx: index * 10,
    endLineIdx: (index * 10) + 9,
    maxColumns: 8,
    rowCount: 10,
    firstDataLineIdx: (index * 10) + 1,
    firstDataRowNumber: 1,
  };
}

test('auto column collapse keeps context around protected columns', () => {
  const collapsed = buildWorkbookAutoCollapsedColumns(
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    new Set([4]),
  );

  assert.deepEqual(collapsed, [1, 2, 6, 7]);
});

test('sheet tab collapse keeps changed, active, and edge context sheets visible', () => {
  const sections = Array.from({ length: 8 }, (_, index) => createSection(index));
  const items = buildWorkbookSheetTabItems(sections, {
    collapseUnchanged: true,
    activeIndex: 4,
    modifiedSheetNames: new Set(),
  });

  assert.deepEqual(
    items.map((item) => item.kind === 'sheet' ? item.index : `collapse:${item.startIndex}-${item.endIndex}`),
    [0, 'collapse:1-3', 4, 'collapse:5-6', 7],
  );
});

test('sheet tab collapse can expand one unchanged group without expanding the others', () => {
  const sections = Array.from({ length: 8 }, (_, index) => createSection(index));
  const initial = buildWorkbookSheetTabItems(sections, {
    collapseUnchanged: true,
    activeIndex: 4,
    modifiedSheetNames: new Set(),
  });
  const firstCollapse = initial.find((item) => item.kind === 'collapse');
  assert.ok(firstCollapse);

  const expanded = buildWorkbookSheetTabItems(sections, {
    collapseUnchanged: true,
    activeIndex: 4,
    modifiedSheetNames: new Set(),
    expandedCollapseKeys: new Set([firstCollapse.key]),
  });

  assert.deepEqual(
    expanded.map((item) => item.kind === 'sheet' ? item.index : `collapse:${item.startIndex}-${item.endIndex}`),
    [0, 1, 2, 3, 4, 'collapse:5-6', 7],
  );
});
