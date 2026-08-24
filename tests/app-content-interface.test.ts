import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('AppContent exposes grouped domain inputs instead of the legacy flat prop surface', () => {
  const content = fs.readFileSync('src/components/app-shell/AppContent.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const propsBlock = content.slice(
    content.indexOf('interface AppContentProps'),
    content.indexOf('function InitialVisualReadySignal'),
  );

  for (const prop of ['lifecycle', 'home', 'surface', 'textSurface', 'workbookSurface']) {
    assert.match(propsBlock, new RegExp(`\\b${prop}:`));
    assert.match(app, new RegExp(`${prop}=\\{\\{`));
  }
  assert.doesNotMatch(propsBlock, /workbookSelection:/);
  assert.doesNotMatch(propsBlock, /setWorkbookHiddenStateBySheet:/);
  assert.doesNotMatch(propsBlock, /onPickWorkingCopyFile:/);
});
