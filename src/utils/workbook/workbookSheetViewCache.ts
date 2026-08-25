import type { SplitRow } from '@/types';
import {
  buildCollapsibleRowBlocks,
  describeCollapsedRowBlocks,
  type CollapsibleRowBlock,
  type CollapsedRowBlockDescriptor,
} from '@/utils/collapse/collapsibleRows';
import { getWorkbookStackedRenderMode } from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookCacheSignature,
  getWorkbookSharedCacheBucket,
  getWorkbookSharedCacheEntry,
  setWorkbookSharedCacheEntry,
} from '@/utils/workbook/workbookSharedCache';

export interface WorkbookCollapsibleSheetView {
  visibleRows: SplitRow[];
  rowBlocks: CollapsibleRowBlock<SplitRow>[];
  collapsedRowDescriptors: CollapsedRowBlockDescriptor<SplitRow>[];
}

const workbookCollapsibleSheetViewCache = new WeakMap<SplitRow[], Map<string, WorkbookCollapsibleSheetView>>();
const workbookSectionEffectivelyEqualCache = new WeakMap<SplitRow[], boolean>();

function buildWorkbookHiddenLineSignature(hiddenLineIdxSet: ReadonlySet<number>): string {
  if (hiddenLineIdxSet.size === 0) return '';
  return [...hiddenLineIdxSet].sort((left, right) => left - right).join(',');
}

export function buildWorkbookProtectedLineSignature(protectedLineIdxSet: ReadonlySet<number>): string {
  if (protectedLineIdxSet.size === 0) return '';
  return [...protectedLineIdxSet].sort((left, right) => left - right).join(',');
}

export function getWorkbookCollapsibleSheetView(params: {
  sectionRows: SplitRow[];
  sheetName: string;
  hiddenLineIdxSet?: ReadonlySet<number>;
  protectedLineIdxSet?: ReadonlySet<number>;
  showOnlyDifferences?: boolean;
  contextLines: number;
  blockPrefix: string;
  equalityStrategyKey: string;
  isEqualRow: (row: SplitRow) => boolean;
}): WorkbookCollapsibleSheetView {
  const {
    sectionRows,
    sheetName,
    hiddenLineIdxSet = new Set<number>(),
    protectedLineIdxSet = new Set<number>(),
    showOnlyDifferences = false,
    contextLines,
    blockPrefix,
    equalityStrategyKey,
    isEqualRow,
  } = params;

  const cacheByRows = getWorkbookSharedCacheBucket(
    workbookCollapsibleSheetViewCache,
    sectionRows,
  );

  const cacheKey = buildWorkbookCacheSignature([
    sheetName,
    contextLines,
    blockPrefix,
    equalityStrategyKey,
    showOnlyDifferences,
    buildWorkbookHiddenLineSignature(hiddenLineIdxSet),
    buildWorkbookProtectedLineSignature(protectedLineIdxSet),
  ]);
  const cached = getWorkbookSharedCacheEntry(cacheByRows, cacheKey);
  if (cached) return cached;

  const visibleRows = sectionRows.filter((row) => {
    if (row.lineIdxs.some((lineIdx) => hiddenLineIdxSet.has(lineIdx))) return false;
    if (!showOnlyDifferences || !isEqualRow(row)) return true;
    return row.lineIdxs.some((lineIdx) => protectedLineIdxSet.has(lineIdx));
  });
  const rowBlocks = buildCollapsibleRowBlocks(
    visibleRows,
    (row) => !row.lineIdxs.some((lineIdx) => protectedLineIdxSet.has(lineIdx)) && isEqualRow(row),
  );
  const collapsedRowDescriptors = describeCollapsedRowBlocks(rowBlocks, {
    contextLines,
    blockPrefix,
  });

  const nextValue = {
    visibleRows,
    rowBlocks,
    collapsedRowDescriptors,
  };
  setWorkbookSharedCacheEntry(cacheByRows, cacheKey, nextValue);
  return nextValue;
}

export function isWorkbookSectionEffectivelyEqual(rows: SplitRow[]): boolean {
  const cached = workbookSectionEffectivelyEqualCache.get(rows);
  if (cached != null) return cached;

  const nextValue = rows.length > 0
    && rows.every((row) => getWorkbookStackedRenderMode(row) === 'single-equal');

  workbookSectionEffectivelyEqualCache.set(rows, nextValue);
  return nextValue;
}
