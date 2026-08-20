import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadWorkingCopyLineBlame } from '../electron/main/workingCopyLineBlame';

function git(repositoryPath: string, ...args: string[]) {
  return execFileSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

test('two-file blame annotates only sides backed by a working copy', async (t) => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'versora-working-blame-'));
  git(repositoryPath, 'init', '-b', 'main');
  git(repositoryPath, 'config', 'user.name', 'Working Copy Author');
  git(repositoryPath, 'config', 'user.email', 'working@example.invalid');
  git(repositoryPath, 'config', 'core.autocrlf', 'false');
  const trackedPath = path.join(repositoryPath, 'tracked.txt');
  const untrackedPath = path.join(repositoryPath, 'plain.txt');
  fs.writeFileSync(trackedPath, 'committed\nsecond\n', 'utf8');
  git(repositoryPath, 'add', 'tracked.txt');
  git(repositoryPath, 'commit', '-m', 'initial');
  fs.writeFileSync(trackedPath, 'committed\nlocal change\n', 'utf8');
  fs.writeFileSync(untrackedPath, 'plain file\n', 'utf8');
  t.after(() => fs.rmSync(repositoryPath, { recursive: true, force: true }));

  const payload = await loadWorkingCopyLineBlame(trackedPath, untrackedPath);
  assert.equal(payload.base.length, 2);
  assert.equal(payload.base[0]?.author, 'Working Copy Author');
  assert.equal(payload.base[1]?.uncommitted, true);
  assert.deepEqual(payload.mine, []);
});
