import { useMemo, type ComponentProps, type RefObject } from 'react';

import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type {
  WorkbookCompareColumnsBodySegment,
  WorkbookCompareStackedBodySegment,
  WorkbookCompareStackedCanvasRun,
} from '@/hooks/workbook/useWorkbookCompareBodyLayout';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type {
  WorkbookCompareMode,
  WorkbookMergeRange,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '@/types';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookCompareBody from '@/components/workbook/WorkbookCompareBody';

interface UseWorkbookCompareBodyRenderPropsParams {
  mode: CompareMode;
  topOffset: number;
  minBodyWidth: number;
  viewportWidth: number;
  pinnedCollapseWidth: number | string;
  stackedSegments: WorkbookCompareStackedBodySegment[];
  stackedCanvasRuns: WorkbookCompareStackedCanvasRun[];
  columnsSegments: WorkbookCompareColumnsBodySegment[] | null;
  overlayProps: ComponentProps<typeof WorkbookCompareBody>['overlayProps'];
  renderPinnedCollapseBar: ComponentProps<typeof WorkbookCompareBody>['renderPinnedCollapseBar'];
  onExpandCollapseBlock: ComponentProps<typeof WorkbookCompareBody>['onExpandCollapseBlock'];
  onRevealHiddenRows: ComponentProps<typeof WorkbookCompareBody>['onRevealHiddenRows'];
  scrollRef: RefObject<HTMLDivElement | null>;
  freezeColumnCount: number;
  activeSheetName: string;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: ReadonlyMap<number, HorizontalVirtualColumnEntry>;
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  baseRowEntryByRowNumber: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['baseRowEntryByRowNumber'];
  mineRowEntryByRowNumber: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['mineRowEntryByRowNumber'];
  compareStateByRow: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['compareStateByRow'];
  maskedRegions: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['maskedRegions'];
  baseCompareCellsByRowNumber: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['baseCompareCellsByRowNumber'];
  mineCompareCellsByRowNumber: ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']['mineCompareCellsByRowNumber'];
  compareMode: WorkbookCompareMode;
}

export function useWorkbookCompareBodyRenderProps({
  mode,
  topOffset,
  minBodyWidth,
  viewportWidth,
  pinnedCollapseWidth,
  stackedSegments,
  stackedCanvasRuns,
  columnsSegments,
  overlayProps,
  renderPinnedCollapseBar,
  onExpandCollapseBlock,
  onRevealHiddenRows,
  scrollRef,
  freezeColumnCount,
  activeSheetName,
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
  baseRowEntryByRowNumber,
  mineRowEntryByRowNumber,
  compareStateByRow,
  maskedRegions,
  baseCompareCellsByRowNumber,
  mineCompareCellsByRowNumber,
  compareMode,
}: UseWorkbookCompareBodyRenderPropsParams): ComponentProps<typeof WorkbookCompareBody> {
  const stackedCanvasProps = useMemo<ComponentProps<typeof WorkbookCompareBody>['stackedCanvasProps']>(() => ({
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
    baseRowEntryByRowNumber,
    mineRowEntryByRowNumber,
    compareStateByRow,
    maskedRegions,
    baseCompareCellsByRowNumber,
    mineCompareCellsByRowNumber,
    compareMode,
  }), [
    activeSheetName,
    baseMergedRanges,
    baseCompareCellsByRowNumber,
    baseRowEntryByRowNumber,
    baseVersion,
    columnLayoutByColumn,
    compareMode,
    compareStateByRow,
    maskedRegions,
    fontSize,
    freezeColumnCount,
    headerRowNumber,
    minBodyWidth,
    mineMergedRanges,
    mineCompareCellsByRowNumber,
    mineRowEntryByRowNumber,
    mineVersion,
    onHoverChange,
    onSelectionRequest,
    renderColumns,
    scrollRef,
    selection,
    viewportWidth,
    visibleColumns,
  ]);

  const columnsCanvasProps = useMemo<ComponentProps<typeof WorkbookCompareBody>['columnsCanvasProps']>(() => ({
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
    baseRowEntryByRowNumber,
    mineRowEntryByRowNumber,
    compareStateByRow,
    maskedRegions,
    baseCompareCellsByRowNumber,
    mineCompareCellsByRowNumber,
    compareMode,
  }), [
    activeSheetName,
    baseCompareCellsByRowNumber,
    baseMergedRanges,
    baseRowEntryByRowNumber,
    baseVersion,
    columnLayoutByColumn,
    compareMode,
    compareStateByRow,
    maskedRegions,
    fontSize,
    freezeColumnCount,
    headerRowNumber,
    minBodyWidth,
    mineCompareCellsByRowNumber,
    mineMergedRanges,
    mineRowEntryByRowNumber,
    mineVersion,
    onHoverChange,
    onSelectionRequest,
    renderColumns,
    scrollRef,
    selection,
    viewportWidth,
    visibleColumns,
  ]);

  return useMemo(() => ({
    mode,
    topOffset,
    minBodyWidth,
    viewportWidth,
    pinnedCollapseWidth,
    stackedSegments,
    stackedCanvasRuns,
    columnsSegments,
    stackedCanvasProps,
    columnsCanvasProps,
    overlayProps,
    renderPinnedCollapseBar,
    onExpandCollapseBlock,
    onRevealHiddenRows,
  }), [
    columnsCanvasProps,
    columnsSegments,
    minBodyWidth,
    mode,
    onExpandCollapseBlock,
    onRevealHiddenRows,
    overlayProps,
    pinnedCollapseWidth,
    renderPinnedCollapseBar,
    stackedCanvasProps,
    stackedCanvasRuns,
    stackedSegments,
    topOffset,
    viewportWidth,
  ]);
}
