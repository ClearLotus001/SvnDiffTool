import {
  useEffect,
  useMemo,
  type MutableRefObject,
  type RefObject,
} from 'react';

import { LN_W } from '@/constants/layout';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { SplitRow } from '@/types';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type { WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import type {
  WorkbookCanvasRenderGroup,
  WorkbookCanvasRenderRow,
} from '@/components/workbook/WorkbookStackedCanvasStrip';
import { resolveWorkbookFrozenPaneViewport } from '@/utils/workbook/workbookFrozenPane';
import {
  formatWorkbookFrozenColumnRangeLabel,
  formatWorkbookFrozenRowRangeLabel,
} from '@/utils/workbook/workbookFrozenPaneLabels';
import {
  getStackedWorkbookRowRenderHeight,
  getWorkbookColumnsRenderMode,
  getWorkbookStackedRenderMode,
} from '@/utils/workbook/workbookRowBehavior';
import {
  buildWorkbookStackedLayoutRows,
  buildWorkbookStackedVisualGroups,
} from '@/utils/workbook/workbookStackedMergeGroups';
import { getWorkbookRowKey } from '@/utils/workbook/workbookPanelHelpers';
import {
  collectWorkbookRowFramesByKey,
  type WorkbookRowFrame,
} from '@/utils/workbook/workbookVisibleRowFrames';

const EMPTY_HEIGHTS: number[] = [];
const MIN_WORKBOOK_SCROLLABLE_BODY_ROWS = 8;
const MIN_WORKBOOK_FROZEN_PANE_ROWS = 4;
const MAX_WORKBOOK_FROZEN_PANE_VIEWPORT_RATIO = 0.6;

interface UseWorkbookFrozenPaneStateParams {
  mode: CompareMode;
  frozenRows: SplitRow[];
  rowHeight: number;
  itemsCount: number;
  viewportHeight: number;
  showColumnHeader: boolean;
  activeSheetName: string;
  freezeRowNumber: number;
  freezeColumnCount: number;
  totalContentHeight: number;
  totalColumnsWidth: number;
  columnEntries: HorizontalVirtualColumnEntry[];
  frozenRowsScrollRef: RefObject<HTMLDivElement | null>;
  lastFrozenPaneAutoScrollKeyRef: MutableRefObject<string>;
  baseMergeRanges: ReadonlyArray<{ startRow: number; endRow: number; startCol: number; endCol: number }>;
  mineMergeRanges: ReadonlyArray<{ startRow: number; endRow: number; startCol: number; endCol: number }>;
}

export interface FrozenStackedCanvasRun {
  key: string;
  groups: WorkbookCanvasRenderGroup[];
  top: number;
  height: number;
}

export interface UseWorkbookFrozenPaneStateResult {
  frozenRowsHeight: number;
  frozenRowsViewport: ReturnType<typeof resolveWorkbookFrozenPaneViewport>;
  frozenRowsViewportHeight: number;
  stickyHeaderHeight: number;
  minBodyWidth: number;
  contentHeight: number;
  frozenRowsWindowOffsetTop: number;
  scrollToFrozenRowIndex: (idx: number, align?: 'start' | 'center', behavior?: 'auto' | 'smooth' | 'smart') => void;
  visibleFrozenColumnsCanvasRows: WorkbookColumnsCanvasRow[];
  visibleFrozenColumnsCanvasHeight: number;
  visibleFrozenStackedCanvasRuns: FrozenStackedCanvasRun[];
  visibleFrozenRowFramesByKey: Map<string, WorkbookRowFrame>;
  frozenRowsRangeLabel: string;
  frozenColumnsRangeLabel: string;
}

export function useWorkbookFrozenPaneState({
  mode,
  frozenRows,
  rowHeight,
  itemsCount,
  viewportHeight,
  showColumnHeader,
  activeSheetName,
  freezeRowNumber,
  freezeColumnCount,
  totalContentHeight,
  totalColumnsWidth,
  columnEntries,
  frozenRowsScrollRef,
  lastFrozenPaneAutoScrollKeyRef,
  baseMergeRanges,
  mineMergeRanges,
}: UseWorkbookFrozenPaneStateParams): UseWorkbookFrozenPaneStateResult {
  const frozenRowsHeights = useMemo(
    () => frozenRows.map((row) => (
      mode === 'stacked'
        ? getStackedWorkbookRowRenderHeight(row, rowHeight, ROW_H)
        : rowHeight
    )),
    [frozenRows, mode, rowHeight],
  );

  const frozenRowsHeight = useMemo(
    () => frozenRowsHeights.reduce((sum, height) => sum + height, 0),
    [frozenRowsHeights],
  );

  const frozenRowsViewport = useMemo(() => resolveWorkbookFrozenPaneViewport({
    totalFrozenSize: frozenRowsHeight,
    viewportSize: viewportHeight,
    headerSize: showColumnHeader ? ROW_H : 0,
    minBodyViewportSize: itemsCount > 0 ? ROW_H * MIN_WORKBOOK_SCROLLABLE_BODY_ROWS : 0,
    maxViewportRatio: MAX_WORKBOOK_FROZEN_PANE_VIEWPORT_RATIO,
    minViewportSize: frozenRows.length > 0 ? ROW_H * MIN_WORKBOOK_FROZEN_PANE_ROWS : 0,
  }), [
    frozenRows.length,
    frozenRowsHeight,
    itemsCount,
    showColumnHeader,
    viewportHeight,
  ]);

  const frozenRowsViewportHeight = frozenRowsViewport.viewportSize;
  const stickyHeaderHeight = (showColumnHeader ? ROW_H : 0) + frozenRowsViewportHeight;
  const minBodyWidth = (LN_W + 3) + totalColumnsWidth;
  const contentHeight = totalContentHeight + stickyHeaderHeight;

  const stackedFrozenCanvasRows = useMemo<WorkbookCanvasRenderRow[]>(
    () => frozenRows.map((row, index) => ({
      row,
      renderMode: getWorkbookStackedRenderMode(row),
      height: frozenRowsHeights[index] ?? rowHeight,
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [frozenRows, frozenRowsHeights, rowHeight],
  );

  const stackedFrozenCanvasGroups = useMemo<WorkbookCanvasRenderGroup[]>(() => {
    if (stackedFrozenCanvasRows.length === 0) return [];

    const layoutRows = buildWorkbookStackedLayoutRows({
      rows: stackedFrozenCanvasRows.map((row) => ({
        row: row.row,
        renderMode: row.renderMode,
        height: row.height,
      })),
    });
    const visualGroups = buildWorkbookStackedVisualGroups({
      rows: layoutRows,
      baseMergeRanges,
      mineMergeRanges,
    });

    return visualGroups.map((group) => {
      const rows = stackedFrozenCanvasRows.slice(group.startIndex, group.endIndex + 1);
      return {
        key: group.key,
        rows,
        height: rows.reduce((sum, row) => sum + row.height, 0),
        hasVerticalMerge: group.reason === 'merge',
        baseTrack: group.baseTrack.map((track) => ({
          sourceRowIndex: track.sourceRowIndex,
          rowNumber: track.rowNumber,
        })),
        mineTrack: group.mineTrack.map((track) => ({
          sourceRowIndex: track.sourceRowIndex,
          rowNumber: track.rowNumber,
        })),
      };
    });
  }, [baseMergeRanges, mineMergeRanges, stackedFrozenCanvasRows]);

  const columnsFrozenCanvasRows = useMemo<WorkbookColumnsCanvasRow[]>(
    () => frozenRows.map((row) => ({
      row,
      renderMode: getWorkbookColumnsRenderMode(row),
      isSearchMatch: false,
      isActiveSearch: false,
      isGuided: false,
      isGuidedStart: false,
      isGuidedEnd: false,
    })),
    [frozenRows],
  );

  const frozenRowsVirtualHeights = mode === 'stacked'
    ? stackedFrozenCanvasGroups.map((group) => group.height)
    : frozenRowsHeights;

  const frozenRowsVirtual = useVariableVirtual(
    frozenRowsViewportHeight > 0 ? frozenRowsVirtualHeights : EMPTY_HEIGHTS,
    frozenRowsScrollRef,
    {
      overscanMin: mode === 'stacked' ? 1 : 12,
      overscanFactor: mode === 'stacked' ? 0.75 : 1.5,
      syncKey: `${activeSheetName}:${freezeRowNumber}:${mode}:frozen`,
    },
  );

  const frozenRowsWindowOffsetTop = frozenRowsViewport.isOverflowing
    ? frozenRowsVirtual.offsetTop
    : 0;

  const visibleFrozenColumnsCanvasRows = useMemo(
    () => (
      mode === 'columns'
        ? (
          frozenRowsViewport.isOverflowing
            ? columnsFrozenCanvasRows.slice(frozenRowsVirtual.startIdx, frozenRowsVirtual.endIdx)
            : columnsFrozenCanvasRows
        )
        : []
    ),
    [
      columnsFrozenCanvasRows,
      frozenRowsViewport.isOverflowing,
      frozenRowsVirtual.endIdx,
      frozenRowsVirtual.startIdx,
      mode,
    ],
  );

  const visibleFrozenColumnsCanvasHeight = useMemo(
    () => (
      mode === 'columns'
        ? (
          frozenRowsViewport.isOverflowing
            ? visibleFrozenColumnsCanvasRows.length * ROW_H
            : frozenRowsHeight
        )
        : 0
    ),
    [frozenRowsHeight, frozenRowsViewport.isOverflowing, mode, visibleFrozenColumnsCanvasRows.length],
  );

  const visibleFrozenStackedCanvasGroups = useMemo(
    () => (
      mode === 'stacked'
        ? (
          frozenRowsViewport.isOverflowing
            ? stackedFrozenCanvasGroups.slice(frozenRowsVirtual.startIdx, frozenRowsVirtual.endIdx)
            : stackedFrozenCanvasGroups
        )
        : []
    ),
    [
      frozenRowsViewport.isOverflowing,
      frozenRowsVirtual.endIdx,
      frozenRowsVirtual.startIdx,
      mode,
      stackedFrozenCanvasGroups,
    ],
  );

  const visibleFrozenStackedCanvasRuns = useMemo<FrozenStackedCanvasRun[]>(() => {
    if (mode !== 'stacked') return [];
    let cursorTop = 0;
    return visibleFrozenStackedCanvasGroups.map((group) => {
      const top = cursorTop;
      cursorTop += group.height;
      return {
        key: group.key,
        groups: [group],
        top,
        height: group.height,
      };
    });
  }, [mode, visibleFrozenStackedCanvasGroups]);

  const visibleFrozenRowFramesByKey = useMemo(() => {
    if (mode === 'stacked') {
      const next = new Map<string, WorkbookRowFrame>();
      visibleFrozenStackedCanvasRuns.forEach((run) => {
        let groupTop = run.top;
        run.groups.forEach((group) => {
          const framesByKey = collectWorkbookRowFramesByKey(group.rows, {
            getRowKey: (row) => getWorkbookRowKey(row.row),
            getItemHeight: (row) => row.height,
            initialTop: groupTop,
          });
          framesByKey.forEach((frame, rowKey) => {
            next.set(rowKey, frame);
          });
          groupTop += group.height;
        });
      });
      return next;
    }

    return collectWorkbookRowFramesByKey(visibleFrozenColumnsCanvasRows, {
      getRowKey: (row) => getWorkbookRowKey(row.row),
      getItemHeight: () => ROW_H,
    });
  }, [mode, visibleFrozenColumnsCanvasRows, visibleFrozenStackedCanvasRuns]);

  const visibleFrozenRowsForStatus = useMemo(
    () => (
      mode === 'stacked'
        ? visibleFrozenStackedCanvasRuns.flatMap((run) => run.groups.flatMap((group) => group.rows.map((row) => row.row)))
        : visibleFrozenColumnsCanvasRows.map((row) => row.row)
    ),
    [mode, visibleFrozenColumnsCanvasRows, visibleFrozenStackedCanvasRuns],
  );

  const frozenRowsRangeLabel = useMemo(
    () => formatWorkbookFrozenRowRangeLabel(visibleFrozenRowsForStatus),
    [visibleFrozenRowsForStatus],
  );

  const frozenColumnsRangeLabel = useMemo(
    () => formatWorkbookFrozenColumnRangeLabel(columnEntries, freezeColumnCount),
    [columnEntries, freezeColumnCount],
  );

  useEffect(() => {
    const scroller = frozenRowsScrollRef.current;
    if (!scroller) return;

    const nextKey = `${activeSheetName}:${mode}:${freezeRowNumber}:${frozenRowsViewport.isOverflowing ? 'overflow' : 'fit'}`;
    if (lastFrozenPaneAutoScrollKeyRef.current === nextKey) return;
    lastFrozenPaneAutoScrollKeyRef.current = nextKey;

    if (!frozenRowsViewport.isOverflowing) {
      if (scroller.scrollTop !== 0) scroller.scrollTop = 0;
      return;
    }

    const nextScrollTop = Math.max(0, frozenRowsHeight - frozenRowsViewportHeight);
    const rafId = requestAnimationFrame(() => {
      scroller.scrollTop = nextScrollTop;
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    activeSheetName,
    freezeRowNumber,
    frozenRowsHeight,
    frozenRowsScrollRef,
    frozenRowsViewport.isOverflowing,
    frozenRowsViewportHeight,
    lastFrozenPaneAutoScrollKeyRef,
    mode,
  ]);

  return {
    frozenRowsHeight,
    frozenRowsViewport,
    frozenRowsViewportHeight,
    stickyHeaderHeight,
    minBodyWidth,
    contentHeight,
    frozenRowsWindowOffsetTop,
    scrollToFrozenRowIndex: frozenRowsVirtual.scrollToIndex,
    visibleFrozenColumnsCanvasRows,
    visibleFrozenColumnsCanvasHeight,
    visibleFrozenStackedCanvasRuns,
    visibleFrozenRowFramesByKey,
    frozenRowsRangeLabel,
    frozenColumnsRangeLabel,
  };
}
