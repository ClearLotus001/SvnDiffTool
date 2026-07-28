import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getComparableFileExtension,
  getLocalFileCompareValidationIssue,
  resolveLocalFileComparePaths,
} from '../electron/main/localFileCompare';

test('local file compare trims paths and accepts matching workbook extensions', () => {
  const paths = resolveLocalFileComparePaths(
    ' C:\\branches\\main\\Catalog.xlsx ',
    ' C:\\branches\\feature\\Catalog.xlsx ',
  );

  assert.deepEqual(paths, {
    basePath: 'C:\\branches\\main\\Catalog.xlsx',
    minePath: 'C:\\branches\\feature\\Catalog.xlsx',
  });
  assert.equal(getLocalFileCompareValidationIssue(paths), null);
});

test('local file compare accepts text files with the same case-insensitive extension', () => {
  const paths = resolveLocalFileComparePaths(
    'C:\\branches\\main\\config.TS',
    'C:\\branches\\feature\\config.ts',
  );

  assert.equal(getComparableFileExtension(paths.basePath), '.ts');
  assert.equal(getLocalFileCompareValidationIssue(paths), null);
});

test('local file compare requires both paths', () => {
  assert.equal(
    getLocalFileCompareValidationIssue(resolveLocalFileComparePaths('', 'mine.xlsx')),
    'missing-files',
  );
});

test('local file compare rejects files with different extensions', () => {
  assert.equal(
    getLocalFileCompareValidationIssue(resolveLocalFileComparePaths('base.ts', 'mine.json')),
    'type-mismatch',
  );
  assert.equal(
    getLocalFileCompareValidationIssue(resolveLocalFileComparePaths('base.xlsx', 'mine.xlsm')),
    'type-mismatch',
  );
});

test('local file compare accepts two extensionless files', () => {
  assert.equal(
    getLocalFileCompareValidationIssue(resolveLocalFileComparePaths('branch-a\\Dockerfile', 'branch-b\\Dockerfile')),
    null,
  );
});

test('local file compare rejects the same file on both sides', () => {
  assert.equal(
    getLocalFileCompareValidationIssue(resolveLocalFileComparePaths(
      'C:\\branch\\Catalog.xlsx',
      'C:\\branch\\Catalog.xlsx',
    )),
    'same-file',
  );
});
