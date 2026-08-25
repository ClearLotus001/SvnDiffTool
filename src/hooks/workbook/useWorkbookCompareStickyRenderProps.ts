import { useMemo, type ComponentProps, type RefObject } from 'react';

import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { FrozenStackedCanvasRun } from '@/hooks/workbook/useWorkbookFrozenPaneState';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type {
  WorkbookCompareCellsMaps,
  WorkbookCompareStateByRow,
  WorkbookRowEntryMaps,
} from '@/utils/workbook/workbookPanelHelpers';
import type {
  WorkbookCompareMode,
  WorkbookMergeRange,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '@/types';
import type { WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookCompareStickyCanvas from '@/components/workbook/WorkbookCompareStickyCanvas';

interface UseWorkbookCompareStickyRenderPropsParams {
  mode: CompareMode;
  showColumnHeader: boolean;
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  stickyHeaderRowsScrollRef: RefObject<HTMLDivElement | null>;
  frozenRowsScrollRef: RefObject<HTMLDivElement | null>;
  freezeColumnCount: number;
  minBodyWidth: number;
  activeSheetName: string;
  selection: WorkbookSelectionState;
  fontSize: number;
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: ReadonlyMap<number, HorizontalVirtualColumnEntry>;
  stackedHeaderSide: 'base' | 'mine';
  hiddenColumnSegments: ComponentProps<typeof WorkbookCompareStickyCanvas>['headerProps']['hiddenColumnSegments'];
  onSelectColumn: ComponentProps<typeof WorkbookCompareStickyCanvas>['headerProps']['onSelectColumn'];
  onRevealHiddenHeaderColumns: (columns: number[]) => void;
  onColumnWidthChange: (column: number, width: number) => void;
  onAutoFitColumn: (column: number) => void;
  isFrozenRowsPaneHovered: boolean;
  onFrozenRowsPaneHoverEnter: () => void;
  onFrozenRowsPaneHoverLeave: () => void;
  stickyHeaderRowsViewportHeight: number;
  stickyHeaderRowsHeight: number;
  stickyHeaderRowsWindowOffsetTop: number;
  visibleStickyHeaderStackedCanvasRuns: FrozenStackedCanvasRun[];
  visibleStickyHeaderColumnsCanvasRows: WorkbookColumnsCanvasRow[];
  visibleStickyHeaderColumnsCanvasHeight: number;
  frozenRowsViewportHeight: number;
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsRangeLabel: string;
  frozenRowsHeight: number;
  frozenRowsWindowOffsetTop: number;
  visibleFrozenStackedCanvasRuns: FrozenStackedCanvasRun[];
  visibleFrozenColumnsCanvasRows: WorkbookColumnsCanvasRow[];
  visibleFrozenColumnsCanvasHeight: number;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange: (hover: WorkbookCanvasHoverCell | null) => void;
  visibleColumns: number[];
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  rowEntryByRowNumber: WorkbookRowEntryMaps;
  compareStateByRow: WorkbookCompareStateByRow;
  maskedRegions: ComponentProps<typeof WorkbookCompareStickyCanvas>['frozenRowsPaneProps']['maskedRegions'];
  compareCellsByRowNumber: WorkbookCompareCellsMaps;
  compareMode: WorkbookCompareMode;
}

export function useWorkbookCompareStickyRenderProps({
  mode,
  showColumnHeader,
  viewportWidth,
  scrollRef,
  stickyHeaderRowsScrollRef,
  frozenRowsScrollRef,
  freezeColumnCount,
  minBodyWidth,
  activeSheetName,
  selection,
  fontSize,
  renderColumns,
  columnLayoutByColumn,
  stackedHeaderSide,
  hiddenColumnSegments,
  onSelectColumn,
  onRevealHiddenHeaderColumns,
  onColumnWidthChange,
  onAutoFitColumn,
  isFrozenRowsPaneHovered,
  onFrozenRowsPaneHoverEnter,
  onFrozenRowsPaneHoverLeave,
  stickyHeaderRowsViewportHeight,
  stickyHeaderRowsHeight,
  stickyHeaderRowsWindowOffsetTop,
  visibleStickyHeaderStackedCanvasRuns,
  visibleStickyHeaderColumnsCanvasRows,
  visibleStickyHeaderColumnsCanvasHeight,
  frozenRowsViewportHeight,
  frozenRowsViewportIsOverflowing,
  frozenRowsRangeLabel,
  frozenRowsHeight,
  frozenRowsWindowOffsetTop,
  visibleFrozenStackedCanvasRuns,
  visibleFrozenColumnsCanvasRows,
  visibleFrozenColumnsCanvasHeight,
  baseVersion,
  mineVersion,
  headerRowNumber,
  onSelectionRequest,
  onHoverChange,
  visibleColumns,
  baseMergedRanges,
  mineMergedRanges,
  rowEntryByRowNumber,
  compareStateByRow,
  maskedRegions,
  compareCellsByRowNumber,
  compareMode,
}: UseWorkbookCompareStickyRenderPropsParams): ComponentProps<typeof WorkbookCompareStickyCanvas> {
  const headerProps = useMemo<ComponentProps<typeof WorkbookCompareStickyCanvas>['headerProps']>(() => ({
    viewportWidth,
    scrollRef,
    freezeColumnCount,
    contentWidth: minBodyWidth,
    sheetName: activeSheetName,
    selection,
    fontSize,
    renderColumns,
    columnLayoutByColumn,
    fixedSide: stackedHeaderSide,
    onSelectColumn,
    ...(hiddenColumnSegments !== undefined ? { hiddenColumnSegments } : {}),
    onRevealHiddenColumns: onRevealHiddenHeaderColumns,
    onColumnWidthChange,
    onAutoFitColumn,
  }), [
    activeSheetName,
    columnLayoutByColumn,
    fontSize,
    freezeColumnCount,
    hiddenColumnSegments,
    minBodyWidth,
    onAutoFitColumn,
    onColumnWidthChange,
    onRevealHiddenHeaderColumns,
    onSelectColumn,
    renderColumns,
    scrollRef,
    selection,
    stackedHeaderSide,
    viewportWidth,
  ]);

  const headerRowsPaneProps = useMemo<ComponentProps<typeof WorkbookCompareStickyCanvas>['headerRowsPaneProps']>(() => (
    stickyHeaderRowsHeight > 0
      ? {
        appearance: 'header',
        frozenRowsScrollRef: stickyHeaderRowsScrollRef,
        isHovered: false,
        onHoverEnter: () => {},
        onHoverLeave: () => {},
        frozenRowsViewportHeight: stickyHeaderRowsViewportHeight,
        frozenRowsViewportIsOverflowing: false,
        frozenRowsRangeLabel: '',
        frozenRowsHeight: stickyHeaderRowsHeight,
        minBodyWidth,
        mode,
        frozenRowsWindowOffsetTop: stickyHeaderRowsWindowOffsetTop,
        visibleFrozenStackedCanvasRuns: visibleStickyHeaderStackedCanvasRuns,
        visibleFrozenColumnsCanvasRows: visibleStickyHeaderColumnsCanvasRows,
        visibleFrozenColumnsCanvasHeight: visibleStickyHeaderColumnsCanvasHeight,
        viewportWidth,
        scrollRef,
        freezeColumnCount,
        contentWidth: minBodyWidth,
        sheetName: activeSheetName,
        baseVersion,
        mineVersion,
        headerRowNumber,
        selection,
        onSelectionRequest,
        onHoverChange,
        fontSize,
        visibleColumns,
        renderColumns,
        columnLayoutByColumn,
        baseMergedRanges,
        mineMergedRanges,
        rowEntryByRowNumber,
        compareStateByRow,
        maskedRegions,
        compareCellsByRowNumber,
        compareMode,
      }
      : null
  ), [
    activeSheetName,
    baseMergedRanges,
    baseVersion,
    columnLayoutByColumn,
    compareStateByRow,
    maskedRegions,
    compareCellsByRowNumber,
    compareMode,
    fontSize,
    freezeColumnCount,
    headerRowNumber,
    minBodyWidth,
    mineMergedRanges,
    mineVersion,
    mode,
    onHoverChange,
    onSelectionRequest,
    renderColumns,
    rowEntryByRowNumber,
    scrollRef,
    selection,
    stickyHeaderRowsHeight,
    stickyHeaderRowsScrollRef,
    stickyHeaderRowsViewportHeight,
    stickyHeaderRowsWindowOffsetTop,
    viewportWidth,
    visibleColumns,
    visibleStickyHeaderColumnsCanvasHeight,
    visibleStickyHeaderColumnsCanvasRows,
    visibleStickyHeaderStackedCanvasRuns,
  ]);

  const frozenRowsPaneProps = useMemo<ComponentProps<typeof WorkbookCompareStickyCanvas>['frozenRowsPaneProps']>(() => ({
    frozenRowsScrollRef,
    isHovered: isFrozenRowsPaneHovered,
    onHoverEnter: onFrozenRowsPaneHoverEnter,
    onHoverLeave: onFrozenRowsPaneHoverLeave,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    frozenRowsRangeLabel,
    frozenRowsHeight,
    minBodyWidth,
    mode,
    frozenRowsWindowOffsetTop,
    visibleFrozenStackedCanvasRuns,
    visibleFrozenColumnsCanvasRows,
    visibleFrozenColumnsCanvasHeight,
    viewportWidth,
    scrollRef,
    freezeColumnCount,
    contentWidth: minBodyWidth,
    sheetName: activeSheetName,
    baseVersion,
    mineVersion,
    headerRowNumber,
    selection,
    onSelectionRequest,
    onHoverChange,
    fontSize,
    visibleColumns,
    renderColumns,
    columnLayoutByColumn,
    baseMergedRanges,
    mineMergedRanges,
    rowEntryByRowNumber,
    compareStateByRow,
    maskedRegions,
    compareCellsByRowNumber,
    compareMode,
  }), [
    activeSheetName,
    baseMergedRanges,
    baseVersion,
    columnLayoutByColumn,
    compareStateByRow,
    maskedRegions,
    compareCellsByRowNumber,
    compareMode,
    fontSize,
    freezeColumnCount,
    frozenRowsHeight,
    frozenRowsRangeLabel,
    frozenRowsScrollRef,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing,
    frozenRowsWindowOffsetTop,
    isFrozenRowsPaneHovered,
    minBodyWidth,
    mineMergedRanges,
    mineVersion,
    mode,
    onFrozenRowsPaneHoverEnter,
    onFrozenRowsPaneHoverLeave,
    onHoverChange,
    onSelectionRequest,
    renderColumns,
    rowEntryByRowNumber,
    scrollRef,
    selection,
    headerRowNumber,
    viewportWidth,
    visibleColumns,
    visibleFrozenColumnsCanvasHeight,
    visibleFrozenColumnsCanvasRows,
    visibleFrozenStackedCanvasRuns,
  ]);

  return useMemo(() => ({
    mode,
    showColumnHeader,
    headerProps,
    headerRowsPaneProps: headerRowsPaneProps ?? null,
    frozenRowsPaneProps,
  }), [frozenRowsPaneProps, headerProps, headerRowsPaneProps, mode, showColumnHeader]);
}
