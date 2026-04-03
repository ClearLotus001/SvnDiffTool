import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine } from '../src/types';
import {
  buildWorkbookLineSheetContexts,
  getWorkbookSections,
  summarizeWorkbookSectionChanges,
} from '../src/utils/workbook/workbookSections';

function line(
  type: DiffLine['type'],
  base: string | null,
  mine: string | null,
  baseLineNo: number | null = null,
  mineLineNo: number | null = null,
): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo,
    mineLineNo,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('getWorkbookSections marks added and deleted sheets', () => {
  const sections = getWorkbookSections([
    line('delete', '@@sheet\tOldOnly', null),
    line('delete', '@@row\t1\tLegacy\tValue', null, 1, null),
    line('delete', '@@row\t2\tA\t1', null, 2, null),
    line('add', null, '@@sheet\tNewOnly'),
    line('add', null, '@@row\t1\tFresh\tValue', null, 1),
    line('add', null, '@@row\t2\tB\t2', null, 2),
  ]);

  assert.deepEqual(
    sections.map((section) => ({
      name: section.name,
      displayName: section.displayName,
      changeType: section.changeType,
      renamePeerName: section.renamePeerName,
      renameRole: section.renameRole,
    })),
    [
      {
        name: 'OldOnly',
        displayName: 'OldOnly',
        changeType: 'delete',
        renamePeerName: null,
        renameRole: null,
      },
      {
        name: 'NewOnly',
        displayName: 'NewOnly',
        changeType: 'add',
        renamePeerName: null,
        renameRole: null,
      },
    ],
  );
});

test('getWorkbookSections recognizes exact sheet renames', () => {
  const sections = getWorkbookSections([
    line('delete', '@@sheet\tOldName', null),
    line('delete', '@@row\t1\tID\tName', null, 1, null),
    line('delete', '@@row\t2\t1001\tAlice', null, 2, null),
    line('add', null, '@@sheet\tNewName'),
    line('add', null, '@@row\t1\tID\tName', null, 1),
    line('add', null, '@@row\t2\t1001\tAlice', null, 2),
  ]);

  assert.deepEqual(
    sections.map((section) => ({
      name: section.name,
      displayName: section.displayName,
      changeType: section.changeType,
      renamePeerName: section.renamePeerName,
      renameRole: section.renameRole,
    })),
    [
      {
        name: 'OldName',
        displayName: 'OldName',
        changeType: 'rename',
        renamePeerName: 'NewName',
        renameRole: 'source',
      },
      {
        name: 'NewName',
        displayName: 'NewName',
        changeType: 'rename',
        renamePeerName: 'OldName',
        renameRole: 'target',
      },
    ],
  );
});

test('getWorkbookSections recognizes high-overlap sheet renames and keeps weak matches as add/delete', () => {
  const renameSections = getWorkbookSections([
    line('delete', '@@sheet\tOldData', null),
    line('delete', '@@row\t1\tID\tName', null, 1, null),
    line('delete', '@@row\t2\t1001\tAlice', null, 2, null),
    line('delete', '@@row\t3\t1002\tBob', null, 3, null),
    line('delete', '@@row\t4\t1003\tCarol', null, 4, null),
    line('add', null, '@@sheet\tRenamedData'),
    line('add', null, '@@row\t1\tID\tName', null, 1),
    line('add', null, '@@row\t2\t1001\tAlice', null, 2),
    line('add', null, '@@row\t3\t1002\tBob', null, 3),
    line('add', null, '@@row\t4\t1003\tCora', null, 4),
  ]);

  assert.equal(renameSections[0]?.changeType, 'rename');
  assert.equal(renameSections[1]?.changeType, 'rename');
  assert.equal(renameSections[0]?.renamePeerName, 'RenamedData');
  assert.equal(renameSections[1]?.renamePeerName, 'OldData');

  const weakMatchSections = getWorkbookSections([
    line('delete', '@@sheet\tLegacy', null),
    line('delete', '@@row\t1\tID\tName', null, 1, null),
    line('delete', '@@row\t2\t1001\tAlice', null, 2, null),
    line('add', null, '@@sheet\tFresh'),
    line('add', null, '@@row\t1\tID\tName', null, 1),
    line('add', null, '@@row\t2\t2001\tBob', null, 2),
  ]);

  assert.deepEqual(
    weakMatchSections.map((section) => section.changeType),
    ['delete', 'add'],
  );
});

test('summarizeWorkbookSectionChanges counts rename pairs once', () => {
  const sections = getWorkbookSections([
    line('add', null, '@@sheet\tAdded'),
    line('add', null, '@@row\t1\tAdded\tOnly', null, 1),
    line('delete', '@@sheet\tDeleted', null),
    line('delete', '@@row\t1\tDeleted\tOnly', null, 1, null),
    line('delete', '@@sheet\tOldName', null),
    line('delete', '@@row\t1\tID\tAlice', null, 1, null),
    line('add', null, '@@sheet\tNewName'),
    line('add', null, '@@row\t1\tID\tAlice', null, 1),
  ]);

  assert.deepEqual(summarizeWorkbookSectionChanges(sections), {
    added: 1,
    deleted: 1,
    renamed: 1,
  });
});

test('getWorkbookSections reuses cached result for identical diffLines reference and compare mode', () => {
  const diffLines = [
    line('equal', '@@sheet\tData', '@@sheet\tData'),
    line('equal', '@@row\t1\tID\tName', '@@row\t1\tID\tName', 1, 1),
  ];

  const first = getWorkbookSections(diffLines, 'strict');
  const second = getWorkbookSections(diffLines, 'strict');

  assert.equal(first, second);
});

test('buildWorkbookLineSheetContexts reuses cached contexts for identical diffLines reference', () => {
  const diffLines = [
    line('equal', '@@sheet\tData', '@@sheet\tData'),
    line('equal', '@@row\t1\tID\tName', '@@row\t1\tID\tName', 1, 1),
  ];

  const first = buildWorkbookLineSheetContexts(diffLines);
  const second = buildWorkbookLineSheetContexts(diffLines);

  assert.equal(first, second);
});
