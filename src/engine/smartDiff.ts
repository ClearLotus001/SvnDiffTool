import type { DiffLine, WorkbookCompareMode } from '../types';
import { computeDiff } from './diff';
import { computeWorkbookDiff, isWorkbookText } from './workbookDiff';

export function computeSmartDiff(
  baseText: string,
  mineText: string,
  compareMode: WorkbookCompareMode = 'strict',
): DiffLine[] {
  if (isWorkbookText(baseText) && isWorkbookText(mineText)) {
    return computeWorkbookDiff(baseText, mineText, compareMode);
  }

  return computeDiff(baseText, mineText);
}
