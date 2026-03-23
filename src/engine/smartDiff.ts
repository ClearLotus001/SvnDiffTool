import type { DiffLine } from '../types';
import { computeDiff } from './diff';
import { computeWorkbookDiff, isWorkbookText } from './workbookDiff';

export function computeSmartDiff(baseText: string, mineText: string): DiffLine[] {
  if (isWorkbookText(baseText) && isWorkbookText(mineText)) {
    return computeWorkbookDiff(baseText, mineText);
  }

  return computeDiff(baseText, mineText);
}
