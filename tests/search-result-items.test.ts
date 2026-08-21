import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine, SearchMatch } from '../src/types';
import {
  createWorkbookRowLine,
  createWorkbookSheetLine,
} from '../src/utils/workbook/workbookDisplay';
import {
  createSearchResultItemResolver,
  getVirtualizedSearchResultsWindow,
  SEARCH_RESULT_ITEM_H,
  SEARCH_RESULTS_VIEWPORT_H,
} from '../src/utils/diff/searchResultItems';

function createDiffLine(
  type: DiffLine['type'],
  base: string | null,
  mine: string | null,
): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo: null,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('search result resolver builds workbook preview lazily and caches the item', () => {
  const rowLine = createWorkbookRowLine(12, ['Alpha', { value: 'Budget Report', formula: 'SUM(A1:A3)' }, 'Gamma']);
  const diffLines = [createDiffLine('equal', rowLine, rowLine)];
  const searchMatches: SearchMatch[] = [{
    lineIdx: 0,
    start: rowLine.indexOf('Budget'),
    end: rowLine.indexOf('Budget') + 'Budget'.length,
    workbookTarget: {
      sheetName: 'Sheet1',
      side: 'mine',
      rowNumber: 12,
      colIndex: 1,
    },
  }];

  const resolveResult = createSearchResultItemResolver({
    diffLines,
    searchMatches,
    baseRoleTitle: 'Base',
    mineRoleTitle: 'Mine',
    noResultsLabel: 'No results',
  });

  const item = resolveResult(0);
  assert.ok(item);
  assert.equal(item.locationLabel, 'Sheet1!B12');
  assert.equal(item.preview, 'Budget Report');
  assert.equal(item.sideLabel, 'Mine');
  assert.equal(resolveResult(0), item);
  assert.equal(resolveResult(1), null);
});

test('search result resolver never exposes workbook protocol markers in fallback previews', () => {
  const rowLine = createWorkbookRowLine(5, ['Alpha', 'Beta']);
  const sheetLine = createWorkbookSheetLine('Budget Data');
  const diffLines = [
    createDiffLine('equal', rowLine, rowLine),
    createDiffLine('equal', sheetLine, sheetLine),
  ];
  const searchMatches: SearchMatch[] = [
    {
      lineIdx: 0,
      start: rowLine.indexOf('@@row'),
      end: rowLine.indexOf('@@row') + '@@row'.length,
      workbookTarget: {
        sheetName: 'Budget Data',
        side: 'mine',
        rowNumber: 5,
        colIndex: null,
      },
    },
    {
      lineIdx: 1,
      start: sheetLine.indexOf('@@sheet'),
      end: sheetLine.indexOf('@@sheet') + '@@sheet'.length,
      workbookTarget: {
        sheetName: 'Budget Data',
        side: 'mine',
        rowNumber: null,
        colIndex: null,
      },
    },
  ];

  const resolveResult = createSearchResultItemResolver({
    diffLines,
    searchMatches,
    baseRoleTitle: 'Base',
    mineRoleTitle: 'Mine',
    noResultsLabel: 'No results',
  });

  assert.equal(resolveResult(0)?.preview, 'Alpha    Beta');
  assert.equal(resolveResult(1)?.preview, 'Budget Data');
  assert.doesNotMatch(resolveResult(0)?.preview ?? '', /@@row|@@sheet/);
  assert.doesNotMatch(resolveResult(1)?.preview ?? '', /@@row|@@sheet/);
});

test('virtualized search results window only exposes the visible slice with overscan', () => {
  const windowSlice = getVirtualizedSearchResultsWindow(
    10_000,
    SEARCH_RESULT_ITEM_H * 120,
    SEARCH_RESULTS_VIEWPORT_H,
  );

  assert.equal(windowSlice.startIndex, 114);
  assert.equal(windowSlice.endIndex, 132);
  assert.equal(windowSlice.offsetTop, 114 * SEARCH_RESULT_ITEM_H);
  assert.equal(windowSlice.totalHeight, 10_000 * SEARCH_RESULT_ITEM_H - 6);
});

test('virtualized search results window clamps empty inputs', () => {
  assert.deepEqual(
    getVirtualizedSearchResultsWindow(0, 500, SEARCH_RESULTS_VIEWPORT_H),
    {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0,
    },
  );
});
