import test from 'node:test';
import assert from 'node:assert/strict';

import { useAppStore } from '@/store/appStore';

test('hydrateLoadedDiffSession applies workbook compare mode with the diff session payload', () => {
  const originalState = useAppStore.getState();

  try {
    useAppStore.getState().hydrateLoadedDiffSession({
      baseName: 'base.xlsx',
      mineName: 'mine.xlsx',
      launchBaseName: 'base.xlsx',
      launchMineName: 'mine.xlsx',
      fileName: 'mine.xlsx',
      workbookCompareMode: 'content',
      diffLines: [{
        type: 'equal',
        base: 'Sheet: Bench',
        mine: 'Sheet: Bench',
        baseLineNo: 1,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      }],
      diffSourceNoticeCode: null,
      workbookArtifactDiff: null,
      baseWorkbookMetadata: null,
      mineWorkbookMetadata: null,
      revisionOptions: [],
      baseRevisionInfo: null,
      mineRevisionInfo: null,
      compareContext: 'literal_two_file_compare',
      resetPair: null,
      canSwitchRevisions: false,
    });

    const nextState = useAppStore.getState();
    assert.equal(nextState.workbookCompareMode, 'content');
    assert.equal(nextState.fileName, 'mine.xlsx');
    assert.equal(nextState.diffLines.length, 1);
    assert.equal(nextState.hunkIdx, 0);
    assert.equal(nextState.activeWorkbookSheetName, null);
  } finally {
    useAppStore.setState(originalState, true);
  }
});

test('hydrateLoadedDiffSession can preserve workbook view state for same-session compare-mode switches', () => {
  const originalState = useAppStore.getState();

  try {
    useAppStore.getState().hydrateLoadedDiffSession({
      baseName: 'base.xlsx',
      mineName: 'mine.xlsx',
      launchBaseName: 'base.xlsx',
      launchMineName: 'mine.xlsx',
      fileName: 'mine.xlsx',
      workbookCompareMode: 'strict',
      preservedWorkbookViewState: {
        activeWorkbookSheetName: 'Bench',
        workbookHiddenStateBySheet: {
          Bench: {
            hiddenRows: [8, 9],
            hiddenColumns: [3],
          },
        },
        workbookFreezeBySheet: {
          Bench: {
            rowNumber: 2,
            colCount: 1,
          },
        },
        workbookColumnWidthBySheet: {
          Bench: {
            2: 220,
          },
        },
      },
      diffLines: [{
        type: 'equal',
        base: 'Sheet: Bench',
        mine: 'Sheet: Bench',
        baseLineNo: 1,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      }],
      diffSourceNoticeCode: null,
      workbookArtifactDiff: null,
      baseWorkbookMetadata: null,
      mineWorkbookMetadata: null,
      revisionOptions: [],
      baseRevisionInfo: null,
      mineRevisionInfo: null,
      compareContext: 'literal_two_file_compare',
      resetPair: null,
      canSwitchRevisions: false,
    });

    const nextState = useAppStore.getState();
    assert.equal(nextState.activeWorkbookSheetName, 'Bench');
    assert.deepEqual(nextState.workbookHiddenStateBySheet, {
      Bench: {
        hiddenRows: [8, 9],
        hiddenColumns: [3],
      },
    });
    assert.deepEqual(nextState.workbookFreezeBySheet, {
      Bench: {
        rowNumber: 2,
        colCount: 1,
      },
    });
    assert.deepEqual(nextState.workbookColumnWidthBySheet, {
      Bench: {
        2: 220,
      },
    });
    assert.equal(nextState.workbookSelection.primary, null);
  } finally {
    useAppStore.setState(originalState, true);
  }
});

test('resetDiffSessionToHome clears transient comparison state and preserves preferences', () => {
  const originalState = useAppStore.getState();

  try {
    useAppStore.setState({
      fileName: 'active.ts',
      baseName: 'base.ts',
      mineName: 'mine.ts',
      diffLines: [{
        type: 'add',
        base: null,
        mine: 'changed',
        baseLineNo: null,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      }],
      diffTypeFilter: 'delete',
      searchQ: 'changed',
      hunkIdx: 3,
      revisionOptions: [{
        id: 'r1', revision: 'r1', title: 'r1', author: 'A', date: '', message: '', kind: 'revision',
      }],
      activeWorkbookSheetName: 'Sheet1',
    });
    const themeBefore = useAppStore.getState().themeKey;
    const layoutBefore = useAppStore.getState().layout;

    useAppStore.getState().resetDiffSessionToHome();
    const nextState = useAppStore.getState();
    assert.equal(nextState.fileName, '');
    assert.equal(nextState.diffTypeFilter, 'all');
    assert.equal(nextState.diffLines.length, 0);
    assert.equal(nextState.searchQ, '');
    assert.equal(nextState.hunkIdx, 0);
    assert.equal(nextState.revisionOptions.length, 0);
    assert.equal(nextState.activeWorkbookSheetName, null);
    assert.equal(nextState.themeKey, themeBefore);
    assert.equal(nextState.layout, layoutBefore);
  } finally {
    useAppStore.setState(originalState, true);
  }
});

test('enabling differences-only view clears selections that could become invisible', () => {
  const originalState = useAppStore.getState();
  const cell = {
    kind: 'cell' as const,
    sheetName: 'Sheet1',
    side: 'base' as const,
    versionLabel: 'BASE',
    rowNumber: 8,
    colIndex: 1,
    colLabel: 'B',
    address: 'B8',
    value: 'unchanged',
    formula: '',
  };

  try {
    useAppStore.setState({
      showOnlyDifferences: false,
      workbookSelection: { anchor: cell, primary: cell, items: [cell] },
    });
    useAppStore.getState().setShowOnlyDifferences(true);

    assert.equal(useAppStore.getState().showOnlyDifferences, true);
    assert.equal(useAppStore.getState().workbookSelection.primary, null);
  } finally {
    useAppStore.setState(originalState, true);
  }
});
