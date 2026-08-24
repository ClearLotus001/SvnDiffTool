import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('AppDialogs consumes the dialog controller and grouped feature inputs', () => {
  const dialogs = fs.readFileSync('src/components/app-shell/AppDialogs.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const propsBlock = dialogs.slice(
    dialogs.indexOf('interface AppDialogsProps'),
    dialogs.indexOf('export default function AppDialogs'),
  );

  for (const prop of ['dialogs', 'navigation', 'update', 'svnConfig', 'localCompare']) {
    assert.match(propsBlock, new RegExp(`\\b${prop}:`));
    assert.match(app, new RegExp(`${prop}=\\{`));
  }
  assert.doesNotMatch(propsBlock, /showGoto:/);
  assert.doesNotMatch(propsBlock, /onCloseGoto:/);
  assert.doesNotMatch(propsBlock, /svnDiffViewerStatus:/);
});
