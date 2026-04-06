import type {
  Hunk,
  SplitRow,
  WorkbookCellDelta,
  WorkbookCompareMode,
  WorkbookSelectedCell,
} from '@/types';
import type { WorkbookPerfDebugStats } from '@/components/workbook/WorkbookPerfDebugPanel';
import type { WorkbookMiniMapDebugStats } from '@/components/workbook/WorkbookMiniMap';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import type {
  WorkbookMiniMapSegment,
  WorkbookMiniMapPaintTone,
  WorkbookMiniMapTone,
} from '@/components/workbook/WorkbookMiniMap';
import {
  buildWorkbookRowEntry,
  getWorkbookSideRowNumber,
  type WorkbookRowEntry,
} from '@/utils/workbook/workbookNavigation';

export const WORKBOOK_CONTEXT_LINES = 3;

export interface WorkbookRowEntryMaps {
  base: Map<number, WorkbookRowEntry>;
  mine: Map<number, WorkbookRowEntry>;
}

export interface WorkbookCompareCellsMaps {
  base: Map<number, Map<number, WorkbookCellDelta>>;
  mine: Map<number, Map<number, WorkbookCellDelta>>;
}

const workbookRowEntryMapsCache = new WeakMap<SplitRow[], Map<string, WorkbookRowEntryMaps>>();
const workbookCompareCellsMapsCache = new WeakMap<SplitRow[], Map<string, WorkbookCompareCellsMaps>>();

export function workbookRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

export function workbookRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

export function isEqualWorkbookRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

export function rowTouchesGuidedHunk(row: SplitRow, guidedHunkRange: Hunk | null): boolean {
  if (!guidedHunkRange) return false;
  return row.lineIdxs.some(idx => idx >= guidedHunkRange.startIdx && idx <= guidedHunkRange.endIdx);
}

export function getWorkbookRowKey(row: SplitRow): string {
  return row.lineIdxs.length > 0 ? row.lineIdxs.join(':') : String(row.lineIdx);
}

export function buildSelectionAutoScrollKey(
  sheetName: string,
  selection: WorkbookSelectedCell | null,
): string {
  if (!selection) return '';
  return [
    sheetName,
    selection.kind,
    selection.side,
    selection.rowNumber,
    selection.colIndex,
  ].join(':');
}

export function getWorkbookMiniMapTone(
  row: SplitRow,
  visibleColumns: number[],
  compareMode: WorkbookCompareMode,
): WorkbookMiniMapTone {
  return getWorkbookMiniMapDescriptor(row, visibleColumns, compareMode).tone;
}

export function getWorkbookMiniMapDescriptor(
  row: SplitRow,
  visibleColumns: number[],
  compareMode: WorkbookCompareMode,
): { tone: WorkbookMiniMapTone; tones: WorkbookMiniMapPaintTone[] } {
  const rowDelta = buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode);
  let sawAdd = false;
  let sawDelete = false;
  let sawModify = false;
  let sawStrictOnly = false;

  rowDelta.cellDeltas.forEach((delta) => {
    if (!delta.changed) return;
    if (delta.strictOnly) {
      sawStrictOnly = true;
      return;
    }
    if (delta.kind === 'add') {
      sawAdd = true;
      return;
    }
    if (delta.kind === 'delete') {
      sawDelete = true;
      return;
    }
    sawModify = true;
  });

  const tones: WorkbookMiniMapPaintTone[] = [];
  if (sawDelete) tones.push('delete');
  if (sawModify) tones.push('modify');
  if (sawAdd) tones.push('add');
  if (sawStrictOnly) tones.push('strict-only');

  if (tones.length === 0) {
    return { tone: 'equal', tones };
  }
  if (tones.length === 1) {
    return { tone: tones[0]!, tones };
  }
  return { tone: 'mixed', tones };
}

function mergeWorkbookMiniMapTone(
  left: WorkbookMiniMapTone,
  right: WorkbookMiniMapTone,
): WorkbookMiniMapTone {
  if (left === 'equal') return right;
  if (right === 'equal') return left;
  if (left === right) return left;
  return 'mixed';
}

export function buildWorkbookRowEntryMaps(
  rows: SplitRow[],
  sheetName: string,
  baseVersion: string,
  mineVersion: string,
  visibleColumns: number[],
): WorkbookRowEntryMaps {
  let cacheByRows = workbookRowEntryMapsCache.get(rows);
  if (!cacheByRows) {
    cacheByRows = new Map();
    workbookRowEntryMapsCache.set(rows, cacheByRows);
  }

  const cacheKey = [
    sheetName,
    baseVersion,
    mineVersion,
    visibleColumns.join(','),
  ].join('::');
  const cached = cacheByRows.get(cacheKey);
  if (cached) return cached;

  const next: WorkbookRowEntryMaps = {
    base: new Map<number, WorkbookRowEntry>(),
    mine: new Map<number, WorkbookRowEntry>(),
  };

  rows.forEach((row) => {
    const baseEntry = buildWorkbookRowEntry(row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(row, 'mine', sheetName, mineVersion, visibleColumns);
    if (baseEntry) next.base.set(baseEntry.rowNumber, baseEntry);
    if (mineEntry) next.mine.set(mineEntry.rowNumber, mineEntry);
  });

  cacheByRows.set(cacheKey, next);
  return next;
}

export function buildWorkbookCompareCellsMaps(
  rows: SplitRow[],
  visibleColumns: number[],
  compareMode: WorkbookCompareMode,
): WorkbookCompareCellsMaps {
  let cacheByRows = workbookCompareCellsMapsCache.get(rows);
  if (!cacheByRows) {
    cacheByRows = new Map();
    workbookCompareCellsMapsCache.set(rows, cacheByRows);
  }

  const cacheKey = `${compareMode}::${visibleColumns.join(',')}`;
  const cached = cacheByRows.get(cacheKey);
  if (cached) return cached;

  const next: WorkbookCompareCellsMaps = {
    base: new Map<number, Map<number, WorkbookCellDelta>>(),
    mine: new Map<number, Map<number, WorkbookCellDelta>>(),
  };

  rows.forEach((row) => {
    const rowDelta = buildWorkbookSplitRowCompareState(row, visibleColumns, compareMode);
    const baseRowNumber = getWorkbookSideRowNumber(row, 'base');
    if (baseRowNumber != null) next.base.set(baseRowNumber, rowDelta.cellDeltas);

    const mineRowNumber = getWorkbookSideRowNumber(row, 'mine');
    if (mineRowNumber != null) next.mine.set(mineRowNumber, rowDelta.cellDeltas);
  });

  cacheByRows.set(cacheKey, next);
  return next;
}

export function buildWorkbookNavigationRows(
  sheetName: string | null,
  selectedCell: WorkbookSelectedCell | null,
  frozenRows: SplitRow[],
  bodyRows: SplitRow[],
  baseVersion: string,
  mineVersion: string,
  visibleColumns: number[],
): WorkbookRowEntry[] {
  if (!sheetName || !selectedCell) return [];

  const sourceRows = [
    ...frozenRows,
    ...bodyRows,
  ];

  return sourceRows.flatMap((row) => {
    const entries: WorkbookRowEntry[] = [];
    const baseEntry = buildWorkbookRowEntry(row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(row, 'mine', sheetName, mineVersion, visibleColumns);
    if (baseEntry) entries.push(baseEntry);
    if (mineEntry) entries.push(mineEntry);
    return entries;
  });
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export interface WorkbookMiniMapEntry {
  tone: WorkbookMiniMapTone;
  tones?: WorkbookMiniMapPaintTone[];
  height: number;
  lineIdxs: number[];
}

export interface BuildWorkbookMiniMapStateParams<TItem> {
  headerHeight?: number;
  activeSearchLineIdx: number;
  compareMode: WorkbookCompareMode;
  frozenRows: SplitRow[];
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsViewportHeight: number;
  items: TItem[];
  searchMatchSet: ReadonlySet<number>;
  visibleColumns: number[];
  resolveRowHeight: (row: SplitRow) => number;
  resolveItemEntry: (item: TItem, index: number) => WorkbookMiniMapEntry;
}

export function buildWorkbookMiniMapState<TItem>({
  headerHeight = 0,
  activeSearchLineIdx,
  compareMode,
  frozenRows,
  frozenRowsViewportIsOverflowing,
  frozenRowsViewportHeight,
  items,
  searchMatchSet,
  visibleColumns,
  resolveRowHeight,
  resolveItemEntry,
}: BuildWorkbookMiniMapStateParams<TItem>): { value: WorkbookMiniMapSegment[]; duration: number } {
  const start = getNow();
  const segments: WorkbookMiniMapSegment[] = [];
  const segmentHasSearchHit = (lineIdxs: number[]) => lineIdxs.some((idx) => searchMatchSet.has(idx));
  const segmentHasActiveSearchHit = (lineIdxs: number[]) => lineIdxs.includes(activeSearchLineIdx);

  if (headerHeight > 0) {
    segments.push({ tone: 'equal', height: headerHeight });
  }

  if (frozenRowsViewportIsOverflowing) {
    const frozenDescriptors = frozenRows.map((row) => getWorkbookMiniMapDescriptor(row, visibleColumns, compareMode));
    const frozenTone = frozenDescriptors.reduce<WorkbookMiniMapTone>(
      (mergedTone, descriptor) => mergeWorkbookMiniMapTone(mergedTone, descriptor.tone),
      'equal',
    );
    const frozenTones = [...new Set(
      frozenDescriptors.flatMap((descriptor) => descriptor.tones),
    )];
    segments.push({
      tone: frozenTone,
      tones: frozenTones,
      height: frozenRowsViewportHeight,
      searchHit: frozenRows.some((row) => segmentHasSearchHit(row.lineIdxs)),
      activeSearchHit: frozenRows.some((row) => segmentHasActiveSearchHit(row.lineIdxs)),
    });
  } else {
    frozenRows.forEach((row) => {
      const descriptor = getWorkbookMiniMapDescriptor(row, visibleColumns, compareMode);
      segments.push({
        tone: descriptor.tone,
        tones: descriptor.tones,
        height: resolveRowHeight(row),
        searchHit: segmentHasSearchHit(row.lineIdxs),
        activeSearchHit: segmentHasActiveSearchHit(row.lineIdxs),
      });
    });
  }

  items.forEach((item, index) => {
    const entry = resolveItemEntry(item, index);
    segments.push({
      tone: entry.tone,
      ...(entry.tones ? { tones: entry.tones } : {}),
      height: entry.height,
      searchHit: segmentHasSearchHit(entry.lineIdxs),
      activeSearchHit: segmentHasActiveSearchHit(entry.lineIdxs),
    });
  });

  return {
    value: segments,
    duration: getNow() - start,
  };
}

export interface BuildWorkbookPerfStatsParams {
  panel: WorkbookPerfDebugStats['panel'];
  sheetName: string;
  totalRows: number;
  renderedRows: number;
  collapseBlocks: number;
  totalColumns: number;
  renderedColumns: number;
  frozenRows: number;
  frozenColumns: number;
  collapsedItemsDuration: number;
  hiddenRowNumberCount: number;
  renderItemsDuration: number;
  itemsDuration: number;
  hiddenRows: number;
  miniMapDuration: number;
  rowWindowMs: number;
  rowWindowUpdates: number;
  rowOverscan: number;
  rowViewport: number;
  columnWindowMs: number;
  columnWindowUpdates: number;
  columnOverscan: number;
  columnViewport: number;
  miniMapDebug: WorkbookMiniMapDebugStats | null;
  scrollSyncCount: number;
  frozenRowsViewport: number;
  frozenRowsTotalSize: number;
  frozenRowsOverflow: boolean;
  frozenColumnsViewport: number;
  frozenColumnsTotalSize: number;
  frozenColumnsOverflow: boolean;
  frozenColumnsScrollLeft: number;
}

export function buildWorkbookPerfStats({
  panel,
  sheetName,
  totalRows,
  renderedRows,
  collapseBlocks,
  totalColumns,
  renderedColumns,
  frozenRows,
  frozenColumns,
  collapsedItemsDuration,
  hiddenRowNumberCount,
  renderItemsDuration,
  itemsDuration,
  hiddenRows,
  miniMapDuration,
  rowWindowMs,
  rowWindowUpdates,
  rowOverscan,
  rowViewport,
  columnWindowMs,
  columnWindowUpdates,
  columnOverscan,
  columnViewport,
  miniMapDebug,
  scrollSyncCount,
  frozenRowsViewport,
  frozenRowsTotalSize,
  frozenRowsOverflow,
  frozenColumnsViewport,
  frozenColumnsTotalSize,
  frozenColumnsOverflow,
  frozenColumnsScrollLeft,
}: BuildWorkbookPerfStatsParams): WorkbookPerfDebugStats {
  return {
    panel,
    sheetName,
    totalRows,
    renderedRows,
    collapseBlocks,
    totalColumns,
    renderedColumns,
    frozenRows,
    frozenColumns,
    buildItemsMs: collapsedItemsDuration
      + (hiddenRowNumberCount > 0 ? renderItemsDuration : 0)
      + itemsDuration,
    collapseBuildMs: collapsedItemsDuration,
    hiddenOverlayMs: hiddenRowNumberCount > 0 ? renderItemsDuration : 0,
    hiddenRows,
    miniMapMs: miniMapDuration,
    rowWindowMs,
    rowWindowUpdates,
    rowOverscan,
    rowViewport,
    columnWindowMs,
    columnWindowUpdates,
    columnOverscan,
    columnViewport,
    miniMapClickMs: miniMapDebug?.lastClickMs ?? 0,
    miniMapClickCount: miniMapDebug?.clickCount ?? 0,
    scrollSyncCount,
    frozenRowsViewport,
    frozenRowsTotalSize,
    frozenRowsOverflow,
    frozenColumnsViewport,
    frozenColumnsTotalSize,
    frozenColumnsOverflow,
    frozenColumnsScrollLeft,
  };
}

export interface SelectionAutoScrollLock {
  sheetName: string;
  hunkIdx: number;
  rowKey: string;
  cellKey: string;
}
