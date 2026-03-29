import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  EXTERNAL_DIFF_REQUEST_FLAG,
  findExternalDiffRequestPathFromArgv,
  readExternalDiffRequestCliArgsSync,
  resolveLaunchCliArgsFromArgv,
} from '../electron/externalDiffRequest';

const EXEC_PATH = String.raw`C:\Program Files\SvnDiffTool\SvnDiffTool.exe`;

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-diff-request-test-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('findExternalDiffRequestPathFromArgv reads inline and separate flag forms', () => {
  assert.equal(
    findExternalDiffRequestPathFromArgv([EXEC_PATH, `${EXTERNAL_DIFF_REQUEST_FLAG}=C:\\temp\\req.json`]),
    String.raw`C:\temp\req.json`,
  );
  assert.equal(
    findExternalDiffRequestPathFromArgv([EXEC_PATH, EXTERNAL_DIFF_REQUEST_FLAG, String.raw`C:\temp\req.json`]),
    String.raw`C:\temp\req.json`,
  );
});

test('readExternalDiffRequestCliArgsSync parses request payload and removes file', () => {
  withTempDir((dir) => {
    const requestPath = path.join(dir, 'request.json');
    fs.writeFileSync(requestPath, JSON.stringify({
      version: 1,
      basePath: String.raw`C:\Temp\left.xlsx`,
      minePath: String.raw`C:\Temp\right.xlsx`,
      baseName: 'left',
      mineName: 'right',
      baseUrl: 'http://repo/left.xlsx',
      mineUrl: 'http://repo/right.xlsx',
      baseRevision: '1',
      mineRevision: '2',
      pegRevision: '2',
      fileName: 'diff.xlsx',
    }), 'utf-8');

    const parsed = readExternalDiffRequestCliArgsSync(requestPath);
    assert.deepEqual(parsed, {
      basePath: String.raw`C:\Temp\left.xlsx`,
      minePath: String.raw`C:\Temp\right.xlsx`,
      baseName: 'left',
      mineName: 'right',
      baseUrl: 'http://repo/left.xlsx',
      mineUrl: 'http://repo/right.xlsx',
      baseRevision: '1',
      mineRevision: '2',
      pegRevision: '2',
      fileName: 'diff.xlsx',
    });
    assert.equal(fs.existsSync(requestPath), false);
  });
});

test('resolveLaunchCliArgsFromArgv prefers external request over positional argv', () => {
  withTempDir((dir) => {
    const requestPath = path.join(dir, 'request.json');
    fs.writeFileSync(requestPath, JSON.stringify({
      version: 1,
      basePath: String.raw`C:\Temp\base.xlsx`,
      minePath: String.raw`C:\Temp\mine.xlsx`,
      baseName: 'base',
      mineName: 'mine',
      baseRevision: '5',
      mineRevision: '6',
      pegRevision: '6',
      fileName: 'sample.xlsx',
    }), 'utf-8');

    const parsed = resolveLaunchCliArgsFromArgv([
      EXEC_PATH,
      `${EXTERNAL_DIFF_REQUEST_FLAG}=${requestPath}`,
      String.raw`C:\Ignored\left.txt`,
      String.raw`C:\Ignored\right.txt`,
    ]);

    assert.deepEqual(parsed, {
      basePath: String.raw`C:\Temp\base.xlsx`,
      minePath: String.raw`C:\Temp\mine.xlsx`,
      baseName: 'base',
      mineName: 'mine',
      baseUrl: '',
      mineUrl: '',
      baseRevision: '5',
      mineRevision: '6',
      pegRevision: '6',
      fileName: 'sample.xlsx',
    });
  });
});

test('resolveLaunchCliArgsFromArgv returns null when no request flag is present', () => {
  const parsed = resolveLaunchCliArgsFromArgv([
    EXEC_PATH,
    String.raw`C:\Temp\left.xlsx`,
    String.raw`C:\Temp\right.xlsx`,
    'left',
    'right',
    'sample.xlsx',
  ]);

  assert.equal(parsed, null);
});

