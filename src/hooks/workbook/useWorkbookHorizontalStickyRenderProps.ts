import { useMemo, type ComponentProps, type RefObject } from 'react';

import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookHiddenColumnSegment } from '@/types';
import type { WorkbookSelectionRequest, WorkbookSelectionState } from '@/types';
import type { WorkbookCompareMode, WorkbookMergeRange } from '@/types';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookCanvasHeaderStrip from '@/components/workbook/WorkbookCanvasHeaderStrip';
import WorkbookPaneCanvasStrip from '@/components/workbook/WorkbookPaneCanvasStrip';

export type WorkbookHorizontalPaneSide = 'left' | 'right';

interface HorizontalPaneVirtualColumnsLike {
  debug: { viewportWidth: number };
  columnEntries: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
}

export interface WorkbookHorizontalStickyRenderSideProps {
  paneViewportWidth: number;
  pinnedCollapseWidth: number | string;
  frozenRowsScrollerRef: RefObject<HTMLDivElement | null>;
  isFrozenRowsPaneHovered: boolean;
  frozenRowsRangeLabel: string;
  stickyHeaderRowsHeight: number;
  headerCanvasRows: ComponentProps<typeof WorkbookPaneCanvasStrip>['rows'];
  headerProps: ComponentProps<typeof WorkbookCanvasHeaderStrip>;
  frozenCanvasProps: Omit<ComponentProps<typeof WorkbookPaneCanvasStrip>, 'rows'>;
}

interface UseWorkbookHorizontalStickyRenderPropsParams {
  paneVirtualColumnsBySide: Record<WorkbookHorizontalPaneSide, HorizontalPaneVirtualColumnsLike>;
  activeSheetName: string;
  leftScrollRef: RefObject<HTMLDivElement | null>;
  rightScrollRef: RefObject<HTMLDivElement | null>;
  leftFrozenRowsScrollRef: RefObject<HTMLDivElement | null>;
  rightFrozenRowsScrollRef: RefObject<HTMLDivElement | null>;
  hoveredFrozenRowsPaneSide: WorkbookHorizontalPaneSide | null;
  frozenRowsRangeLabelBySide: Record<WorkbookHorizontalPaneSide, string>;
  freezeColumnCount: number;
  singleGridWidth: number;
  selection: WorkbookSelectionState;
  fontSize: number;
  hiddenColumnSegments: WorkbookHiddenColumnSegment[];
  onSelectColumn: ComponentProps<typeof WorkbookCanvasHeaderStrip>['onSelectColumn'];
  onRevealHiddenColumns: (columns: number[]) => void;
  onColumnWidthChange: (column: number, width: number) => void;
  onAutoFitColumn: (column: number) => void;
  stickyHeaderRowsHeight: number;
  stickyHeaderCanvasRows: ComponentProps<typeof WorkbookPaneCanvasStrip>['rows'];
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange: (hover: WorkbookCanvasHoverCell | null) => void;
  visibleColumns: number[];
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  baseRowEntryByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['rowEntryByRowNumber'];
  mineRowEntryByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['rowEntryByRowNumber'];
  baseCompareCellsByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['compareCellsByRowNumber'];
  mineCompareCellsByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['compareCellsByRowNumber'];
  compareMode: WorkbookCompareMode;
}

export function useWorkbookHorizontalStickyRenderProps({
  paneVirtualColumnsBySide,
  activeSheetName,
  leftScrollRef,
  rightScrollRef,
  leftFrozenRowsScrollRef,
  rightFrozenRowsScrollRef,
  hoveredFrozenRowsPaneSide,
  frozenRowsRangeLabelBySide,
  freezeColumnCount,
  singleGridWidth,
  selection,
  fontSize,
  hiddenColumnSegments,
  onSelectColumn,
  onRevealHiddenColumns,
  onColumnWidthChange,
  onAutoFitColumn,
  stickyHeaderRowsHeight,
  stickyHeaderCanvasRows,
  baseVersion,
  mineVersion,
  headerRowNumber,
  onSelectionRequest,
  onHoverChange,
  visibleColumns,
  baseMergedRanges,
  mineMergedRanges,
  baseRowEntryByRowNumber,
  mineRowEntryByRowNumber,
  baseCompareCellsByRowNumber,
  mineCompareCellsByRowNumber,
  compareMode,
}: UseWorkbookHorizontalStickyRenderPropsParams): Record<WorkbookHorizontalPaneSide, WorkbookHorizontalStickyRenderSideProps> {
  return useMemo(() => {
    const buildSideProps = (side: WorkbookHorizontalPaneSide): WorkbookHorizontalStickyRenderSideProps => {
      const paneVirtualColumns = paneVirtualColumnsBySide[side];
      const paneViewportWidth = paneVirtualColumns.debug.viewportWidth;
      const workbookSide = side === 'left' ? 'base' : 'mine';
      const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
      const frozenRowsScrollerRef = side === 'left' ? leftFrozenRowsScrollRef : rightFrozenRowsScrollRef;

      return {
        paneViewportWidth,
        pinnedCollapseWidth: paneViewportWidth > 0 ? paneViewportWidth : '100%',
        frozenRowsScrollerRef,
        isFrozenRowsPaneHovered: hoveredFrozenRowsPaneSide === side,
        frozenRowsRangeLabel: frozenRowsRangeLabelBySide[side],
        stickyHeaderRowsHeight,
        headerCanvasRows: stickyHeaderCanvasRows,
        headerProps: {
          mode: 'single',
          viewportWidth: paneViewportWidth,
          scrollRef,
          freezeColumnCount,
          contentWidth: singleGridWidth,
          sheetName: activeSheetName,
          selection,
          fontSize,
          renderColumns: paneVirtualColumns.columnEntries,
          columnLayoutByColumn: paneVirtualColumns.columnLayoutByColumn,
          fixedSide: workbookSide,
          onSelectColumn,
          ...(hiddenColumnSegments.length > 0 ? { hiddenColumnSegments } : {}),
          onRevealHiddenColumns,
          onColumnWidthChange,
          onAutoFitColumn,
        },
        frozenCanvasProps: {
          side: workbookSide,
          viewportWidth: paneViewportWidth,
          scrollRef,
          freezeColumnCount,
          contentWidth: singleGridWidth,
          sheetName: activeSheetName,
          versionLabel: workbookSide === 'base' ? baseVersion : mineVersion,
          headerRowNumber,
          selection,
          onSelectionRequest,
          onHoverChange,
          fontSize,
          visibleColumns,
          renderColumns: paneVirtualColumns.columnEntries,
          columnLayoutByColumn: paneVirtualColumns.columnLayoutByColumn,
          mergedRanges: workbookSide === 'base' ? baseMergedRanges : mineMergedRanges,
          rowEntryByRowNumber: workbookSide === 'base' ? baseRowEntryByRowNumber : mineRowEntryByRowNumber,
          compareCellsByRowNumber: workbookSide === 'base' ? baseCompareCellsByRowNumber : mineCompareCellsByRowNumber,
          compareMode,
        },
      };
    };

    return {
      left: buildSideProps('left'),
      right: buildSideProps('right'),
    };
  }, [
    activeSheetName,
    baseCompareCellsByRowNumber,
    baseMergedRanges,
    baseRowEntryByRowNumber,
    baseVersion,
    compareMode,
    fontSize,
    freezeColumnCount,
    frozenRowsRangeLabelBySide,
    headerRowNumber,
    hiddenColumnSegments,
    hoveredFrozenRowsPaneSide,
    leftFrozenRowsScrollRef,
    leftScrollRef,
    mineCompareCellsByRowNumber,
    mineMergedRanges,
    mineRowEntryByRowNumber,
    mineVersion,
    onAutoFitColumn,
    stickyHeaderRowsHeight,
    stickyHeaderCanvasRows,
    onColumnWidthChange,
    onHoverChange,
    onRevealHiddenColumns,
    onSelectColumn,
    onSelectionRequest,
    paneVirtualColumnsBySide,
    rightFrozenRowsScrollRef,
    rightScrollRef,
    selection,
    singleGridWidth,
    visibleColumns,
  ]);
}
