import type { WorkbookSelectedCell } from '../types';

export function getWorkbookRowScopedSelection(
  selection: WorkbookSelectedCell | null,
  sheetName: string,
  rowNumber: number | null,
  visibleColumns: number[],
): WorkbookSelectedCell | null {
  if (!selection || selection.sheetName !== sheetName) return null;

  if (selection.kind === 'column') {
    return visibleColumns.length === 0 || visibleColumns.includes(selection.colIndex)
      ? selection
      : null;
  }

  if (rowNumber == null) return null;
  return selection.rowNumber === rowNumber ? selection : null;
}

export function buildWorkbookSelectionSelector(selection: WorkbookSelectedCell): string | null {
  if (selection.kind === 'row') return null;

  if (selection.kind === 'column') {
    return `[data-workbook-role="column-header"][data-workbook-side="${selection.side}"][data-workbook-col="${selection.colIndex}"]`;
  }

  return `[data-workbook-role="cell"][data-workbook-side="${selection.side}"][data-workbook-row="${selection.rowNumber}"][data-workbook-col="${selection.colIndex}"]`;
}

export function ensureElementVisibleHorizontally(
  container: HTMLElement,
  element: HTMLElement,
  stickyOffset = 0,
  padding = 12,
): boolean {
  if (container.clientWidth <= 0) return false;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const clampedStickyOffset = Math.max(
    0,
    Math.min(stickyOffset, Math.max(0, container.clientWidth - padding)),
  );
  const leftBoundary = containerRect.left + clampedStickyOffset + padding;
  const rightBoundary = containerRect.right - padding;
  let nextScrollLeft = container.scrollLeft;

  if (elementRect.left < leftBoundary) {
    nextScrollLeft -= leftBoundary - elementRect.left;
  } else if (elementRect.right > rightBoundary) {
    nextScrollLeft += elementRect.right - rightBoundary;
  }

  const boundedScrollLeft = Math.max(
    0,
    Math.min(nextScrollLeft, container.scrollWidth - container.clientWidth),
  );

  if (Math.abs(boundedScrollLeft - container.scrollLeft) < 1) return false;
  container.scrollLeft = boundedScrollLeft;
  return true;
}
