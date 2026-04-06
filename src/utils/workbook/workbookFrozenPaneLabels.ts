import type { SplitRow } from '@/types';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { getWorkbookColumnLabel } from '@/utils/workbook/workbookSections';
import {
  getWorkbookSideRowNumber,
  getWorkbookSplitRowNumber,
} from '@/utils/workbook/workbookNavigation';

export function formatWorkbookFrozenColumnRangeLabel(
  entries: HorizontalVirtualColumnEntry[],
  frozenCount: number,
): string {
  const frozenEntries = entries
    .filter((entry) => entry.position < frozenCount)
    .sort((left, right) => left.position - right.position);

  const first = frozenEntries[0];
  const last = frozenEntries[frozenEntries.length - 1];
  if (!first || !last) return '—';

  const firstLabel = getWorkbookColumnLabel(first.column);
  const lastLabel = getWorkbookColumnLabel(last.column);
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} ~ ${lastLabel}`;
}

export function formatWorkbookFrozenRowRangeLabel(
  rows: SplitRow[],
  side?: 'base' | 'mine',
): string {
  const rowNumbers = rows
    .map((row) => (
      side
        ? getWorkbookSideRowNumber(row, side)
        : getWorkbookSplitRowNumber(row)
    ))
    .filter((rowNumber): rowNumber is number => rowNumber != null);

  const first = rowNumbers[0];
  const last = rowNumbers[rowNumbers.length - 1];
  if (first == null || last == null) return '—';
  return first === last ? `R${first}` : `R${first} ~ R${last}`;
}
