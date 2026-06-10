import { useMemo, type ComponentProps, type RefObject } from 'react';

import { WORKBOOK_CONTENT_LEFT } from '@/constants/layout';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookCompareMode, WorkbookDiffRegion, WorkbookMergeRange, WorkbookSelectionRequest, WorkbookSelectionState } from '@/types';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import WorkbookPaneCanvasStrip from '@/components/workbook/WorkbookPaneCanvasStrip';
import type { WorkbookHorizontalPaneSide } from '@/hooks/workbook/useWorkbookHorizontalStickyRenderProps';

interface HorizontalPaneVirtualColumnsLike {
  debug: { viewportWidth: number };
  columnEntries: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  frozenWidth: number;
}

export interface WorkbookHorizontalPaneRenderSideProps {
  paneViewportWidth: number;
  pinnedCollapseWidth: number | string;
  bodyCanvasProps: Omit<ComponentProps<typeof WorkbookPaneCanvasStrip>, 'rows'>;
  overlayProps: ComponentProps<typeof WorkbookActiveRegionOverlayLayer>;
}

interface UseWorkbookHorizontalPaneRenderPropsParams {
  paneVirtualColumnsBySide: Record<WorkbookHorizontalPaneSide, HorizontalPaneVirtualColumnsLike>;
  leftScrollRef: RefObject<HTMLDivElement | null>;
  rightScrollRef: RefObject<HTMLDivElement | null>;
  activeSheetName: string;
  activeDiffRegion: WorkbookDiffRegion | null;
  freezeColumnCount: number;
  singleGridWidth: number;
  viewportHeight: number;
  stickyHeaderHeight: number;
  activeRegionOverlayVisibleRowFrames: Map<number, { top: number; height: number }>;
  activeRegionPulseTriggerKey: string | null;
  overlayLabel: string;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  baseRowEntryByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['rowEntryByRowNumber'];
  mineRowEntryByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['rowEntryByRowNumber'];
  compareStateByRow: ComponentProps<typeof WorkbookPaneCanvasStrip>['compareStateByRow'];
  baseCompareCellsByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['compareCellsByRowNumber'];
  mineCompareCellsByRowNumber: ComponentProps<typeof WorkbookPaneCanvasStrip>['compareCellsByRowNumber'];
  compareMode: WorkbookCompareMode;
}

export function useWorkbookHorizontalPaneRenderProps({
  paneVirtualColumnsBySide,
  leftScrollRef,
  rightScrollRef,
  activeSheetName,
  activeDiffRegion,
  freezeColumnCount,
  singleGridWidth,
  viewportHeight,
  stickyHeaderHeight,
  activeRegionOverlayVisibleRowFrames,
  activeRegionPulseTriggerKey,
  overlayLabel,
  selection,
  onSelectionRequest,
  onHoverChange,
  fontSize,
  visibleColumns,
  baseVersion,
  mineVersion,
  headerRowNumber,
  baseMergedRanges,
  mineMergedRanges,
  baseRowEntryByRowNumber,
  mineRowEntryByRowNumber,
  compareStateByRow,
  baseCompareCellsByRowNumber,
  mineCompareCellsByRowNumber,
  compareMode,
}: UseWorkbookHorizontalPaneRenderPropsParams): Record<WorkbookHorizontalPaneSide, WorkbookHorizontalPaneRenderSideProps> {
  return useMemo(() => {
    const buildSideProps = (side: WorkbookHorizontalPaneSide): WorkbookHorizontalPaneRenderSideProps => {
      const paneVirtualColumns = paneVirtualColumnsBySide[side];
      const paneViewportWidth = paneVirtualColumns.debug.viewportWidth;
      const workbookSide = side === 'left' ? 'base' : 'mine';
      const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
      const boundsModes = ['single'] as const;
      const filterPatch = workbookSide === 'base'
        ? (patch: WorkbookDiffRegion['patches'][number]) => patch.hasBaseSide
        : (patch: WorkbookDiffRegion['patches'][number]) => patch.hasMineSide;

      return {
        paneViewportWidth,
        pinnedCollapseWidth: paneViewportWidth > 0 ? paneViewportWidth : '100%',
        bodyCanvasProps: {
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
          compareStateByRow,
          compareCellsByRowNumber: workbookSide === 'base' ? baseCompareCellsByRowNumber : mineCompareCellsByRowNumber,
          compareMode,
        },
        overlayProps: {
          scrollRef,
          viewportWidth: paneViewportWidth,
          viewportHeight,
          stickyHeaderHeight,
          activeDiffRegion,
          activeSheetName: activeSheetName || null,
          visibleRowFrames: activeRegionOverlayVisibleRowFrames,
          columnLayoutByColumn: paneVirtualColumns.columnLayoutByColumn,
          contentLeft: WORKBOOK_CONTENT_LEFT,
          frozenWidth: paneVirtualColumns.frozenWidth,
          freezeColumnCount,
          resolvePatchBoundsModes: () => [...boundsModes],
          fallbackBoundsModes: [...boundsModes],
          resolveFocusPatchBoundsModes: () => [...boundsModes],
          filterPatch,
          pulseTriggerKey: activeRegionPulseTriggerKey,
          ...(side === 'left' ? { label: overlayLabel } : {}),
        },
      };
    };

    return {
      left: buildSideProps('left'),
      right: buildSideProps('right'),
    };
  }, [
    activeDiffRegion,
    activeRegionOverlayVisibleRowFrames,
    activeSheetName,
    baseCompareCellsByRowNumber,
    baseMergedRanges,
    baseRowEntryByRowNumber,
    baseVersion,
    compareMode,
    compareStateByRow,
    fontSize,
    freezeColumnCount,
    activeRegionPulseTriggerKey,
    headerRowNumber,
    leftScrollRef,
    mineCompareCellsByRowNumber,
    mineMergedRanges,
    mineRowEntryByRowNumber,
    mineVersion,
    onHoverChange,
    onSelectionRequest,
    overlayLabel,
    paneVirtualColumnsBySide,
    rightScrollRef,
    selection,
    singleGridWidth,
    viewportHeight,
    stickyHeaderHeight,
    visibleColumns,
  ]);
}
