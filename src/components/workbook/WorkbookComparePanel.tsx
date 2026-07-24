import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, startTransition } from 'react';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import type {
    DiffLine,
    Hunk,
    SearchMatch,
    WorkbookCompareMode,
    WorkbookCompareLayoutSnapshot,
    WorkbookDiffRegion,
    WorkbookFreezeState,
    WorkbookHiddenStateBySheet,
    WorkbookMoveDirection,
    WorkbookSelectionMode,
    WorkbookSelectedCell,
    WorkbookSelectionRequest,
    WorkbookSelectionState,
  } from '@/types';
import { useI18n } from '@/context/i18n';
import { useTheme, useThemeTokens } from '@/context/theme';
import { cssVar } from '@/theme/cssUtils';
import { resolveDiffIndicatorCssPalette } from '@/utils/diff/diffIndicatorVisuals';
import { useCollapseNavigationState } from '@/hooks/diff/useCollapseNavigationState';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { useHorizontalVirtualColumns } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { useWorkbookExpandedBlocksState } from '@/hooks/workbook/useWorkbookExpandedBlocksState';
import {
  useWorkbookCompareDerivedState,
  type WorkbookCompareRenderItem,
  type WorkbookStackedScrollTarget,
} from '@/hooks/workbook/useWorkbookCompareDerivedState';
import { useWorkbookFrozenPaneState } from '@/hooks/workbook/useWorkbookFrozenPaneState';
import { useWorkbookCompareViewportSync } from '@/hooks/workbook/useWorkbookCompareViewportSync';
import { useWorkbookCompareNavigationEffects } from '@/hooks/workbook/useWorkbookCompareNavigationEffects';
import { useWorkbookCompareBodyLayout } from '@/hooks/workbook/useWorkbookCompareBodyLayout';
import { useWorkbookCompareOverlayLayout } from '@/hooks/workbook/useWorkbookCompareOverlayLayout';
import { useWorkbookCompareStickyRenderProps } from '@/hooks/workbook/useWorkbookCompareStickyRenderProps';
import { useWorkbookCompareBodyRenderProps } from '@/hooks/workbook/useWorkbookCompareBodyRenderProps';
import { useWorkbookCompareNavigationRows } from '@/hooks/workbook/useWorkbookCompareNavigationRows';
import { useWorkbookCompareMiniMapState } from '@/hooks/workbook/useWorkbookCompareMiniMapState';
import { useWorkbookComparePerfStats } from '@/hooks/workbook/useWorkbookComparePerfStats';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
import { LN_W } from '@/constants/layout';
import { WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import {
  getWorkbookColumnLabel,
  type WorkbookSection,
} from '@/utils/workbook/workbookSections';
import {
  formatWorkbookDiffRegionSummary,
} from '@/utils/workbook/workbookDiffRegion';
import {
  type WorkbookMetadataMap,
} from '@/utils/workbook/workbookMeta';
import { buildWorkbookCollapseBlockPrefix } from '@/utils/workbook/workbookCollapse';
import {
  extendWorkbookFreezeRowNumberForMergedCells,
  getResolvedWorkbookFreezeColCount,
  getResolvedWorkbookFreezeRowNumber,
} from '@/utils/workbook/workbookFreeze';
import {
  buildWorkbookSearchSelectionFromTarget,
  findWorkbookSectionIndexByName,
  getWorkbookSplitRowNumber,
  moveWorkbookSelection,
} from '@/utils/workbook/workbookNavigation';
import type { WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';
import {
  parseWorkbookRowLine,
} from '@/utils/workbook/workbookCompare';
import {
  getWorkbookSelectionSpanForSelection,
} from '@/utils/workbook/workbookMergeLayout';
import { resolveWorkbookRegionHorizontalBounds } from '@/utils/workbook/workbookRegionOverlay';
import { workbookDebugLog } from '@/utils/workbook/workbookDebug';
import {
  getWorkbookColumnWidth,
  measureWorkbookAutoFitColumnWidth,
  type WorkbookColumnWidthBySheet,
} from '@/utils/workbook/workbookColumnWidths';
import {
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';
import {
  findCollapsedRowTarget,
} from '@/utils/collapse/collapsibleRows';
import { resolveWorkbookAuxBarPalette } from '@/utils/workbook/workbookRowVisuals';
import CollapseBar from '@/components/diff/CollapseBar';
import CollapseJumpButton from '@/components/diff/CollapseJumpButton';
import WorkbookMiniMap, {
  type WorkbookMiniMapDebugStats,
} from '@/components/workbook/WorkbookMiniMap';
import WorkbookCanvasHoverTooltip, { type WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookPerfDebugPanel from '@/components/workbook/WorkbookPerfDebugPanel';
import WorkbookFrozenPaneOverflowBar from '@/components/workbook/WorkbookFrozenPaneOverflowBar';
import WorkbookSheetTabs from '@/components/workbook/WorkbookSheetTabs';
import WorkbookCompareBody from '@/components/workbook/WorkbookCompareBody';
import WorkbookCompareShell from '@/components/workbook/WorkbookCompareShell';
import WorkbookCompareStickyCanvas from '@/components/workbook/WorkbookCompareStickyCanvas';
import WorkbookCompareStickyRegion from '@/components/workbook/WorkbookCompareStickyRegion';
import { useAppStore } from '@/store/appStore';
import {
  WORKBOOK_CONTEXT_LINES as CONTEXT_LINES,
  workbookRowHasLineIdx as compareRowHasLineIdx,
  workbookRowTouchesOrAfter as compareRowTouchesOrAfter,
  buildSelectionAutoScrollKey,
} from '@/utils/workbook/workbookPanelHelpers';
import {
  findNearestWorkbookVisibleItemIndex,
} from '@/utils/workbook/workbookRenderItemIndexes';
import { buildWorkbookRenderIdentity } from '@/utils/workbook/workbookRenderIdentity';

type CompareMode = 'stacked' | 'columns';

const EMPTY_HEIGHTS: number[] = [];
const EMPTY_MODIFIED_SHEET_NAMES = new Set<string>();
const WORKBOOK_STABLE_COLUMN_WINDOW_LIMIT = 96;

export interface WorkbookComparePanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  guidedHunkRange?: Hunk | null;
  hunkPositions: number[];
  showWhitespace: boolean;
  fontSize: number;
  onScrollerReady: (scrollToIndex: (idx: number, align?: 'start' | 'center') => void) => void;
  baseTitle: string;
  mineTitle: string;
  baseVersionLabel: string;
  mineVersionLabel: string;
  mode: CompareMode;
  activeDiffRegion: WorkbookDiffRegion | null;
  navigationTargetCell: WorkbookSelectedCell | null;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
  onCollapseNavigationReady?: ((navigate: ((direction: 'prev' | 'next') => void) | null) => void) | undefined;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  workbookHiddenStateBySheet: WorkbookHiddenStateBySheet;
  freezeStateBySheet: Record<string, WorkbookFreezeState>;
  columnWidthBySheet: WorkbookColumnWidthBySheet;
  onColumnWidthChange: (sheetName: string, column: number, width: number) => void;
  onRevealHiddenRows: (sheetName: string, rowNumbers: number[]) => void;
  onRevealHiddenColumns: (sheetName: string, columns: number[]) => void;
  workbookSections: WorkbookSection[];
  workbookSectionRowIndex: WorkbookSectionRowIndex;
  modifiedSheetNames?: ReadonlySet<string>;
  activeWorkbookSheetName: string | null;
  onActiveWorkbookSheetChange: (sheetName: string | null) => void;
  compareMode: WorkbookCompareMode;
  sharedExpandedBlocks?: CollapseExpansionState | null;
  onExpandedBlocksChange?: ((sheetName: string | null, activeRegionId: string | null, expandedBlocks: CollapseExpansionState) => void) | undefined;
  active?: boolean;
  showPerfDebug?: boolean;
  showHiddenColumns?: boolean;
  tooltipDisabled?: boolean;
  layoutSnapshot?: WorkbookCompareLayoutSnapshot | null;
  onLayoutSnapshotChange?: ((snapshot: WorkbookCompareLayoutSnapshot) => void) | undefined;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const WorkbookComparePanel = memo(({
  diffLines,
  collapseCtx,
  activeHunkIdx,
  searchMatches,
  activeSearchIdx,
  guidedHunkRange = null,
  showWhitespace: _showWhitespace,
  fontSize,
  onScrollerReady,
  baseTitle,
  mineTitle,
  baseVersionLabel,
  mineVersionLabel,
  mode,
  activeDiffRegion,
  navigationTargetCell,
  selection,
  onSelectionRequest,
  onWorkbookNavigationReady,
  onCollapseNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  workbookHiddenStateBySheet,
  freezeStateBySheet,
  columnWidthBySheet,
  onColumnWidthChange,
  onRevealHiddenRows,
  onRevealHiddenColumns,
  workbookSections,
  workbookSectionRowIndex,
  modifiedSheetNames = EMPTY_MODIFIED_SHEET_NAMES,
  activeWorkbookSheetName,
  onActiveWorkbookSheetChange,
  compareMode,
  sharedExpandedBlocks = null,
  onExpandedBlocksChange,
  active = true,
  showPerfDebug = false,
  showHiddenColumns = false,
  tooltipDisabled = false,
  layoutSnapshot = null,
  onLayoutSnapshotChange,
}: WorkbookComparePanelProps) => {
  const { t } = useI18n();
  const themeKey = useTheme();
  const T = useThemeTokens();
  const modifyIndicatorPalette = resolveDiffIndicatorCssPalette('modify');
  const searchJumpNonce = useAppStore((s) => s.searchJumpNonce);
  const guidedPulseNonce = useAppStore((s) => s.guidedPulseNonce);
  const selectedCell = selection.primary;
  const resolvedActiveWorkbookSectionIdx = activeWorkbookSheetName
    ? findWorkbookSectionIndexByName(workbookSections, activeWorkbookSheetName)
    : 0;
  const activeWorkbookSection = workbookSections[resolvedActiveWorkbookSectionIdx] ?? workbookSections[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRowsScrollRef = useRef<HTMLDivElement>(null);
  const frozenRowsScrollRef = useRef<HTMLDivElement>(null);
  const frozenColumnsScrollRef = useRef<HTMLDivElement>(null);
  const miniMapDebugRef = useRef<WorkbookMiniMapDebugStats | null>({ clickCount: 0, lastClickMs: 0 });
  const pendingScrollAdjustRef = useRef(0);
  const [hoveredCanvasCell, setHoveredCanvasCell] = useState<WorkbookCanvasHoverCell | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const [isFrozenRowsPaneHovered, setIsFrozenRowsPaneHovered] = useState(false);
  const suppressGuidedNavigationUntilRef = useRef(0);
  const lastFreezeSignatureRef = useRef<string | null>(null);
  const lastStickyHeaderRowsAutoScrollKeyRef = useRef('');
  const lastFrozenPaneAutoScrollKeyRef = useRef('');
  const {
    expandedBlocks,
    setExpandedBlocks,
    isContextSettled: isExpandedBlocksContextSettled,
  } = useWorkbookExpandedBlocksState({
    sheetName: activeWorkbookSection?.name ?? null,
    activeRegionId: activeDiffRegion?.id ?? null,
    layoutSnapshot,
    sharedExpandedBlocks,
  });

  const baseVersion = useMemo(() => baseVersionLabel.trim(), [baseVersionLabel]);
  const mineVersion = useMemo(() => mineVersionLabel.trim(), [mineVersionLabel]);
  const searchMatchSet = useMemo(() => new Set(searchMatches.map(match => match.lineIdx)), [searchMatches]);
  const activeSearchMatch = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx] ?? null)
    : null;
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
  const activeRegionPulseTriggerKey = useMemo(() => (
    active && activeDiffRegion && activeDiffRegion.sheetName === activeWorkbookSection?.name
      ? `${guidedPulseNonce}:${activeHunkIdx}:${activeDiffRegion.id}`
      : null
  ), [active, activeDiffRegion, activeHunkIdx, activeWorkbookSection?.name, guidedPulseNonce]);
  const sectionRows = useMemo(
    () => (activeWorkbookSection ? (workbookSectionRowIndex.get(activeWorkbookSection.name)?.rows ?? []) : []),
    [activeWorkbookSection, workbookSectionRowIndex],
  );
  const protectedLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
    if (activeWorkbookSection.firstDataLineIdx != null) next.add(activeWorkbookSection.firstDataLineIdx);
    return next;
  }, [activeWorkbookSection]);

  const activeFreezeState = useMemo(() => {
    if (!activeWorkbookSection) return null;
    return freezeStateBySheet[activeWorkbookSection.name] ?? null;
  }, [activeWorkbookSection, freezeStateBySheet]);
  const activeSheetMergeRanges = useMemo(
    () => activeWorkbookSection
      ? [
          ...(baseWorkbookMetadata?.sheets[activeWorkbookSection.name]?.mergeRanges ?? []),
          ...(mineWorkbookMetadata?.sheets[activeWorkbookSection.name]?.mergeRanges ?? []),
        ]
      : [],
    [activeWorkbookSection, baseWorkbookMetadata, mineWorkbookMetadata],
  );
  const activeHiddenState = useMemo(() => {
    if (!activeWorkbookSection) {
      return {
        hiddenRows: [],
        hiddenColumns: [],
      };
    }
    return workbookHiddenStateBySheet[activeWorkbookSection.name] ?? {
      hiddenRows: [],
      hiddenColumns: [],
    };
  }, [activeWorkbookSection, workbookHiddenStateBySheet]);
  const stickyHeaderFreezeRowNumber = useMemo(
    () => extendWorkbookFreezeRowNumberForMergedCells(
      activeWorkbookSection?.firstDataRowNumber ?? 0,
      activeSheetMergeRanges,
    ),
    [activeSheetMergeRanges, activeWorkbookSection?.firstDataRowNumber],
  );
  const explicitFreezeRowNumber = useMemo(() => {
    const resolvedFreezeRowNumber = getResolvedWorkbookFreezeRowNumber(activeFreezeState, {
      rowNumber: 0,
      colCount: 0,
    });
    return extendWorkbookFreezeRowNumberForMergedCells(resolvedFreezeRowNumber, activeSheetMergeRanges);
  }, [activeSheetMergeRanges, activeFreezeState]);
  const freezeRowNumber = Math.max(stickyHeaderFreezeRowNumber, explicitFreezeRowNumber);
  const freezeColumnCount = useMemo(
    () => getResolvedWorkbookFreezeColCount(activeFreezeState, {
      rowNumber: activeWorkbookSection?.firstDataRowNumber ?? 0,
      colCount: 1,
    }),
    [activeWorkbookSection?.firstDataRowNumber, activeFreezeState],
  );
  const activeSheetCacheKey = activeWorkbookSection?.name ?? '';
  const collapseBlockPrefix = buildWorkbookCollapseBlockPrefix(activeSheetCacheKey);
  const {
    frozenRows,
    rowBlocks,
    hiddenRowNumberSet,
    effectiveExpandedBlocks,
    collapsedItemsMeasured,
    renderItemsMeasured,
    itemsMeasured,
    items,
    rowHeight,
    itemHeights,
    sheetPresentation,
    stackedFastPathMode,
    stackedVirtualItemsMeasured,
    stackedVirtualItems,
    stackedVirtualHeights,
    stackedVirtualOffsets,
    stackedIndexesMeasured,
    renderModel,
  } = useWorkbookCompareDerivedState({
    activeWorkbookSection,
    sectionRows,
    activeSheetCacheKey,
    collapseBlockPrefix,
    protectedLineIdxSet,
    activeHiddenRows: activeHiddenState.hiddenRows,
    activeHiddenColumns: activeHiddenState.hiddenColumns,
    freezeRowNumber,
    expandedBlocks,
    collapseCtx,
    mode,
    compareMode,
    baseVersion,
    mineVersion,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
    showHiddenColumns,
  });
  const stickyHeaderRows = useMemo(
    () => frozenRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber <= stickyHeaderFreezeRowNumber;
    }),
    [frozenRows, stickyHeaderFreezeRowNumber],
  );
  const paneFrozenRows = useMemo(
    () => frozenRows.filter((row) => {
      const rowNumber = getWorkbookSplitRowNumber(row);
      return rowNumber != null && rowNumber > stickyHeaderFreezeRowNumber;
    }),
    [frozenRows, stickyHeaderFreezeRowNumber],
  );
  const stackedRowScrollTargetsBySide = stackedIndexesMeasured.rowScrollTargetsBySide;
  const stackedLineScrollTargets = stackedIndexesMeasured.lineScrollTargets;
  const stackedVisibleRowItemIndexByLineIdx = stackedIndexesMeasured.visibleRowItemIndexByLineIdx;
  const rawRenderItemIndexes = renderModel.renderItemIndexes;
  const columnVisibleRowItemIndexByLineIdx = rawRenderItemIndexes.visibleRowItemIndexByLineIdx;
  const visibleRowItemIndexByLineIdx = mode === 'stacked'
    ? stackedVisibleRowItemIndexByLineIdx
    : columnVisibleRowItemIndexByLineIdx;
  const columnsVariableVirtualHeights = mode === 'columns' ? itemHeights : EMPTY_HEIGHTS;
  const columnsVariableVirtual = useVariableVirtual(
    columnsVariableVirtualHeights,
    scrollRef as RefObject<HTMLDivElement | null>,
    { overscanMin: 12, overscanFactor: 1.5, syncKey: activeWorkbookSection?.name ?? '' },
  );
  const stackedVariableVirtualHeights = mode === 'stacked' ? stackedVirtualHeights : EMPTY_HEIGHTS;
  const stackedVariableVirtual = useVariableVirtual(
    stackedVariableVirtualHeights,
    scrollRef as RefObject<HTMLDivElement | null>,
    { overscanMin: 2, overscanFactor: 0.75, syncKey: activeWorkbookSection?.name ?? '' },
  );
  const activeVirtual = mode === 'stacked' ? stackedVariableVirtual : columnsVariableVirtual;
  const {
    totalH,
    startIdx,
    endIdx,
    scrollToIndex,
    debug: rowVirtualDebug,
  } = activeVirtual;
  const rowWindowOffsetTop = activeVirtual.offsetTop;
  const {
    selectionAutoScrollLockRef,
    userScrollPauseUntilRef,
    lastAutoRowKeyRef,
    lastAutoCellKeyRef,
    lastForcedRevealHunkIdxRef,
    suppressAutoScrollUntilRef,
    markProgrammaticScroll,
    isUserScrollPaused,
    isAutoScrollSuppressed,
    isSelectionAutoScrollLocked,
  } = useWorkbookCompareViewportSync({
    active,
    mode,
    scrollRef,
    activeSheetName: activeWorkbookSection?.name ?? null,
    activeRegionId: activeDiffRegion?.id ?? null,
    expandedBlocks,
    isExpandedBlocksContextSettled,
    onExpandedBlocksChange,
    layoutSnapshot,
    onLayoutSnapshotChange,
    activeHunkIdx,
    selectedCell,
    diffIdentity: diffLines,
    onResetViewportState: () => {
      pendingScrollAdjustRef.current = 0;
      setHoveredCanvasCell(null);
    },
  });
  const scrollToStackedTarget = useCallback((
    target: WorkbookStackedScrollTarget,
    align: 'start' | 'center' = 'center',
    behavior: 'auto' | 'smooth' | 'smart' = 'smart',
  ) => {
    const container = scrollRef.current;
    if (!container) return false;

    const itemTop = stackedVirtualOffsets[target.itemIndex] ?? 0;
    const targetTop = itemTop + target.rowOffsetTop;
    const viewportHeight = rowVirtualDebug.viewportHeight;
    const offset = align === 'center'
      ? Math.max(0, (viewportHeight / 2) - (target.rowHeight / 2))
      : 60;
    const nextTop = Math.max(0, targetTop - offset);
    const distance = Math.abs(container.scrollTop - nextTop);
    const resolvedBehavior = behavior === 'smart'
      ? (distance > Math.max(viewportHeight * 4, target.rowHeight * 200) ? 'auto' : 'smooth')
      : behavior;

    markProgrammaticScroll(420);
    container.scrollTo({
      top: nextTop,
      behavior: resolvedBehavior,
    });
    return true;
  }, [markProgrammaticScroll, rowVirtualDebug.viewportHeight, scrollRef, stackedVirtualOffsets]);

  useEffect(() => {
    if (!tooltipDisabled) return;
    setHoveredCanvasCell(null);
  }, [tooltipDisabled]);

  useEffect(() => {
    setHoveredCanvasCell(null);
  }, [selectedCell, selectedCell?.kind, selectedCell?.sheetName, selectedCell?.side, selectedCell?.rowNumber, selectedCell?.colIndex]);

  useEffect(() => {
    const freezeSignature = `${activeWorkbookSection?.name ?? ''}:${freezeRowNumber}:${freezeColumnCount}`;
    if (lastFreezeSignatureRef.current == null) {
      lastFreezeSignatureRef.current = freezeSignature;
      return;
    }
    if (lastFreezeSignatureRef.current === freezeSignature) return;
    lastFreezeSignatureRef.current = freezeSignature;
    suppressAutoScrollUntilRef.current = Math.max(suppressAutoScrollUntilRef.current, getNow() + 420);
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 420);
    if (!selectedCell || selectedCell.sheetName !== activeWorkbookSection?.name) return;
    const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
    if (selectedCell.kind !== 'column') lastAutoRowKeyRef.current = selectionKey;
    if (selectedCell.kind !== 'row') lastAutoCellKeyRef.current = selectionKey;
  }, [
    activeWorkbookSection?.name,
    freezeColumnCount,
    freezeRowNumber,
    lastAutoCellKeyRef,
    lastAutoRowKeyRef,
    selectedCell,
    selectedCell?.colIndex,
    selectedCell?.kind,
    selectedCell?.rowNumber,
    selectedCell?.sheetName,
    selectedCell?.side,
    suppressAutoScrollUntilRef,
    userScrollPauseUntilRef,
  ]);

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const hiddenRowNumbers = rawRenderItemIndexes.hiddenRowNumbersByLineIdx.get(lineIdx);
    if (hiddenRowNumbers && activeWorkbookSection) {
      onRevealHiddenRows(activeWorkbookSection.name, hiddenRowNumbers);
      return true;
    }

    const target = findCollapsedRowTarget(rowBlocks, effectiveExpandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix: collapseBlockPrefix,
      rowHasLineIdx: compareRowHasLineIdx,
    });
    if (!target) return false;
    setExpandedBlocks((prev) => revealCollapsedLine(
      prev,
      target.blockId,
      target.hiddenStart,
      target.hiddenEnd,
      target.targetIndex,
    ));
    return true;
  }, [activeWorkbookSection, collapseBlockPrefix, effectiveExpandedBlocks, onRevealHiddenRows, rawRenderItemIndexes, rowBlocks, setExpandedBlocks]);

  const scrollToResolvedLine = useCallback((
    lineIdx: number,
    align: 'start' | 'center' = 'center',
    behavior: 'auto' | 'smooth' | 'smart' = 'smart',
  ) => {
    if (mode === 'stacked') {
      const exactTarget = stackedLineScrollTargets.get(lineIdx);
      if (exactTarget) {
        scrollToStackedTarget(exactTarget, align, behavior);
        setPendingScrollTarget((prev) => (
          prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
        ));
        return true;
      }
    }

    const exactIndex = visibleRowItemIndexByLineIdx.get(lineIdx) ?? -1;
    if (exactIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(exactIndex, align, behavior);
      setPendingScrollTarget((prev) => (
        prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
      ));
      return true;
    }
    if (revealLineIfCollapsed(lineIdx)) {
      setPendingScrollTarget({ lineIdx, align });
      return false;
    }
    const nearestIndex = mode === 'stacked'
      ? stackedVirtualItems.findIndex((item) => item.kind === 'rows' && item.rows.some((row) => compareRowTouchesOrAfter(row.row, lineIdx)))
      : findNearestWorkbookVisibleItemIndex(rawRenderItemIndexes, lineIdx);
    if (nearestIndex >= 0) {
      if (mode === 'stacked') {
        const nearestItem = stackedVirtualItems[nearestIndex];
        if (nearestItem?.kind === 'rows') {
          const nearestRow = nearestItem.rows.find((row) => compareRowTouchesOrAfter(row.row, lineIdx)) ?? nearestItem.rows[0];
          if (nearestRow) {
            return scrollToStackedTarget({
              itemIndex: nearestIndex,
              rowOffsetTop: nearestItem.rows
                .slice(0, nearestItem.rows.indexOf(nearestRow))
                .reduce((sum, row) => sum + row.height, 0),
              rowHeight: nearestRow.height,
            }, align, behavior);
          }
        }
      }
      markProgrammaticScroll(420);
      scrollToIndex(nearestIndex, align, behavior);
      return true;
    }
    return false;
  }, [markProgrammaticScroll, mode, rawRenderItemIndexes, revealLineIfCollapsed, scrollToIndex, scrollToStackedTarget, stackedLineScrollTargets, stackedVirtualItems, visibleRowItemIndexByLineIdx]);

  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (scrollToResolvedLine(pendingScrollTarget.lineIdx, pendingScrollTarget.align)) {
      setPendingScrollTarget(null);
    }
  }, [items, pendingScrollTarget, scrollToResolvedLine]);

  useEffect(() => {
    if (mode !== 'columns') {
      pendingScrollAdjustRef.current = 0;
      return;
    }
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    markProgrammaticScroll(180);
    el.scrollTop = Math.max(0, el.scrollTop + scrollAdjust);
  }, [items, markProgrammaticScroll, mode]);

  useEffect(() => {
    if (!active) return;
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
    return () => {
      onScrollerReady(() => {});
    };
  }, [active, onScrollerReady, scrollToResolvedLine]);

  const activeSheetName = activeWorkbookSection?.name ?? '';
  const resolveColumnWidth = useCallback(
    (column: number) => getWorkbookColumnWidth(columnWidthBySheet, activeSheetName, column),
    [activeSheetName, columnWidthBySheet],
  );
  const virtualColumns = useHorizontalVirtualColumns({
    scrollRef,
    frozenScrollRef: frozenColumnsScrollRef as RefObject<HTMLDivElement | null>,
    columns: sheetPresentation.visibleColumns,
    cellWidth: WORKBOOK_CELL_WIDTH,
    frozenCount: freezeColumnCount,
    widthMultiplier: mode === 'columns' ? 2 : 1,
    getColumnWidth: resolveColumnWidth,
    mergedRanges: mode === 'stacked'
      ? [...sheetPresentation.baseMergeRanges, ...sheetPresentation.mineMergeRanges]
      : [],
    overscanMin: 6,
    overscanFactor: 1.5,
    disableVirtualizationBelow: WORKBOOK_STABLE_COLUMN_WINDOW_LIMIT,
    syncKey: activeWorkbookSection?.name ?? '',
  });
  const focusWorkbookCell = useCallback((
    cell: WorkbookSelectedCell,
    strategy: 'focus' | 'ensure-visible' = 'ensure-visible',
  ) => {
    if (cell.kind === 'row') return true;
    const container = scrollRef.current;
    if (!container) return false;
    const frozenColumnsScroller = frozenColumnsScrollRef.current;

    const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
    const mergedRanges = cell.side === 'base'
      ? sheetPresentation.baseMergeRanges
      : sheetPresentation.mineMergeRanges;
    const span = getWorkbookSelectionSpanForSelection(cell, mergedRanges);
    const targetColumn = virtualColumns.columnLayoutByColumn.get(span.startCol);
    const endColumn = virtualColumns.columnLayoutByColumn.get(span.endCol);
    if (!targetColumn || !endColumn) return false;

    const contentOrigin = LN_W + 3;
    const sideOffset = mode === 'columns' && cell.side === 'mine'
      ? targetColumn.width
      : 0;
    const targetLeftWithinFrozenPane = (targetColumn.absoluteOffset ?? targetColumn.offset) + sideOffset;
    const targetRightWithinFrozenPane = (endColumn.absoluteOffset ?? endColumn.offset) + (
      mode === 'columns'
        ? cell.side === 'mine'
          ? endColumn.displayWidth
          : endColumn.width
        : endColumn.width
    );
    const targetLeft = contentOrigin + targetColumn.offset + sideOffset;
    const targetRight = contentOrigin + endColumn.offset + (
      mode === 'columns'
        ? cell.side === 'mine'
          ? endColumn.displayWidth
          : endColumn.width
        : endColumn.width
    );
    const targetWidth = Math.max(targetColumn.width, targetRight - targetLeft);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);

    if (span.endCol < freezeColumnCount && virtualColumns.isFrozenOverflowing && frozenColumnsScroller) {
      const frozenLeftBoundary = frozenColumnsScroller.scrollLeft + desiredPadding;
      const frozenRightBoundary = frozenColumnsScroller.scrollLeft + virtualColumns.frozenWidth - desiredPadding;
      if (
        strategy === 'focus'
        || targetLeftWithinFrozenPane < frozenLeftBoundary
        || targetRightWithinFrozenPane > frozenRightBoundary
      ) {
        frozenColumnsScroller.scrollLeft = Math.max(
          0,
          Math.min(
            targetLeftWithinFrozenPane - desiredPadding,
            virtualColumns.fullFrozenWidth - virtualColumns.frozenWidth,
          ),
        );
      }
      return true;
    }

    if (strategy === 'focus') {
      markProgrammaticScroll(260);
      container.scrollLeft = desiredScrollLeft;
      return true;
    }

    const leftBoundary = container.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = container.scrollLeft + container.clientWidth - desiredPadding;
    if (targetLeft < leftBoundary || targetLeft + targetWidth > rightBoundary) {
      markProgrammaticScroll(260);
      if (targetLeft < leftBoundary) {
        container.scrollLeft = desiredScrollLeft;
      } else {
        container.scrollLeft = Math.max(0, targetLeft + targetWidth - container.clientWidth + desiredPadding);
      }
    }

    return true;
  }, [
    freezeColumnCount,
    mode,
    markProgrammaticScroll,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
    virtualColumns.fullFrozenWidth,
    virtualColumns.isFrozenOverflowing,
  ]);
  const focusWorkbookDiffRegion = useCallback((region: WorkbookDiffRegion) => {
    const container = scrollRef.current;
    if (!container) return;
    const frozenColumnsScroller = frozenColumnsScrollRef.current;

    if (region.endCol < freezeColumnCount && virtualColumns.isFrozenOverflowing && frozenColumnsScroller) {
      const startEntry = virtualColumns.columnLayoutByColumn.get(region.startCol);
      const endEntry = virtualColumns.columnLayoutByColumn.get(region.endCol);
      if (startEntry && endEntry) {
        const desiredPadding = 24;
        const targetLeft = startEntry.absoluteOffset ?? startEntry.offset;
        const targetRight = (endEntry.absoluteOffset ?? endEntry.offset) + endEntry.width;
        const maxScrollLeft = Math.max(0, virtualColumns.fullFrozenWidth - virtualColumns.frozenWidth);
        if (
          targetLeft < frozenColumnsScroller.scrollLeft + desiredPadding
          || targetRight > frozenColumnsScroller.scrollLeft + virtualColumns.frozenWidth - desiredPadding
        ) {
          frozenColumnsScroller.scrollLeft = Math.max(0, Math.min(targetLeft - desiredPadding, maxScrollLeft));
        }
      }
      return;
    }

    const bounds = resolveWorkbookRegionHorizontalBounds({
      region,
      columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
      freezeColumnCount,
      resolvePatchBoundsModes: () => (
        mode === 'stacked'
          ? ['single']
          : ['paired-shared']
      ),
      fallbackBoundsModes: mode === 'stacked'
        ? ['single']
        : ['paired-shared'],
    });
    if (!bounds) return;

    const frozenWidth = LN_W + 3 + virtualColumns.frozenWidth;
    const contentOrigin = LN_W + 3;
    const targetLeft = contentOrigin + bounds.leftOffset;
    const targetRight = contentOrigin + bounds.rightOffset;
    const targetWidth = Math.max(1, bounds.width);
    const desiredPadding = 24;
    const desiredScrollLeft = Math.max(0, targetLeft - frozenWidth - desiredPadding);
    const leftBoundary = container.scrollLeft + frozenWidth + desiredPadding;
    const rightBoundary = container.scrollLeft + container.clientWidth - desiredPadding;

    if (targetLeft < leftBoundary || targetRight > rightBoundary) {
      markProgrammaticScroll(260);
      if (targetLeft < leftBoundary || targetWidth >= container.clientWidth - frozenWidth - (desiredPadding * 2)) {
        container.scrollLeft = desiredScrollLeft;
      } else {
        container.scrollLeft = Math.max(0, targetRight - container.clientWidth + desiredPadding);
      }
    }
  }, [
    freezeColumnCount,
    markProgrammaticScroll,
    mode,
    virtualColumns.columnLayoutByColumn,
    virtualColumns.frozenWidth,
    virtualColumns.fullFrozenWidth,
    virtualColumns.isFrozenOverflowing,
  ]);
  const showColumnHeader = true;
  const headerRowNumber = activeWorkbookSection?.firstDataRowNumber ?? 0;
  const rowEntryByRowNumber = renderModel.rowEntryByRowNumber;
  const compareStateByRow = renderModel.compareStateByRow;
  const compareCellsByRowNumber = renderModel.compareCellsByRowNumber;
  const rowItemIndexBySide = mode === 'stacked'
    ? stackedIndexesMeasured.rowItemIndexBySide
    : rawRenderItemIndexes.rowItemIndexBySide;
  const activeSearchTargetCell = useMemo(() => {
    return buildWorkbookSearchSelectionFromTarget(
      activeSearchMatch?.workbookTarget,
      rowEntryByRowNumber,
      {
        base: sheetPresentation.baseMergeRanges,
        mine: sheetPresentation.mineMergeRanges,
      },
    );
  }, [
    activeSearchMatch,
    rowEntryByRowNumber,
    sheetPresentation.baseMergeRanges,
    sheetPresentation.mineMergeRanges,
  ]);
  const scrollToSearchTarget = useCallback((
    target: WorkbookSelectedCell | null,
    fallbackLineIdx: number,
  ) => {
    if (!target || target.kind === 'column') {
      return {
        didScroll: scrollToResolvedLine(fallbackLineIdx, 'center', 'auto'),
        isExact: true,
      };
    }

    const rowExists = rowEntryByRowNumber[target.side].has(target.rowNumber);
    if (mode === 'stacked') {
      const stackedTarget = stackedRowScrollTargetsBySide[target.side].get(target.rowNumber) ?? null;
      if (stackedTarget) {
        scrollToStackedTarget(stackedTarget, 'center', 'auto');
        return { didScroll: true, isExact: true };
      }
    }

    const rowIndex = rowItemIndexBySide[target.side].get(target.rowNumber) ?? -1;
    if (rowIndex >= 0) {
      markProgrammaticScroll(420);
      scrollToIndex(rowIndex, 'center', 'auto');
      return { didScroll: true, isExact: true };
    }

    return {
      didScroll: scrollToResolvedLine(fallbackLineIdx, 'center', 'auto'),
      isExact: !rowExists,
    };
  }, [
    markProgrammaticScroll,
    mode,
    rowEntryByRowNumber,
    rowItemIndexBySide,
    scrollToIndex,
    scrollToResolvedLine,
    scrollToStackedTarget,
    stackedRowScrollTargetsBySide,
  ]);
  const {
    frozenRowsHeight: stickyHeaderRowsHeight,
    frozenRowsViewportHeight: stickyHeaderRowsViewportHeight,
    frozenRowsWindowOffsetTop: stickyHeaderRowsWindowOffsetTop,
    visibleFrozenColumnsCanvasRows: visibleStickyHeaderColumnsCanvasRows,
    visibleFrozenColumnsCanvasHeight: visibleStickyHeaderColumnsCanvasHeight,
    visibleFrozenStackedCanvasRuns: visibleStickyHeaderStackedCanvasRuns,
  } = useWorkbookFrozenPaneState({
    mode,
    frozenRows: stickyHeaderRows,
    rowHeight,
    itemsCount: items.length,
    viewportHeight: rowVirtualDebug.viewportHeight,
    showColumnHeader: false,
    activeSheetName: activeWorkbookSection?.name ?? '',
    freezeRowNumber: stickyHeaderFreezeRowNumber,
    freezeColumnCount,
    totalContentHeight: totalH,
    totalColumnsWidth: virtualColumns.totalWidth,
    columnEntries: virtualColumns.columnEntries,
    frozenRowsScrollRef: stickyHeaderRowsScrollRef as RefObject<HTMLDivElement | null>,
    lastFrozenPaneAutoScrollKeyRef: lastStickyHeaderRowsAutoScrollKeyRef,
    baseMergeRanges: sheetPresentation.baseMergeRanges,
    mineMergeRanges: sheetPresentation.mineMergeRanges,
  });
  const {
    frozenRowsHeight,
    frozenRowsViewport,
    frozenRowsViewportHeight,
    minBodyWidth,
    frozenRowsWindowOffsetTop,
    scrollToFrozenRowIndex,
    visibleFrozenColumnsCanvasRows,
    visibleFrozenColumnsCanvasHeight,
    visibleFrozenStackedCanvasRuns,
    visibleFrozenRowFramesByKey,
    frozenRowsRangeLabel,
    frozenColumnsRangeLabel,
  } = useWorkbookFrozenPaneState({
    mode,
    frozenRows: paneFrozenRows,
    rowHeight,
    itemsCount: items.length,
    viewportHeight: rowVirtualDebug.viewportHeight,
    showColumnHeader: false,
    activeSheetName: activeWorkbookSection?.name ?? '',
    freezeRowNumber,
    freezeColumnCount,
    totalContentHeight: totalH,
    totalColumnsWidth: virtualColumns.totalWidth,
    columnEntries: virtualColumns.columnEntries,
    frozenRowsScrollRef: frozenRowsScrollRef as RefObject<HTMLDivElement | null>,
    lastFrozenPaneAutoScrollKeyRef,
    baseMergeRanges: sheetPresentation.baseMergeRanges,
    mineMergeRanges: sheetPresentation.mineMergeRanges,
  });
  const totalFrozenRowsHeight = stickyHeaderRowsHeight + frozenRowsHeight;
  const totalFrozenRowsViewportHeight = stickyHeaderRowsViewportHeight + frozenRowsViewportHeight;
  const stickyHeaderHeight = ROW_H + totalFrozenRowsViewportHeight;
  const contentHeight = totalH + stickyHeaderHeight;
  useWorkbookCompareNavigationEffects({
    active,
    activeSearchMatch,
    activeSearchTargetCell,
    activeWorkbookSection,
    activeHiddenRows: activeHiddenState.hiddenRows,
    activeHiddenColumns: activeHiddenState.hiddenColumns,
    showHiddenColumns,
    itemsCount: items.length,
    searchJumpNonce,
    onSelectionRequest,
    onRevealHiddenRows,
    onRevealHiddenColumns,
    scrollToSearchTarget,
    focusWorkbookCell,
    activeDiffRegion,
    navigationTargetCell,
    selectedCell,
    activeHunkIdx,
    guidedPulseNonce,
    mode,
    frozenRows: paneFrozenRows,
    rowItemIndexBySide,
    stackedRowScrollTargetsBySide,
    scrollToFrozenRowIndex,
    scrollToStackedTarget,
    scrollToResolvedLine,
    scrollToIndex,
    focusWorkbookDiffRegion,
    markProgrammaticScroll,
    isAutoScrollSuppressed,
    isUserScrollPaused,
    isSelectionAutoScrollLocked,
    lastAutoRowKeyRef,
    lastAutoCellKeyRef,
    lastForcedRevealHunkIdxRef,
    suppressGuidedNavigationUntilRef,
  });
  const {
    bodySegments,
    stackedCanvasRuns,
    stackedVisibleMergeGroupCount,
    columnsBodySegments,
    rowFramesByKey: bodyRowFramesByKey,
  } = useWorkbookCompareBodyLayout({
    mode,
    stackedVirtualItems,
    startIdx,
    endIdx,
    items,
    guidedHunkRange,
    activeSearchLineIdx,
    searchMatchSet,
    visibleFrozenStackedCanvasRuns,
  });
  const workbookNavigationRows = useWorkbookCompareNavigationRows({
    activeSheetName: activeWorkbookSection?.name ?? null,
    selectedCell,
    frozenRows,
    items,
    baseVersion,
    mineVersion,
    visibleColumns: sheetPresentation.visibleColumns,
    rowEntryByRowNumber,
  });

  const handleWorkbookMove = useCallback((direction: WorkbookMoveDirection) => {
    const nextSelection = moveWorkbookSelection(workbookNavigationRows, selectedCell, direction, {
      base: sheetPresentation.baseMergeRanges,
      mine: sheetPresentation.mineMergeRanges,
    });
    if (nextSelection) {
      onSelectionRequest({
        target: nextSelection,
        reason: 'keyboard',
      });
    }
  }, [onSelectionRequest, selectedCell, sheetPresentation.baseMergeRanges, sheetPresentation.mineMergeRanges, workbookNavigationRows]);

  useEffect(() => {
    if (!active) return;
    onWorkbookNavigationReady?.(handleWorkbookMove);
    return () => onWorkbookNavigationReady?.(null);
  }, [active, handleWorkbookMove, onWorkbookNavigationReady]);

  const miniMapMeasured = useWorkbookCompareMiniMapState({
    activeSearchLineIdx,
    compareMode,
    frozenRows,
    frozenRowsViewportIsOverflowing: frozenRowsViewport.isOverflowing,
    frozenRowsViewportHeight: totalFrozenRowsViewportHeight,
    itemHeights,
    items,
    mode,
    rowHeight,
    searchMatchSet,
    visibleColumns: sheetPresentation.visibleColumns,
    showColumnHeader,
  });
  const miniMapSegments = miniMapMeasured.value;
  const collapseNavigationItems: ReadonlyArray<WorkbookCompareRenderItem | (typeof stackedVirtualItems)[number]> = mode === 'stacked'
    ? stackedVirtualItems
    : items;
  const scrollToCollapseIndex = useCallback((idx: number, align: 'start' | 'center' = 'start') => {
    markProgrammaticScroll(360);
    scrollToIndex(idx, align);
  }, [markProgrammaticScroll, scrollToIndex]);
  const {
    activeCollapseIndex,
    activeCollapsePosition,
    totalCollapseCount,
    handleJumpToNextCollapse,
    handleJumpToPreviousCollapse,
    resetActiveCollapseNavigation,
  } = useCollapseNavigationState({
    items: collapseNavigationItems,
    startIdx,
    endIdx,
    isCollapseItem: (item) => item.kind === 'collapse',
    scrollToIndex: scrollToCollapseIndex,
  });
  const perfStats = useWorkbookComparePerfStats({
    enabled: showPerfDebug,
    mode,
    activeSheetName: activeWorkbookSection?.name ?? '',
    items,
    stackedVirtualItems,
    startIdx,
    endIdx,
    totalColumns: sheetPresentation.visibleColumns.length,
    renderedColumns: virtualColumns.columnEntries.length,
    frozenRowsCount: frozenRows.length,
    freezeColumnCount,
    collapsedItemsDuration: collapsedItemsMeasured.duration,
    hiddenRowNumberCount: hiddenRowNumberSet.size,
    renderItemsDuration: renderItemsMeasured.duration,
    itemsDuration: itemsMeasured.duration,
    hiddenRowsCount: activeHiddenState.hiddenRows.length,
    miniMapDuration: miniMapMeasured.duration,
    rowWindowMs: rowVirtualDebug.lastCalcMs,
    rowWindowUpdates: rowVirtualDebug.rangeUpdates,
    rowOverscan: rowVirtualDebug.overscan,
    rowViewport: rowVirtualDebug.viewportHeight,
    columnWindowMs: virtualColumns.debug.lastCalcMs,
    columnWindowUpdates: virtualColumns.debug.rangeUpdates,
    columnOverscan: virtualColumns.debug.overscan,
    columnViewport: virtualColumns.debug.viewportWidth,
    miniMapDebugRef: miniMapDebugRef as typeof miniMapDebugRef,
    frozenRowsViewportHeight: totalFrozenRowsViewportHeight,
    frozenRowsHeight: totalFrozenRowsHeight,
    frozenRowsOverflow: frozenRowsViewport.isOverflowing,
    frozenColumnsViewport: virtualColumns.frozenWidth,
    frozenColumnsTotalSize: virtualColumns.fullFrozenWidth,
    frozenColumnsOverflow: virtualColumns.isFrozenOverflowing,
    frozenColumnsScrollLeft: virtualColumns.debug.frozenScrollLeft,
  });
  const sheetRenderKey = buildWorkbookRenderIdentity({
    mode,
    sheetName: activeWorkbookSection?.name,
    themeKey,
  });
  useEffect(() => {
    if (!showPerfDebug || !activeWorkbookSection) return;
    workbookDebugLog('WorkbookComparePanel/render-state', {
      panel: mode,
      sheetName: activeWorkbookSection.name,
      sectionRowCount: sectionRows.length,
      frozenRowCount: frozenRows.length,
        itemCount: items.length,
      visibleColumns: sheetPresentation.visibleColumns,
      allColumns: sheetPresentation.allColumns,
      startIdx,
      endIdx,
        rowWindowOffsetTop,
        contentHeight,
        minBodyWidth,
        frozenPane: {
          rows: {
            viewportHeight: totalFrozenRowsViewportHeight,
            totalHeight: totalFrozenRowsHeight,
            overflowing: frozenRowsViewport.isOverflowing,
          },
          columns: {
            viewportWidth: virtualColumns.frozenWidth,
            totalWidth: virtualColumns.fullFrozenWidth,
            overflowing: virtualColumns.isFrozenOverflowing,
            scrollLeft: virtualColumns.debug.frozenScrollLeft,
          },
        },
        timings: {
        collapsedItemsMs: collapsedItemsMeasured.duration,
        hiddenOverlayMs: hiddenRowNumberSet.size > 0 ? renderItemsMeasured.duration : 0,
        filteredItemsMs: itemsMeasured.duration,
        stackedItemsMs: stackedVirtualItemsMeasured.duration,
        stackedItemsCacheHit: stackedVirtualItemsMeasured.cacheHit,
        stackedIndexMapsMs: stackedIndexesMeasured.duration,
        stackedIndexMapsCacheHit: stackedIndexesMeasured.cacheHit,
        rowWindowMs: rowVirtualDebug.lastCalcMs,
        columnWindowMs: virtualColumns.debug.lastCalcMs,
      },
      counts: {
        stackedVirtualItems: stackedVirtualItems.length,
        stackedRowTargetsBase: stackedRowScrollTargetsBySide.base.size,
        stackedRowTargetsMine: stackedRowScrollTargetsBySide.mine.size,
        stackedLineTargets: stackedLineScrollTargets.size,
        visibleLineIndexEntries: visibleRowItemIndexByLineIdx.size,
      },
      stackedFastPath: stackedFastPathMode,
      activeDiffRegion: activeDiffRegion
        ? {
          id: activeDiffRegion.id,
          sheetName: activeDiffRegion.sheetName,
          startRowIndex: activeDiffRegion.startRowIndex,
          endRowIndex: activeDiffRegion.endRowIndex,
          startCol: activeDiffRegion.startCol,
          endCol: activeDiffRegion.endCol,
        }
        : null,
      rowPreview: sectionRows.slice(0, 8).map((row) => {
        const left = parseWorkbookRowLine(row.left);
        const right = parseWorkbookRowLine(row.right);
        return {
          lineIdx: row.lineIdx,
          lineIdxs: row.lineIdxs,
          leftRowNumber: left?.rowNumber ?? null,
          rightRowNumber: right?.rowNumber ?? null,
          leftColumnCount: left?.cells.length ?? 0,
          rightColumnCount: right?.cells.length ?? 0,
          changedColumns: row.workbookRowDelta?.changedColumns ?? [],
        };
      }),
    });
  }, [
    activeDiffRegion,
    activeWorkbookSection,
    contentHeight,
    endIdx,
    totalFrozenRowsHeight,
    frozenRows.length,
    frozenRowsViewport.isOverflowing,
    totalFrozenRowsViewportHeight,
    hiddenRowNumberSet.size,
    items.length,
    itemsMeasured.duration,
    collapsedItemsMeasured.duration,
    minBodyWidth,
    mode,
    renderItemsMeasured.duration,
    rowWindowOffsetTop,
    rowVirtualDebug.lastCalcMs,
    sectionRows,
    sheetPresentation.allColumns,
    sheetPresentation.visibleColumns,
    showPerfDebug,
    startIdx,
    stackedFastPathMode,
    stackedIndexesMeasured.cacheHit,
    stackedIndexesMeasured.duration,
    stackedLineScrollTargets.size,
    stackedRowScrollTargetsBySide.base.size,
    stackedRowScrollTargetsBySide.mine.size,
    stackedVirtualItems.length,
    stackedVirtualItemsMeasured.cacheHit,
    stackedVirtualItemsMeasured.duration,
    visibleRowItemIndexByLineIdx.size,
    virtualColumns.debug.lastCalcMs,
    virtualColumns.debug.frozenScrollLeft,
    virtualColumns.frozenWidth,
    virtualColumns.fullFrozenWidth,
    virtualColumns.isFrozenOverflowing,
  ]);
  const pinnedCollapseWidth = virtualColumns.debug.viewportWidth > 0
    ? virtualColumns.debug.viewportWidth
    : '100%';
  const handleExpandCollapseBlock = useCallback((
    blockId: string,
    hiddenStart: number,
    hiddenEnd: number,
    revealCount: number,
    mode: 'partial' | 'full' = 'partial',
  ) => {
    userScrollPauseUntilRef.current = Math.max(userScrollPauseUntilRef.current, getNow() + 900);
    lastForcedRevealHunkIdxRef.current = activeHunkIdx;
    if (selectedCell && activeWorkbookSection && selectedCell.sheetName === activeWorkbookSection.name) {
      const selectionKey = buildSelectionAutoScrollKey(activeWorkbookSection.name, selectedCell);
      selectionAutoScrollLockRef.current = {
        sheetName: activeWorkbookSection.name,
        hunkIdx: activeHunkIdx,
        rowKey: selectedCell.kind !== 'column' ? selectionKey : '',
        cellKey: selectedCell.kind !== 'row' ? selectionKey : '',
      };
      if (selectedCell.kind !== 'column') lastAutoRowKeyRef.current = selectionKey;
      if (selectedCell.kind !== 'row') lastAutoCellKeyRef.current = selectionKey;
    }
    if (mode === 'partial' && revealCount > 0) {
      const segmentLength = hiddenEnd - hiddenStart + 1;
      pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(segmentLength, revealCount) * ROW_H;
    }
    startTransition(() => {
      setExpandedBlocks((prev) => (
        mode === 'full'
          ? expandCollapseBlockFully(prev, blockId, hiddenStart, hiddenEnd)
          : expandCollapseBlock(prev, blockId, hiddenStart, hiddenEnd, revealCount)
      ));
    });
  }, [activeHunkIdx, activeWorkbookSection, lastAutoCellKeyRef, lastAutoRowKeyRef, lastForcedRevealHunkIdxRef, selectedCell, selectionAutoScrollLockRef, setExpandedBlocks, userScrollPauseUntilRef]);
  const renderPinnedCollapseBar = useCallback((count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void, sourceItemIndex: number) => (
    <div
      style={{
        position: 'sticky',
        left: 0,
        width: pinnedCollapseWidth,
        minWidth: pinnedCollapseWidth,
        overflow: 'hidden',
        zIndex: 5,
      }}>
      <CollapseBar
        count={count}
        expandCount={expandCount}
        active={sourceItemIndex === activeCollapseIndex}
        onExpand={onExpand}
        onExpandAll={onExpandAll}
        palette={resolveWorkbookAuxBarPalette(T, 'mixed')}
      />
    </div>
  ), [T, activeCollapseIndex, pinnedCollapseWidth]);

  useEffect(() => {
    resetActiveCollapseNavigation();
  }, [activeWorkbookSection?.name, diffLines, resetActiveCollapseNavigation]);

  const handleSelectSheet = useCallback((index: number) => {
    onSelectionRequest({
      target: null,
      reason: 'programmatic',
    });
    onActiveWorkbookSheetChange(workbookSections[index]?.name ?? null);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [onActiveWorkbookSheetChange, onSelectionRequest, workbookSections]);
  const handleSelectColumn = useCallback((column: number, side: 'base' | 'mine', meta?: {
    mode?: WorkbookSelectionMode;
    reason?: WorkbookSelectionRequest['reason'];
    clientPoint?: WorkbookSelectionRequest['clientPoint'];
    preserveExistingIfTargetSelected?: boolean;
  }) => {
    if (!activeWorkbookSection) return;
    const label = getWorkbookColumnLabel(column);
    onSelectionRequest({
      target: {
        kind: 'column',
        sheetName: activeWorkbookSection.name,
        side,
        versionLabel: side === 'base' ? baseVersion : mineVersion,
        rowNumber: 0,
        colIndex: column,
        colLabel: label,
        address: label,
        value: '',
        formula: '',
      },
      mode: meta?.mode,
      reason: meta?.reason,
      clientPoint: meta?.clientPoint,
      preserveExistingIfTargetSelected: meta?.preserveExistingIfTargetSelected,
    });
  }, [activeWorkbookSection, baseVersion, mineVersion, onSelectionRequest]);

  const handleResizeColumn = useCallback((column: number, width: number) => {
    if (!activeWorkbookSection) return;
    onColumnWidthChange(activeWorkbookSection.name, column, width);
  }, [activeWorkbookSection, onColumnWidthChange]);

  const handleAutoFitColumn = useCallback((column: number) => {
    if (!activeWorkbookSection) return;
    const width = measureWorkbookAutoFitColumnWidth(sectionRows, column, fontSize);
    onColumnWidthChange(activeWorkbookSection.name, column, width);
  }, [activeWorkbookSection, fontSize, onColumnWidthChange, sectionRows]);
  const handleRevealHiddenHeaderColumns = useCallback((columns: number[]) => {
    if (!activeWorkbookSection) return;
    onRevealHiddenColumns(activeWorkbookSection.name, columns);
  }, [activeWorkbookSection, onRevealHiddenColumns]);
  const handleRevealActiveSheetRows = useCallback((rowNumbers: number[]) => {
    if (!activeWorkbookSection) return;
    onRevealHiddenRows(activeWorkbookSection.name, rowNumbers);
  }, [activeWorkbookSection, onRevealHiddenRows]);

  const stackedHeaderSide = selectedCell && selectedCell.sheetName === activeWorkbookSection?.name
    ? selectedCell.side
    : 'base';
  const stickyCanvasProps = useWorkbookCompareStickyRenderProps({
    mode,
    showColumnHeader,
    viewportWidth: virtualColumns.debug.viewportWidth,
    scrollRef: scrollRef as RefObject<HTMLDivElement | null>,
    stickyHeaderRowsScrollRef: stickyHeaderRowsScrollRef as RefObject<HTMLDivElement | null>,
    frozenRowsScrollRef: frozenRowsScrollRef as RefObject<HTMLDivElement | null>,
    freezeColumnCount,
    minBodyWidth,
    activeSheetName,
    selection,
    fontSize,
    renderColumns: virtualColumns.columnEntries,
    columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
    stackedHeaderSide,
    hiddenColumnSegments: sheetPresentation.hiddenColumnSegments,
    onSelectColumn: handleSelectColumn,
    onRevealHiddenHeaderColumns: handleRevealHiddenHeaderColumns,
    onColumnWidthChange: handleResizeColumn,
    onAutoFitColumn: handleAutoFitColumn,
    isFrozenRowsPaneHovered,
    onFrozenRowsPaneHoverEnter: () => setIsFrozenRowsPaneHovered(true),
    onFrozenRowsPaneHoverLeave: () => setIsFrozenRowsPaneHovered(false),
    stickyHeaderRowsViewportHeight,
    stickyHeaderRowsHeight,
    stickyHeaderRowsWindowOffsetTop,
    visibleStickyHeaderStackedCanvasRuns,
    visibleStickyHeaderColumnsCanvasRows,
    visibleStickyHeaderColumnsCanvasHeight,
    frozenRowsViewportHeight,
    frozenRowsViewportIsOverflowing: frozenRowsViewport.isOverflowing,
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
    onHoverChange: setHoveredCanvasCell,
    visibleColumns: sheetPresentation.visibleColumns,
    baseMergedRanges: sheetPresentation.baseMergeRanges,
    mineMergedRanges: sheetPresentation.mineMergeRanges,
    rowEntryByRowNumber,
    compareStateByRow,
    compareCellsByRowNumber,
    compareMode,
  });
  const activeRegionOverlayProps = useWorkbookCompareOverlayLayout({
    sectionRows,
    showColumnHeader,
    mode,
    stickyHeaderHeight,
    rowWindowOffsetTop,
    frozenRowFramesByKey: visibleFrozenRowFramesByKey,
    bodyRowFramesByKey,
    scrollRef: scrollRef as RefObject<HTMLDivElement | null>,
    viewportWidth: virtualColumns.debug.viewportWidth,
    viewportHeight: rowVirtualDebug.viewportHeight,
    activeDiffRegion,
    activeSheetName: activeWorkbookSection?.name ?? null,
    columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
    contentLeft: LN_W + 3,
    frozenWidth: virtualColumns.frozenWidth,
    freezeColumnCount,
    pulseTriggerKey: activeRegionPulseTriggerKey,
    label: formatWorkbookDiffRegionSummary(activeDiffRegion),
  });
  const bodyRenderProps = useWorkbookCompareBodyRenderProps({
    mode,
    topOffset: stickyHeaderHeight + rowWindowOffsetTop,
    minBodyWidth,
    viewportWidth: virtualColumns.debug.viewportWidth,
    pinnedCollapseWidth,
    stackedSegments: bodySegments,
    stackedCanvasRuns,
    columnsSegments: columnsBodySegments,
    overlayProps: activeRegionOverlayProps,
    renderPinnedCollapseBar,
    onExpandCollapseBlock: handleExpandCollapseBlock,
    onRevealHiddenRows: handleRevealActiveSheetRows,
    scrollRef: scrollRef as RefObject<HTMLDivElement | null>,
    freezeColumnCount,
    activeSheetName,
    baseVersion,
    mineVersion,
    headerRowNumber,
    selection,
    onSelectionRequest,
    onHoverChange: setHoveredCanvasCell,
    fontSize,
    visibleColumns: sheetPresentation.visibleColumns,
    renderColumns: virtualColumns.columnEntries,
    columnLayoutByColumn: virtualColumns.columnLayoutByColumn,
    baseMergedRanges: sheetPresentation.baseMergeRanges,
    mineMergedRanges: sheetPresentation.mineMergeRanges,
    baseRowEntryByRowNumber: rowEntryByRowNumber.base,
    mineRowEntryByRowNumber: rowEntryByRowNumber.mine,
    compareStateByRow,
    baseCompareCellsByRowNumber: compareCellsByRowNumber.base,
    mineCompareCellsByRowNumber: compareCellsByRowNumber.mine,
    compareMode,
  });

  useEffect(() => {
    if (!active) return;
    onCollapseNavigationReady?.((direction) => {
      if (direction === 'prev') {
        handleJumpToPreviousCollapse();
        return;
      }
      handleJumpToNextCollapse();
    });
    return () => onCollapseNavigationReady?.(null);
  }, [active, handleJumpToNextCollapse, handleJumpToPreviousCollapse, onCollapseNavigationReady]);

  return (
    <WorkbookCompareShell
      perfPanel={showPerfDebug ? <WorkbookPerfDebugPanel stats={perfStats} /> : null}
      mergeNotice={stackedVisibleMergeGroupCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: '0 10px 8px',
            padding: '8px 12px',
            borderRadius: 12,
            border: `1px solid ${modifyIndicatorPalette.border}`,
            background: `linear-gradient(180deg, ${modifyIndicatorPalette.softBackground} 0%, ${cssVar('bg1')} 100%)`,
            boxShadow: `0 10px 20px -24px ${modifyIndicatorPalette.shadow}, inset 0 1px 0 ${cssVar('bg0')}`,
            flexShrink: 0,
          }}>
          <div
            style={{
              color: modifyIndicatorPalette.text,
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 800,
              lineHeight: 1.35,
            }}>
            {t('workbookStackedMergeNoticeTitle', { count: stackedVisibleMergeGroupCount })}
          </div>
          <div
            style={{
              marginTop: 4,
              color: cssVar('t1'),
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.45,
            }}>
            {t('workbookStackedMergeNoticeBody')}
          </div>
        </div>
      ) : null}
      frozenOverflowBar={virtualColumns.isFrozenOverflowing ? (
        <WorkbookFrozenPaneOverflowBar
          scrollerRef={frozenColumnsScrollRef as RefObject<HTMLDivElement | null>}
          label={t('workbookFrozenColumnsWindowLabel')}
          itemCount={freezeColumnCount}
          rangeLabel={frozenColumnsRangeLabel}
          totalSize={virtualColumns.fullFrozenWidth}
          viewportSize={virtualColumns.frozenWidth}
          hint={t('workbookFrozenColumnsWindowHintCurrent')}
        />
      ) : null}
      mainContent={(
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-auto relative min-w-0 min-h-0"
          style={{ overflowAnchor: 'none' }}>
          <div key={sheetRenderKey} style={{ position: 'relative', minWidth: minBodyWidth, height: contentHeight }}>
            <WorkbookCompareStickyRegion minBodyWidth={minBodyWidth}>
              <WorkbookCompareStickyCanvas {...stickyCanvasProps} />
            </WorkbookCompareStickyRegion>
            <WorkbookCompareBody {...bodyRenderProps} />
          </div>
        </div>
      )}
      collapseJumpButton={(
        <CollapseJumpButton
          onPrev={handleJumpToPreviousCollapse}
          onNext={handleJumpToNextCollapse}
          currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
          totalCount={totalCollapseCount}
          storageKey={`workbook-${mode}`}
        />
      )}
      miniMap={(
        <WorkbookMiniMap
          segments={miniMapSegments}
          scrollRef={scrollRef as RefObject<HTMLDivElement | null>}
          contentHeight={contentHeight}
          debugRef={miniMapDebugRef}
        />
      )}
      hoverTooltip={!tooltipDisabled ? (
        <WorkbookCanvasHoverTooltip
          hover={hoveredCanvasCell}
          baseTitle={baseTitle}
          mineTitle={mineTitle}
        />
      ) : null}
      sheetTabs={(
        <WorkbookSheetTabs
          sections={workbookSections}
          activeIndex={resolvedActiveWorkbookSectionIdx}
          onSelect={handleSelectSheet}
          fontSize={fontSize}
          modifiedSheetNames={modifiedSheetNames}
        />
      )}
    />
  );
});

export default WorkbookComparePanel;
