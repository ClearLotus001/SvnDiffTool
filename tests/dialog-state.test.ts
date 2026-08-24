import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createClosedDialogState,
  resolveDialogStateUpdate,
} from '../src/hooks/app/useDialogState';

test('opening one shell overlay closes every other overlay', () => {
  const searchOpen = resolveDialogStateUpdate(createClosedDialogState(), 'showSearch', true);
  const gotoOpen = resolveDialogStateUpdate(searchOpen, 'showGoto', true);

  assert.deepEqual(gotoOpen, {
    showSearch: false,
    showGoto: true,
    showHelp: false,
    showAbout: false,
    showSvnConfig: false,
    showLocalFileCompare: false,
  });

  const svnOpen = resolveDialogStateUpdate(gotoOpen, 'showSvnConfig', true);
  assert.equal(svnOpen.showGoto, false);
  assert.equal(svnOpen.showSvnConfig, true);
});

test('closing and toggling an overlay preserve the exclusive state invariant', () => {
  const aboutOpen = resolveDialogStateUpdate(createClosedDialogState(), 'showAbout', true);
  const aboutClosed = resolveDialogStateUpdate(aboutOpen, 'showAbout', (value) => !value);
  assert.deepEqual(aboutClosed, createClosedDialogState());
});
