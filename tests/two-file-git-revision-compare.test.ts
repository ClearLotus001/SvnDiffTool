import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SPECIAL_BASE_ID, SPECIAL_MINE_ID } from '../electron/main/constants';
import {
  buildSmartLocalFileDiffData,
  buildTwoFileVersionDiffData,
  clearActiveTwoFileVersionSession,
  loadTwoFileVersionLineBlame,
  queryTwoFileRevisionOptions,
} from '../electron/main/twoFileVersionOperations';
import {
  cleanupManagedTempFilesOnExitSync,
  configureRuntimePaths,
} from '../electron/runtimePaths';

type MockApp = Parameters<typeof configureRuntimePaths>[0];

function createMockApp(sandboxDir: string): MockApp {
  const knownPaths = new Map<string, string>();
  return {
    commandLine: { appendSwitch() {} },
    setPath(name: string, targetPath: string) { knownPaths.set(name, targetPath); },
    getPath(name: string) { return knownPaths.get(name) ?? path.join(sandboxDir, name); },
  } as unknown as MockApp;
}

function git(repositoryPath: string, ...args: string[]) {
  return execFileSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

test('two Git working-copy files expose independent histories and revision switching', async (t) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-two-git-'));
  git(repositoryPath, 'init', '-b', 'main');
  git(repositoryPath, 'config', 'user.name', 'Two File Author');
  git(repositoryPath, 'config', 'user.email', 'two-file@example.invalid');
  git(repositoryPath, 'config', 'core.autocrlf', 'false');
  const basePath = path.join(repositoryPath, 'workbook.rs');
  const minePath = path.join(repositoryPath, 'diff.rs');
  fs.writeFileSync(basePath, 'base initial\n', 'utf8');
  fs.writeFileSync(minePath, 'mine initial\n', 'utf8');
  git(repositoryPath, 'add', '.');
  git(repositoryPath, 'commit', '-m', 'initial files');
  const initialCommit = git(repositoryPath, 'rev-parse', 'HEAD');
  fs.writeFileSync(basePath, 'base committed\n', 'utf8');
  git(repositoryPath, 'commit', '-am', 'update base file');
  const baseCommit = git(repositoryPath, 'rev-parse', 'HEAD');
  fs.writeFileSync(minePath, 'mine committed\n', 'utf8');
  git(repositoryPath, 'commit', '-am', 'update mine file');
  const mineCommit = git(repositoryPath, 'rev-parse', 'HEAD');
  fs.writeFileSync(basePath, 'base working\n', 'utf8');
  fs.writeFileSync(minePath, 'mine working\n', 'utf8');
  configureRuntimePaths(createMockApp(repositoryPath), path.join(repositoryPath, '.runtime'), null);
  t.after(() => {
    clearActiveTwoFileVersionSession();
    cleanupManagedTempFilesOnExitSync();
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  });

  const initial = await buildSmartLocalFileDiffData(basePath, minePath, 'strict');
  assert.equal(initial.baseContent, 'base working\n');
  assert.equal(initial.mineContent, 'mine working\n');
  assert.equal(initial.source?.baseKind, 'git');
  assert.equal(initial.source?.targetKind, 'git');
  assert.deepEqual(initial.revisionSwitchableSides, { base: true, mine: true });
  assert.equal(initial.baseRevisionInfo?.id, SPECIAL_BASE_ID);
  assert.equal(initial.mineRevisionInfo?.id, SPECIAL_MINE_ID);

  const [baseHistory, mineHistory] = await Promise.all([
    queryTwoFileRevisionOptions({ targetSide: 'base', limit: 10, includeSpecials: true }),
    queryTwoFileRevisionOptions({ targetSide: 'mine', limit: 10, includeSpecials: true }),
  ]);
  assert.deepEqual(baseHistory.items.map(item => item.id), [SPECIAL_BASE_ID, mineCommit, baseCommit, initialCommit]);
  assert.deepEqual(mineHistory.items.map(item => item.id), [SPECIAL_MINE_ID, mineCommit, initialCommit]);

  const switched = await buildTwoFileVersionDiffData(initialCommit, mineCommit, 'strict');
  assert.equal(switched.baseContent, 'base initial\n');
  assert.equal(switched.mineContent, 'mine committed\n');
  assert.equal(switched.baseRevisionInfo?.id, initialCommit);
  assert.equal(switched.mineRevisionInfo?.id, mineCommit);
  const blame = await loadTwoFileVersionLineBlame(initialCommit, mineCommit);
  assert.equal(blame.base[0]?.author, 'Two File Author');
  assert.equal(blame.mine[0]?.author, 'Two File Author');
});

test('mixed two-file compare only enables the tracked side', async (t) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-mixed-git-'));
  git(repositoryPath, 'init', '-b', 'main');
  git(repositoryPath, 'config', 'user.name', 'Mixed Author');
  git(repositoryPath, 'config', 'user.email', 'mixed@example.invalid');
  const trackedPath = path.join(repositoryPath, 'tracked.txt');
  const plainPath = path.join(repositoryPath, 'plain.txt');
  fs.writeFileSync(trackedPath, 'tracked\n', 'utf8');
  git(repositoryPath, 'add', 'tracked.txt');
  git(repositoryPath, 'commit', '-m', 'tracked file');
  fs.writeFileSync(plainPath, 'plain\n', 'utf8');
  configureRuntimePaths(createMockApp(repositoryPath), path.join(repositoryPath, '.runtime'), null);
  t.after(() => {
    clearActiveTwoFileVersionSession();
    cleanupManagedTempFilesOnExitSync();
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  });

  const data = await buildSmartLocalFileDiffData(trackedPath, plainPath, 'strict');
  assert.equal(data.source?.baseKind, 'git');
  assert.equal(data.source?.targetKind, 'local');
  assert.deepEqual(data.revisionSwitchableSides, { base: true, mine: false });
  const mineHistory = await queryTwoFileRevisionOptions({
    targetSide: 'mine', limit: 10, includeSpecials: true,
  });
  assert.deepEqual(mineHistory.items, []);
});
