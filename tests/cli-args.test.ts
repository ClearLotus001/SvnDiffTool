import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_CLI_ARGS, parseCliArgsFromArgv } from '../electron/cliArgs';

const EXEC_PATH = String.raw`C:\Program Files\SvnDiffTool\SvnDiffTool.exe`;

test('parseCliArgsFromArgv reads the new 10-argument tortoisesvn protocol', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    String.raw`C:\Temp\base.xlsx`,
    String.raw`C:\Work\[1]新物品表.xlsm`,
    '[1]新物品表.xlsm : revision 1827002',
    '[1]新物品表.xlsm : working copy',
    'svn://repo/project/trunk/[1]新物品表.xlsm',
    'svn://repo/project/trunk/[1]新物品表.xlsm',
    '1827002',
    '1827003',
    '1827003',
    '[1]新物品表.xlsm',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Temp\base.xlsx`,
    minePath: String.raw`C:\Work\[1]新物品表.xlsm`,
    baseName: '[1]新物品表.xlsm : revision 1827002',
    mineName: '[1]新物品表.xlsm : working copy',
    baseUrl: 'svn://repo/project/trunk/[1]新物品表.xlsm',
    mineUrl: 'svn://repo/project/trunk/[1]新物品表.xlsm',
    baseRevision: '1827002',
    mineRevision: '1827003',
    pegRevision: '1827003',
    fileName: '[1]新物品表.xlsm',
  });
});

test('parseCliArgsFromArgv ignores runtime switches in packaged second-instance launches', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    '--original-process-start-time=12345',
    String.raw`C:\Temp\left.txt`,
    String.raw`C:\Temp\right.txt`,
    'left.txt',
    'right.txt',
    'svn://repo/A/left.txt',
    'svn://repo/B/right.txt',
    '100',
    '200',
    '200',
    '',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Temp\left.txt`,
    minePath: String.raw`C:\Temp\right.txt`,
    baseName: 'left.txt',
    mineName: 'right.txt',
    baseUrl: 'svn://repo/A/left.txt',
    mineUrl: 'svn://repo/B/right.txt',
    baseRevision: '100',
    mineRevision: '200',
    pegRevision: '200',
    fileName: '',
  });
});

test('parseCliArgsFromArgv supports 6-argument fallback for pure viewer launches', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    String.raw`C:\Temp\base.txt`,
    String.raw`C:\Temp\mine.txt`,
    'base-name',
    'mine-name',
    'mine.txt',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Temp\base.txt`,
    minePath: String.raw`C:\Temp\mine.txt`,
    baseName: 'base-name',
    mineName: 'mine-name',
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName: 'mine.txt',
  });
});

test('parseCliArgsFromArgv keeps remote url when 6-argument fallback includes one', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    String.raw`C:\Temp\base.txt`,
    String.raw`C:\Temp\mine.txt`,
    'base-name',
    'mine-name',
    'http://repo/path/file.txt',
    'file.txt',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Temp\base.txt`,
    minePath: String.raw`C:\Temp\mine.txt`,
    baseName: 'base-name',
    mineName: 'mine-name',
    baseUrl: '',
    mineUrl: 'http://repo/path/file.txt',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName: 'file.txt',
  });
});

test('parseCliArgsFromArgv accepts sparse second-instance arguments with omitted empty slots', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    '--allow-file-access-from-files',
    String.raw`C:\Repo\[1]新物品表.xlsm`,
    String.raw`C:\Repo\[1]新物品表.xlsm`,
    '[1]新物品表.xlsm',
    '[1]新物品表.xlsm',
    'UNSPECIFIED',
    'UNSPECIFIED',
    'UNSPECIFIED',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Repo\[1]新物品表.xlsm`,
    minePath: String.raw`C:\Repo\[1]新物品表.xlsm`,
    baseName: '[1]新物品表.xlsm',
    mineName: '[1]新物品表.xlsm',
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName: '',
  });
});

test('parseCliArgsFromArgv normalizes UNSPECIFIED placeholders in the full protocol', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    String.raw`C:\Repo\[1]新物品表.xlsm`,
    String.raw`C:\Repo\[1]新物品表.xlsm`,
    '[1]新物品表.xlsm',
    '[1]新物品表.xlsm',
    '',
    '',
    'UNSPECIFIED',
    'UNSPECIFIED',
    'UNSPECIFIED',
    '',
  ], EXEC_PATH);

  assert.deepEqual(parsed, {
    basePath: String.raw`C:\Repo\[1]新物品表.xlsm`,
    minePath: String.raw`C:\Repo\[1]新物品表.xlsm`,
    baseName: '[1]新物品表.xlsm',
    mineName: '[1]新物品表.xlsm',
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName: '',
  });
});

test('parseCliArgsFromArgv returns null when no usable diff paths were passed', () => {
  const parsed = parseCliArgsFromArgv([EXEC_PATH], EXEC_PATH);

  assert.equal(parsed, null);
  assert.equal(EMPTY_CLI_ARGS.fileName, '');
});

test('parseCliArgsFromArgv ignores dev app entry after Electron runtime switches', () => {
  const parsed = parseCliArgsFromArgv([
    EXEC_PATH,
    '--allow-file-access-from-files',
    '--disk-cache-dir=C:\\Users\\tester\\AppData\\Local\\Temp\\cache',
    '--disk-cache-size=268435456',
    '.',
  ], EXEC_PATH);

  assert.equal(parsed, null);
});
