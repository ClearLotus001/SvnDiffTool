import type { CompareContext } from '@/types';

function normalizeComparableFilePath(filePath: string): string {
  return filePath
    .trim()
    .replaceAll('/', '\\')
    .replace(/\\+$/g, '')
    .toLocaleLowerCase('en-US');
}

export function shouldOpenTwoFilePicker(params: {
  compareContext: CompareContext;
  basePath: string;
  minePath: string;
}): boolean {
  if (params.compareContext !== 'literal_two_file_compare') return false;

  const basePath = normalizeComparableFilePath(params.basePath);
  const minePath = normalizeComparableFilePath(params.minePath);
  return Boolean(basePath && minePath && basePath !== minePath);
}
