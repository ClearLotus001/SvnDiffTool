import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine, SearchMatch, WorkbookDiffRegion } from '../src/types';
import type { WorkbookLineSheetContext } from '../src/utils/workbook/workbookSections';
import {
  resolveWorkbookNavigationSheetSyncRequest,
  resolveWorkbookSearchSheetSyncRequest,
} from '../src/utils/workbook/workbookSheetSync';

function createDiffLine(type: DiffLine['type'] = 'equal'): DiffLine {
  return {
    type,
    base: '',
    mine: '',
    baseLineNo: null,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function createSearchMatch(lineIdx: number, workbookTarget: SearchMatch['workbookTarget'] = null): SearchMatch {
  return {
    lineIdx,
    start: 0,
    end: 1,
    workbookTarget,
  };
}

test('search sheet sync key stays stable when only preferred sheet changes', () => {
  const diffLines = [createDiffLine()];
  const lineSheetContexts: WorkbookLineSheetContext[] = [{ baseSheetName: 'Thing', mineSheetName: 'Package' }];
  const searchMatches = [createSearchMatch(0)];

  const first = resolveWorkbookSearchSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: 0,
    searchJumpNonce: 3,
    searchMatches,
    diffLines,
    lineSheetContexts,
    preferredSheetName: 'Thing',
    fallbackSheetName: null,
  });
  const second = resolveWorkbookSearchSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: 0,
    searchJumpNonce: 3,
    searchMatches,
    diffLines,
    lineSheetContexts,
    preferredSheetName: 'Package',
    fallbackSheetName: null,
  });

  assert.equal(first?.eventKey, second?.eventKey);
  assert.equal(first?.sheetName, 'Thing');
  assert.equal(second?.sheetName, 'Package');
});

test('search sheet sync key changes when the search navigation event changes', () => {
  const diffLines = [createDiffLine()];
  const lineSheetContexts: WorkbookLineSheetContext[] = [{ baseSheetName: 'Thing', mineSheetName: 'Thing' }];
  const searchMatches = [createSearchMatch(0)];

  const first = resolveWorkbookSearchSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: 0,
    searchJumpNonce: 3,
    searchMatches,
    diffLines,
    lineSheetContexts,
    preferredSheetName: null,
    fallbackSheetName: null,
  });
  const second = resolveWorkbookSearchSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: 0,
    searchJumpNonce: 4,
    searchMatches,
    diffLines,
    lineSheetContexts,
    preferredSheetName: null,
    fallbackSheetName: null,
  });

  assert.notEqual(first?.eventKey, second?.eventKey);
});

test('navigation sheet sync key stays stable when only preferred sheet changes', () => {
  const diffLines = [createDiffLine()];
  const lineSheetContexts: WorkbookLineSheetContext[] = [{ baseSheetName: 'Thing', mineSheetName: 'Package' }];

  const first = resolveWorkbookNavigationSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: -1,
    searchMatches: [],
    activeWorkbookDiffRegion: null,
    hunkIdx: 0,
    hunkPositions: [0],
    diffLines,
    lineSheetContexts,
    preferredSheetName: 'Thing',
  });
  const second = resolveWorkbookNavigationSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: -1,
    searchMatches: [],
    activeWorkbookDiffRegion: null,
    hunkIdx: 0,
    hunkPositions: [0],
    diffLines,
    lineSheetContexts,
    preferredSheetName: 'Package',
  });

  assert.equal(first?.eventKey, second?.eventKey);
  assert.equal(first?.sheetName, 'Thing');
  assert.equal(second?.sheetName, 'Package');
});

test('navigation sheet sync yields to active search navigation', () => {
  const diffLines = [createDiffLine()];
  const lineSheetContexts: WorkbookLineSheetContext[] = [{ baseSheetName: 'Thing', mineSheetName: 'Thing' }];
  const activeWorkbookDiffRegion: WorkbookDiffRegion = {
    id: 'Thing:0:0:0',
    sheetName: 'Thing',
    startRowIndex: 0,
    endRowIndex: 0,
    startCol: 0,
    endCol: 0,
    rowNumberStart: 1,
    rowNumberEnd: 1,
    lineStartIdx: 0,
    lineEndIdx: 0,
    anchorLineIdx: 0,
    hasBaseSide: true,
    hasMineSide: true,
    anchorSelection: null,
    patches: [],
  };

  const request = resolveWorkbookNavigationSheetSyncRequest({
    isWorkbookMode: true,
    activeSearchIdx: 0,
    searchMatches: [createSearchMatch(0)],
    activeWorkbookDiffRegion,
    hunkIdx: 0,
    hunkPositions: [0],
    diffLines,
    lineSheetContexts,
    preferredSheetName: null,
  });

  assert.equal(request, null);
});
