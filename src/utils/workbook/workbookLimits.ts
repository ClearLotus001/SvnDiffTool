const MAX_WORKBOOK_ROW_NUMBER = 1_048_576;
const MAX_WORKBOOK_COLUMN_COUNT = 16_384;

function parsePositiveInteger(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const normalized = Math.trunc(num);
  return normalized >= 1 ? normalized : null;
}

export function normalizeWorkbookRowNumber(
  value: unknown,
  fallbackRowNumber: number,
): number {
  const parsed = parsePositiveInteger(value);
  if (parsed == null || parsed > MAX_WORKBOOK_ROW_NUMBER) {
    return Math.max(1, Math.min(MAX_WORKBOOK_ROW_NUMBER, Math.trunc(fallbackRowNumber) || 1));
  }
  return parsed;
}

function parseWorkbookColumnNumberFromLetters(letters: string): number | null {
  if (!letters) return null;

  let value = 0;
  for (let index = 0; index < letters.length; index += 1) {
    const code = letters.charCodeAt(index);
    if (code < 65 || code > 90) return null;
    value = (value * 26) + (code - 64);
    if (value > MAX_WORKBOOK_COLUMN_COUNT) return null;
  }

  return value;
}

export function parseWorkbookColumnIndexFromCellRef(cellRef: string): number | null {
  const letters = cellRef.toUpperCase().match(/[A-Z]+/)?.[0] ?? '';
  const columnNumber = parseWorkbookColumnNumberFromLetters(letters);
  return columnNumber == null ? null : (columnNumber - 1);
}

export function parseWorkbookRowNumberFromCellRef(cellRef: string): number | null {
  const parsed = parsePositiveInteger(cellRef.match(/\d+/)?.[0] ?? '');
  if (parsed == null || parsed > MAX_WORKBOOK_ROW_NUMBER) return null;
  return parsed;
}

export function normalizeWorkbookColumnRange(
  minValue: unknown,
  maxValue: unknown,
): { min: number; max: number } | null {
  const min = parsePositiveInteger(minValue);
  const max = parsePositiveInteger(maxValue);
  if (min == null || max == null) return null;
  if (min > MAX_WORKBOOK_COLUMN_COUNT) return null;

  const normalizedMax = Math.min(MAX_WORKBOOK_COLUMN_COUNT, Math.max(min, max));
  return {
    min,
    max: normalizedMax,
  };
}
