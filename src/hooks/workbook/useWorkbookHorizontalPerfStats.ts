import { useMemo, type MutableRefObject } from 'react';

import type { WorkbookPerfDebugStats } from '@/components/workbook/WorkbookPerfDebugPanel';
import type { WorkbookMiniMapDebugStats } from '@/components/workbook/WorkbookMiniMap';
import type { WorkbookHorizontalRenderItem } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { buildWorkbookPerfStats } from '@/utils/workbook/workbookPanelHelpers';

interface UseWorkbookHorizontalPerfStatsParams {
  activeSheetName: string;
  items: WorkbookHorizontalRenderItem[];
  startIdx: number;
  endIdx: number;
  totalColumns: number;
  renderedColumns: number;
  frozenRowsCount: number;
  freezeColumnCount: number;
  collapsedItemsDuration: number;
  hiddenRowNumberCount: number;
  renderItemsDuration: number;
  itemsDuration: number;
  hiddenRowsCount: number;
  miniMapDuration: number;
  rowWindowMs: number;
  rowWindowUpdates: number;
  rowOverscan: number;
  rowViewport: number;
  columnWindowMs: number;
  columnWindowUpdates: number;
  columnOverscan: number;
  columnViewport: number;
  miniMapDebugRef: MutableRefObject<WorkbookMiniMapDebugStats | null>;
  scrollSyncCount: number;
  frozenRowsViewportHeight: number;
  frozenRowsHeight: number;
  frozenRowsOverflow: boolean;
  frozenColumnsViewport: number;
  frozenColumnsTotalSize: number;
  frozenColumnsOverflow: boolean;
  frozenColumnsScrollLeft: number;
}

export function useWorkbookHorizontalPerfStats({
  activeSheetName,
  items,
  startIdx,
  endIdx,
  totalColumns,
  renderedColumns,
  frozenRowsCount,
  freezeColumnCount,
  collapsedItemsDuration,
  hiddenRowNumberCount,
  renderItemsDuration,
  itemsDuration,
  hiddenRowsCount,
  miniMapDuration,
  rowWindowMs,
  rowWindowUpdates,
  rowOverscan,
  rowViewport,
  columnWindowMs,
  columnWindowUpdates,
  columnOverscan,
  columnViewport,
  miniMapDebugRef,
  scrollSyncCount,
  frozenRowsViewportHeight,
  frozenRowsHeight,
  frozenRowsOverflow,
  frozenColumnsViewport,
  frozenColumnsTotalSize,
  frozenColumnsOverflow,
  frozenColumnsScrollLeft,
}: UseWorkbookHorizontalPerfStatsParams): WorkbookPerfDebugStats {
  return useMemo(() => buildWorkbookPerfStats({
    panel: 'horizontal',
    sheetName: activeSheetName,
    totalRows: items.length,
    renderedRows: Math.max(0, endIdx - startIdx),
    collapseBlocks: items.filter(item => item.kind === 'split-collapse').length,
    totalColumns,
    renderedColumns,
    frozenRows: frozenRowsCount,
    frozenColumns: freezeColumnCount,
    collapsedItemsDuration,
    hiddenRowNumberCount,
    renderItemsDuration,
    itemsDuration,
    hiddenRows: hiddenRowsCount,
    miniMapDuration,
    rowWindowMs,
    rowWindowUpdates,
    rowOverscan,
    rowViewport,
    columnWindowMs,
    columnWindowUpdates,
    columnOverscan,
    columnViewport,
    miniMapDebug: miniMapDebugRef.current,
    scrollSyncCount,
    frozenRowsViewport: frozenRowsViewportHeight,
    frozenRowsTotalSize: frozenRowsHeight,
    frozenRowsOverflow,
    frozenColumnsViewport,
    frozenColumnsTotalSize,
    frozenColumnsOverflow,
    frozenColumnsScrollLeft,
  }), [
    activeSheetName,
    collapsedItemsDuration,
    columnOverscan,
    columnViewport,
    columnWindowMs,
    columnWindowUpdates,
    endIdx,
    freezeColumnCount,
    frozenColumnsOverflow,
    frozenColumnsScrollLeft,
    frozenColumnsTotalSize,
    frozenColumnsViewport,
    frozenRowsCount,
    frozenRowsHeight,
    frozenRowsOverflow,
    frozenRowsViewportHeight,
    hiddenRowNumberCount,
    hiddenRowsCount,
    items,
    itemsDuration,
    miniMapDebugRef,
    miniMapDuration,
    renderItemsDuration,
    renderedColumns,
    rowOverscan,
    rowViewport,
    rowWindowMs,
    rowWindowUpdates,
    scrollSyncCount,
    startIdx,
    totalColumns,
  ]);
}
