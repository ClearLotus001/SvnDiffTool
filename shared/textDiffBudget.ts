export interface TextCharDiffBudget {
  remainingPairs: number;
  remainingChars: number;
}

const CHAR_DIFF_LINE_LIMIT = 1000;
const MAX_CHAR_DIFF_PAIRS_PER_BLOCK = 240;
const MAX_TOTAL_CHAR_DIFF_PAIRS = 1_500;
const MAX_TOTAL_CHAR_DIFF_CHARS = 250_000;

export function createTextCharDiffBudget(): TextCharDiffBudget {
  return { remainingPairs: MAX_TOTAL_CHAR_DIFF_PAIRS, remainingChars: MAX_TOTAL_CHAR_DIFF_CHARS };
}

export function shouldComputeTextCharDiff(
  baseLine: string,
  mineLine: string,
  replacementPairIndex: number,
  budget: TextCharDiffBudget,
): boolean {
  if (replacementPairIndex >= MAX_CHAR_DIFF_PAIRS_PER_BLOCK) return false;
  if (baseLine.length > CHAR_DIFF_LINE_LIMIT || mineLine.length > CHAR_DIFF_LINE_LIMIT) return false;
  const charCount = baseLine.length + mineLine.length;
  if (budget.remainingPairs <= 0 || budget.remainingChars < charCount) return false;
  budget.remainingPairs -= 1;
  budget.remainingChars -= charCount;
  return true;
}
