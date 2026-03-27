import type { DiffLine, WorkbookCompareMode } from '@/types';
import { computeWorkbookDiff } from '@/engine/workbook/workbookDiff';

export function computeWorkbookDiffAsync(
  baseText: string,
  mineText: string,
  compareMode: WorkbookCompareMode = 'strict',
): Promise<DiffLine[]> {
  return Promise.resolve(computeWorkbookDiff(baseText, mineText, compareMode));
}
