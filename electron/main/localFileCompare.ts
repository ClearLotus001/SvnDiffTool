import * as path from 'node:path';

export type LocalFileCompareValidationIssue =
  | 'missing-files'
  | 'same-file'
  | 'type-mismatch';

export interface LocalFileComparePaths {
  basePath: string;
  minePath: string;
}

function normalizePathForEquality(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

export function getComparableFileExtension(filePath: string): string {
  return path.extname(filePath.trim()).toLocaleLowerCase('en-US');
}

export function resolveLocalFileComparePaths(
  basePath: string,
  minePath: string,
): LocalFileComparePaths {
  return {
    basePath: basePath.trim(),
    minePath: minePath.trim(),
  };
}

export function getLocalFileCompareValidationIssue({
  basePath,
  minePath,
}: LocalFileComparePaths): LocalFileCompareValidationIssue | null {
  if (!basePath || !minePath) return 'missing-files';
  if (normalizePathForEquality(basePath) === normalizePathForEquality(minePath)) {
    return 'same-file';
  }
  if (getComparableFileExtension(basePath) !== getComparableFileExtension(minePath)) {
    return 'type-mismatch';
  }
  return null;
}
