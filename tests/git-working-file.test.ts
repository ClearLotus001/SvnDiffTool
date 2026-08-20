import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { SPECIAL_MINE_ID } from '../electron/main/constants.js';
import { EMPTY_CLI_ARGS } from '../electron/cliArgs.js';
import {
  buildGitFileRevisionDiffData,
  buildSmartWorkingCopyDiffData,
} from '../electron/main/gitDiffBuilder.js';
import {
  clearActiveGitWorkingFileSession,
  getActiveGitWorkingFileSession,
  loadGitLineBlame,
  queryGitRevisionOptions,
} from '../electron/main/gitOperations.js';
import {
  cleanupManagedTempFilesOnExitSync,
  configureRuntimePaths,
} from '../electron/runtimePaths.js';
import { setActiveCliArgs } from '../electron/main/state.js';

type MockApp = Parameters<typeof configureRuntimePaths>[0];

function createMockApp(sandboxDir: string): MockApp {
  const knownPaths = new Map<string, string>();
  return {
    commandLine: { appendSwitch() {} },
    setPath(name: string, targetPath: string) {
      knownPaths.set(name, targetPath);
    },
    getPath(name: string) {
      return knownPaths.get(name) ?? path.join(sandboxDir, name);
    },
  } as unknown as MockApp;
}

function git(repositoryPath: string, ...args: string[]) {
  return execFileSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function haveSvnTools(): boolean {
  return spawnSync('svn', ['--version', '--quiet'], { windowsHide: true }).status === 0
    && spawnSync('svnadmin', ['--version', '--quiet'], { windowsHide: true }).status === 0;
}

function createRepository() {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-git-file-'));
  git(repositoryPath, 'init', '-b', 'main');
  git(repositoryPath, 'config', 'user.name', 'Versora Test');
  git(repositoryPath, 'config', 'user.email', 'versora@example.invalid');
  git(repositoryPath, 'config', 'core.autocrlf', 'false');
  const filePath = path.join(repositoryPath, 'src', 'sample.txt');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'before\n', 'utf8');
  git(repositoryPath, 'add', '.');
  git(repositoryPath, 'commit', '-m', 'initial sample');
  fs.writeFileSync(filePath, 'middle\n', 'utf8');
  git(repositoryPath, 'commit', '-am', 'update sample');
  const commits = git(repositoryPath, 'log', '--format=%H', '--reverse').split(/\r?\n/);
  fs.writeFileSync(filePath, 'after\n', 'utf8');
  return {
    repositoryPath,
    filePath,
    initialCommit: commits[0]!,
    headCommit: commits[1]!,
  };
}

test('selected Git file compares HEAD with the working tree and switches file versions', async (t) => {
  const repository = createRepository();
  const runtimeRoot = path.join(repository.repositoryPath, '.versora-test-runtime');
  configureRuntimePaths(createMockApp(repository.repositoryPath), runtimeRoot, null);
  t.after(() => {
    clearActiveGitWorkingFileSession();
    setActiveCliArgs(EMPTY_CLI_ARGS);
    cleanupManagedTempFilesOnExitSync();
    fs.rmSync(repository.repositoryPath, { recursive: true, force: true });
  });

  const initial = await buildSmartWorkingCopyDiffData(repository.filePath, 'strict');
  assert.equal(initial.source?.kind, 'git');
  assert.equal(initial.compareContext, 'git_compare');
  assert.equal(initial.canSwitchRevisions, true);
  assert.equal(initial.baseRevisionInfo?.id, repository.headCommit);
  assert.equal(initial.mineRevisionInfo?.id, SPECIAL_MINE_ID);
  assert.equal(initial.baseContent, 'middle\n');
  assert.equal(initial.mineContent, 'after\n');
  assert.equal(getActiveGitWorkingFileSession()?.relativePath, 'src/sample.txt');
  const initialBlame = await loadGitLineBlame(
    initial.baseRevisionInfo?.id,
    initial.mineRevisionInfo?.id,
  );
  assert.equal(initialBlame.base[0]?.revision, repository.headCommit.slice(0, 10));
  assert.equal(initialBlame.base[0]?.author, 'Versora Test');
  assert.equal(initialBlame.mine[0]?.uncommitted, true);

  const firstPage = await queryGitRevisionOptions({
    limit: 1,
    includeSpecials: true,
  });
  assert.deepEqual(firstPage.items.map((item) => item.id), [
    SPECIAL_MINE_ID,
    repository.headCommit,
  ]);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextBeforeRevisionId, repository.headCommit);

  const secondPage = await queryGitRevisionOptions({
    limit: 10,
    beforeRevisionId: firstPage.nextBeforeRevisionId ?? undefined,
    includeSpecials: false,
  });
  assert.deepEqual(secondPage.items.map((item) => item.id), [repository.initialCommit]);

  const historyToWorking = await buildGitFileRevisionDiffData(
    repository.initialCommit,
    SPECIAL_MINE_ID,
    'strict',
  );
  assert.equal(historyToWorking.baseContent, 'before\n');
  assert.equal(historyToWorking.mineContent, 'after\n');
  assert.equal(historyToWorking.baseRevisionInfo?.id, repository.initialCommit);
  assert.equal(historyToWorking.mineRevisionInfo?.id, SPECIAL_MINE_ID);

  const commitToCommit = await buildGitFileRevisionDiffData(
    repository.initialCommit,
    repository.headCommit,
    'strict',
  );
  assert.equal(commitToCommit.baseContent, 'before\n');
  assert.equal(commitToCommit.mineContent, 'middle\n');
  const commitBlame = await loadGitLineBlame(
    commitToCommit.baseRevisionInfo?.id,
    commitToCommit.mineRevisionInfo?.id,
  );
  assert.equal(commitBlame.base[0]?.revision, repository.initialCommit.slice(0, 10));
  assert.equal(commitBlame.mine[0]?.revision, repository.headCommit.slice(0, 10));
});

test('untracked Git file opens against an empty baseline without version switching', async (t) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-git-untracked-'));
  git(repositoryPath, 'init', '-b', 'main');
  git(repositoryPath, 'config', 'user.name', 'Versora Test');
  git(repositoryPath, 'config', 'user.email', 'versora@example.invalid');
  fs.writeFileSync(path.join(repositoryPath, 'tracked.txt'), 'tracked\n', 'utf8');
  git(repositoryPath, 'add', '.');
  git(repositoryPath, 'commit', '-m', 'initial');
  const filePath = path.join(repositoryPath, 'untracked.txt');
  fs.writeFileSync(filePath, 'new file\n', 'utf8');
  configureRuntimePaths(createMockApp(repositoryPath), path.join(repositoryPath, '.runtime'), null);
  t.after(() => {
    clearActiveGitWorkingFileSession();
    setActiveCliArgs(EMPTY_CLI_ARGS);
    cleanupManagedTempFilesOnExitSync();
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  });

  const data = await buildSmartWorkingCopyDiffData(filePath, 'strict');
  assert.equal(data.source?.kind, 'git');
  assert.equal(data.canSwitchRevisions, false);
  assert.equal(data.baseContent, '');
  assert.equal(data.mineContent, 'new file\n');
  assert.equal(data.sourceNoticeCode, 'unversioned-working-copy');
});

test('selected SVN file falls through to the existing revision-aware comparison', {
  skip: !haveSvnTools(),
}, async (t) => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-smart-svn-'));
  const repositoryPath = path.join(sandboxDir, 'repository');
  const importPath = path.join(sandboxDir, 'import');
  const workingCopyPath = path.join(sandboxDir, 'working-copy');
  fs.mkdirSync(importPath, { recursive: true });
  fs.writeFileSync(path.join(importPath, 'sample.txt'), 'repository version\n', 'utf8');
  run('svnadmin', ['create', repositoryPath]);
  const repositoryUrl = pathToFileURL(repositoryPath).href;
  run('svn', ['import', importPath, repositoryUrl, '-m', 'initial']);
  run('svn', ['checkout', repositoryUrl, workingCopyPath]);
  const filePath = path.join(workingCopyPath, 'sample.txt');
  fs.writeFileSync(filePath, 'working copy version\n', 'utf8');
  configureRuntimePaths(createMockApp(sandboxDir), path.join(sandboxDir, '.runtime'), null);
  t.after(() => {
    clearActiveGitWorkingFileSession();
    setActiveCliArgs(EMPTY_CLI_ARGS);
    cleanupManagedTempFilesOnExitSync();
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  const data = await buildSmartWorkingCopyDiffData(filePath, 'strict');
  assert.equal(data.source?.kind, 'svn');
  assert.equal(data.canSwitchRevisions, true);
  assert.equal(data.baseContent, 'repository version\n');
  assert.equal(data.mineContent, 'working copy version\n');
  assert.equal(data.baseRevisionInfo?.revision, 'r1');
  assert.equal(data.mineRevisionInfo?.kind, 'working-copy');
});
