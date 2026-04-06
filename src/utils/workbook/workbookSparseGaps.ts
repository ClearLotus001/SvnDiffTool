export interface WorkbookSparseGapItem {
  kind: 'sparse-gap';
  rowNumberStart: number;
  rowNumberEnd: number;
  count: number;
}

export interface WorkbookSparseRowRange {
  rowNumberStart: number;
  rowNumberEnd: number;
}

export function createWorkbookSparseGapItem(
  rowNumberStart: number,
  rowNumberEnd: number,
): WorkbookSparseGapItem | null {
  if (rowNumberEnd < rowNumberStart) return null;
  return {
    kind: 'sparse-gap',
    rowNumberStart,
    rowNumberEnd,
    count: rowNumberEnd - rowNumberStart + 1,
  };
}

export function injectWorkbookSparseGapItems<TItem>(
  items: TItem[],
  options: {
    firstExpectedRowNumber: number;
    resolveRowRange: (item: TItem) => WorkbookSparseRowRange | null;
  },
): Array<TItem | WorkbookSparseGapItem> {
  const next: Array<TItem | WorkbookSparseGapItem> = [];
  let previousRowNumberEnd = Math.max(0, options.firstExpectedRowNumber - 1);

  items.forEach((item) => {
    const range = options.resolveRowRange(item);
    if (range && range.rowNumberStart > previousRowNumberEnd + 1) {
      const gapItem = createWorkbookSparseGapItem(
        previousRowNumberEnd + 1,
        range.rowNumberStart - 1,
      );
      if (gapItem) next.push(gapItem);
    }

    next.push(item);

    if (range) {
      previousRowNumberEnd = Math.max(previousRowNumberEnd, range.rowNumberEnd);
    }
  });

  return next;
}

export function isWorkbookSparseGapItem(
  value: unknown,
): value is WorkbookSparseGapItem {
  return Boolean(
    value
    && typeof value === 'object'
    && 'kind' in value
    && (value as { kind?: unknown }).kind === 'sparse-gap',
  );
}
