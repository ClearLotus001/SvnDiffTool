import { useMemo, type MutableRefObject } from 'react';

import type {
  CompareMode,
  WorkbookStackedVirtualItem,
} from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { WorkbookPerfDebugStats } from '@/components/workbook/WorkbookPerfDebugPanel';
import type { WorkbookMiniMapDebugStats } from '@/components/workbook/WorkbookMiniMap';
import type { WorkbookCompareRenderItem } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import { buildWorkbookPerfStats } from '@/utils/workbook/workbookPanelHelpers';

interface UseWorkbookComparePerfStatsParams {
  enabled: boolean;
  mode: CompareMode;
  activeSheetName: string;
  items: WorkbookCompareRenderItem[];
  stackedVirtualItems: WorkbookStackedVirtualItem[];
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
  frozenRowsViewportHeight: number;
  frozenRowsHeight: number;
  frozenRowsOverflow: boolean;
  frozenColumnsViewport: number;
  frozenColumnsTotalSize: number;
  frozenColumnsOverflow: boolean;
  frozenColumnsScrollLeft: number;
}

export function useWorkbookComparePerfStats({
  enabled,
  mode,
  activeSheetName,
  items,
  stackedVirtualItems,
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
  frozenRowsViewportHeight,
  frozenRowsHeight,
  frozenRowsOverflow,
  frozenColumnsViewport,
  frozenColumnsTotalSize,
  frozenColumnsOverflow,
  frozenColumnsScrollLeft,
}: UseWorkbookComparePerfStatsParams): WorkbookPerfDebugStats {
  return useMemo(() => {
    if (!enabled) {
      return {
        panel: mode,
        sheetName: activeSheetName,
        totalRows: 0,
        renderedRows: 0,
        collapseBlocks: 0,
        totalColumns: 0,
        renderedColumns: 0,
        frozenRows: 0,
        frozenColumns: 0,
        buildItemsMs: 0,
        collapseBuildMs: 0,
        hiddenOverlayMs: 0,
        hiddenRows: 0,
        miniMapMs: 0,
        rowWindowMs: 0,
        rowWindowUpdates: 0,
        rowOverscan: 0,
        rowViewport: 0,
        columnWindowMs: 0,
        columnWindowUpdates: 0,
        columnOverscan: 0,
        columnViewport: 0,
        miniMapClickMs: 0,
        miniMapClickCount: 0,
        scrollSyncCount: 0,
        frozenRowsViewport: 0,
        frozenRowsTotalSize: 0,
        frozenRowsOverflow: false,
        frozenColumnsViewport: 0,
        frozenColumnsTotalSize: 0,
        frozenColumnsOverflow: false,
        frozenColumnsScrollLeft: 0,
      };
    }

    return buildWorkbookPerfStats({
      panel: mode,
      sheetName: activeSheetName,
      totalRows: mode === 'stacked' ? stackedVirtualItems.length : items.length,
      renderedRows: Math.max(0, endIdx - startIdx),
      collapseBlocks: mode === 'stacked'
        ? stackedVirtualItems.filter(item => item.kind === 'collapse').length
        : items.filter(item => item.kind === 'collapse').length,
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
      scrollSyncCount: 0,
      frozenRowsViewport: frozenRowsViewportHeight,
      frozenRowsTotalSize: frozenRowsHeight,
      frozenRowsOverflow,
      frozenColumnsViewport,
      frozenColumnsTotalSize,
      frozenColumnsOverflow,
      frozenColumnsScrollLeft,
    });
  }, [
    activeSheetName,
    collapsedItemsDuration,
    columnOverscan,
    columnViewport,
    columnWindowMs,
    columnWindowUpdates,
    endIdx,
    enabled,
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
    mode,
    renderItemsDuration,
    renderedColumns,
    rowOverscan,
    rowViewport,
    rowWindowMs,
    rowWindowUpdates,
    stackedVirtualItems,
    startIdx,
    totalColumns,
  ]);
}
