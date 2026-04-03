// src/components/SplitPanel.tsx  [v4 — typecheck clean]
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  startTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type {
  DiffLine,
  SearchMatch,
  SplitRow,
  SyntaxPresentation,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from '@/types';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { buildSplitRows } from '@/engine/text/diff';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
import { useVirtual, ROW_H } from '@/hooks/virtualization/useVirtual';
import { LN_W } from '@/constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import { extractVersionLabel } from '@/utils/diff/diffMeta';
import { getSplitLineSyntaxTokens } from '@/utils/diff/syntaxHighlighting';
import { getTextVerticalRenderMode } from '@/utils/diff/splitRowBehavior';
import {
  findWorkbookSectionIndex,
  getWorkbookColumnLabels,
  getWorkbookSections,
} from '@/utils/workbook/workbookSections';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
} from '@/utils/workbook/workbookNavigation';
import {
  type CollapseExpansionState,
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
} from '@/utils/collapse/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  findCollapsedRowTarget,
} from '@/utils/collapse/collapsibleRows';
import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '@/utils/collapse/collapseNavigation';
import SplitCell from '@/components/diff/SplitCell';
import DiffRow from '@/components/diff/DiffRow';
import CollapseBar from '@/components/diff/CollapseBar';
import CollapseJumpButton from '@/components/diff/CollapseJumpButton';
import MiniMap from '@/components/diff/MiniMap';
import type { TokenSearchRange } from '@/components/shared/TokenText';

const CONTEXT_LINES = 3;
const DOUBLE_ROW_H = (ROW_H * 2) + 1;
const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;
const SPLIT_DIVIDER_WIDTH = 12;
type CollapseNavigationHandler = (direction: 'prev' | 'next') => void;

// Fully typed — no `as any` casts
type SplitItem =
  | { kind: 'split-line';     row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; count: number; blockId: string; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number };

function isEqualSplitRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function splitRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function splitRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, value));
}

interface SplitPanelProps {
  diffLines: DiffLine[];
  syntaxPresentation?: SyntaxPresentation | null;
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  searchJumpNonce: number;
  hunkPositions: number[];
  showWhitespace: boolean;
  fontSize: number;
  vertical: boolean;
  onScrollerReady: (scrollToIndex: (idx: number, align?: 'start' | 'center') => void) => void;
  onCollapseNavigationReady?: ((navigate: CollapseNavigationHandler | null) => void) | undefined;
  baseName?: string;
  mineName?: string;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
}

const SplitPanel = memo(({
  diffLines, syntaxPresentation = null, collapseCtx, activeHunkIdx, searchMatches, activeSearchIdx,
  searchJumpNonce,
  hunkPositions, showWhitespace, fontSize, vertical, onScrollerReady, onCollapseNavigationReady,
  baseName = '', mineName = '', selectedCell = null, onSelectCell, onWorkbookNavigationReady,
}: SplitPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const leftPaneScrollRef = useRef<HTMLDivElement>(null);
  const rightPaneScrollRef = useRef<HTMLDivElement>(null);
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const splitterCleanupRef = useRef<(() => void) | null>(null);
  const splitRatioRef = useRef(DEFAULT_SPLIT_RATIO);
  const splitRatioFrameRef = useRef(0);
  const pendingSplitRatioRef = useRef(DEFAULT_SPLIT_RATIO);
  const syncOwnerRef = useRef<'left' | 'right' | null>(null);
  const programmaticScrollUntilRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const pendingScrollAdjustRef = useRef(0);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const completedSearchJumpNonceRef = useRef<number>(-1);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  const [isResizingSplitter, setIsResizingSplitter] = useState(false);
  const baseVersion = useMemo(() => extractVersionLabel(baseName) || baseName, [baseName]);
  const mineVersion = useMemo(() => extractVersionLabel(mineName) || mineName, [mineName]);

  const splitRows = useMemo(() => buildSplitRows(diffLines), [diffLines]);
  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const isWorkbookMode = workbookSections.length > 0;
  const horizontalSplitEnabled = !vertical && !isWorkbookMode;
  const activeWorkbookSection = workbookSections[activeWorkbookSectionIdx] ?? workbookSections[0];
  const hiddenLineIdxSet = useMemo(() => {
    const next = new Set<number>();
    if (!activeWorkbookSection) return next;
    next.add(activeWorkbookSection.startLineIdx);
    if (activeWorkbookSection.firstDataLineIdx != null) next.add(activeWorkbookSection.firstDataLineIdx);
    return next;
  }, [activeWorkbookSection]);
  const frozenRow = useMemo(() => {
    if (!activeWorkbookSection || activeWorkbookSection.firstDataLineIdx == null) return null;
    return splitRows.find(row => splitRowHasLineIdx(row, activeWorkbookSection.firstDataLineIdx!)) ?? null;
  }, [activeWorkbookSection, splitRows]);
  const visibleSplitRows = useMemo(() => {
    if (!activeWorkbookSection) return splitRows;
    return splitRows.filter(row => (
      row.lineIdxs.some(idx => idx >= activeWorkbookSection.startLineIdx && idx <= activeWorkbookSection.endLineIdx)
      && !row.lineIdxs.some(idx => hiddenLineIdxSet.has(idx))
      && parseWorkbookDisplayLine(row.left?.base ?? row.right?.mine ?? '')?.kind !== 'sheet'
    ));
  }, [activeWorkbookSection, hiddenLineIdxSet, splitRows]);
  const collapsedSourceRows = isWorkbookMode ? visibleSplitRows : splitRows;
  const blockPrefix = isWorkbookMode
    ? `split-${activeWorkbookSection?.name ?? 'workbook'}`
    : 'split-text';
  const rowBlocks = useMemo(
    () => buildCollapsibleRowBlocks(collapsedSourceRows, isEqualSplitRow),
    [collapsedSourceRows],
  );
  const items = useMemo<SplitItem[]>(
    () => buildCollapsedItems(rowBlocks, collapseCtx, expandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix,
      buildRowItem: (row): SplitItem => ({ kind: 'split-line', row, lineIdx: row.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep }): SplitItem => ({
        kind: 'split-collapse',
        count,
        blockId,
        fromIdx,
        toIdx,
        hiddenStart,
        hiddenEnd,
        expandStep,
      }),
    }),
    [blockPrefix, collapseCtx, expandedBlocks, rowBlocks],
  );
  const itemHeights = useMemo(
    () => items.map((item) => {
      if (item.kind === 'split-collapse') return ROW_H;
      if (!vertical) return ROW_H;
      return getTextVerticalRenderMode(item.row) === 'double' ? DOUBLE_ROW_H : ROW_H;
    }),
    [items, vertical],
  );
  const activeScrollRef = horizontalSplitEnabled
    ? (leftPaneScrollRef as RefObject<HTMLDivElement>)
    : (scrollRef as RefObject<HTMLDivElement>);
  const constantVirtual = useVirtual(
    items.length,
    activeScrollRef,
    vertical ? DOUBLE_ROW_H : ROW_H,
    { overscanMin: 40, overscanFactor: 2 },
  );
  const variableVirtual = useVariableVirtual(
    itemHeights,
    activeScrollRef,
    { overscanMin: 40, overscanFactor: 2 },
  );
  const activeVirtual = vertical ? variableVirtual : constantVirtual;
  const { totalH, startIdx, endIdx, scrollToIndex } = activeVirtual;
  const rowWindowOffsetTop = vertical ? variableVirtual.offsetTop : startIdx * ROW_H;
  const textRowLayoutStyle = isWorkbookMode
    ? { width: 'max-content' as const, minWidth: '100%' as const }
    : { width: 'max-content' as const, minWidth: '100%' as const };
  const applySplitRatioStyle = useCallback((ratio: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    container.style.setProperty('--split-left', `${(ratio * 100).toFixed(3)}%`);
    container.style.setProperty('--split-right', `${((1 - ratio) * 100).toFixed(3)}%`);
  }, []);
  const flushPendingSplitRatio = useCallback(() => {
    if (splitRatioFrameRef.current) {
      cancelAnimationFrame(splitRatioFrameRef.current);
      splitRatioFrameRef.current = 0;
    }
    const nextRatio = clampSplitRatio(pendingSplitRatioRef.current);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    return nextRatio;
  }, [applySplitRatioStyle]);
  const queueSplitRatioUpdate = useCallback((ratio: number) => {
    const nextRatio = clampSplitRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    if (splitRatioFrameRef.current) return;
    splitRatioFrameRef.current = requestAnimationFrame(() => {
      splitRatioFrameRef.current = 0;
      const frameRatio = clampSplitRatio(pendingSplitRatioRef.current);
      splitRatioRef.current = frameRatio;
      applySplitRatioStyle(frameRatio);
    });
  }, [applySplitRatioStyle]);
  const commitSplitRatio = useCallback((ratio: number) => {
    const nextRatio = clampSplitRatio(ratio);
    pendingSplitRatioRef.current = nextRatio;
    splitRatioRef.current = nextRatio;
    applySplitRatioStyle(nextRatio);
    setSplitRatio((prev) => (Math.abs(prev - nextRatio) < 0.001 ? prev : nextRatio));
    return nextRatio;
  }, [applySplitRatioStyle]);
  const updateSplitRatioFromClientX = useCallback((clientX: number) => {
    const container = paneContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= SPLIT_DIVIDER_WIDTH) return;
    const nextRatio = clampSplitRatio((clientX - rect.left) / rect.width);
    queueSplitRatioUpdate(nextRatio);
  }, [queueSplitRatioUpdate]);
  const stopSplitterResize = useCallback(() => {
    splitterCleanupRef.current?.();
    splitterCleanupRef.current = null;
    setIsResizingSplitter(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);
  const handleSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopSplitterResize();
    updateSplitRatioFromClientX(event.clientX);
    setIsResizingSplitter(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSplitRatioFromClientX(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      const finalRatio = flushPendingSplitRatio();
      setSplitRatio((prev) => (Math.abs(prev - finalRatio) < 0.001 ? prev : finalRatio));
      stopSplitterResize();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    splitterCleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [flushPendingSplitRatio, stopSplitterResize, updateSplitRatioFromClientX]);
  const handleSplitterKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commitSplitRatio(splitRatioRef.current - 0.02);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      commitSplitRatio(splitRatioRef.current + 0.02);
    }
  }, [commitSplitRatio]);
  const syncPaneScrollPosition = useCallback((source: 'left' | 'right') => {
    if (!horizontalSplitEnabled) return;
    const from = source === 'left' ? leftPaneScrollRef.current : rightPaneScrollRef.current;
    const to = source === 'left' ? rightPaneScrollRef.current : leftPaneScrollRef.current;
    const targetSide = source === 'left' ? 'right' : 'left';
    if (!from || !to) return;
    if (syncOwnerRef.current && syncOwnerRef.current !== source) return;
    syncOwnerRef.current = source;

    if (Math.abs(to.scrollTop - from.scrollTop) > 1) {
      programmaticScrollUntilRef.current[targetSide] = getNow() + 180;
      to.scrollTop = from.scrollTop;
    }
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) {
      programmaticScrollUntilRef.current[targetSide] = getNow() + 180;
      to.scrollLeft = from.scrollLeft;
    }

    requestAnimationFrame(() => {
      syncOwnerRef.current = null;
    });
  }, [horizontalSplitEnabled]);
  const handleHorizontalPaneScroll = useCallback((source: 'left' | 'right') => {
    syncPaneScrollPosition(source);
  }, [syncPaneScrollPosition]);
  const horizontalPaneGridTemplateColumns = useMemo(() => {
    return `minmax(0, calc(var(--split-left, 50%) - ${SPLIT_DIVIDER_WIDTH / 2}px)) ${SPLIT_DIVIDER_WIDTH}px minmax(0, calc(var(--split-right, 50%) - ${SPLIT_DIVIDER_WIDTH / 2}px))`;
  }, []);

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const target = findCollapsedRowTarget(rowBlocks, expandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix,
      rowHasLineIdx: splitRowHasLineIdx,
    });
    if (!target) return false;
    startTransition(() => {
      setExpandedBlocks((prev) => revealCollapsedLine(
        prev,
        target.blockId,
        target.hiddenStart,
        target.hiddenEnd,
        target.targetIndex,
      ));
    });
    return true;
  }, [blockPrefix, expandedBlocks, rowBlocks]);

  const scrollToResolvedLine = useCallback((lineIdx: number, align: 'start' | 'center' = 'center') => {
    const exactIndex = items.findIndex((item) => item.kind === 'split-line' && splitRowHasLineIdx(item.row, lineIdx));
    if (exactIndex >= 0) {
      scrollToIndex(exactIndex, align);
      if (horizontalSplitEnabled) requestAnimationFrame(() => syncPaneScrollPosition('left'));
      setPendingScrollTarget((prev) => (
        prev && prev.lineIdx === lineIdx && prev.align === align ? null : prev
      ));
      return true;
    }
    if (revealLineIfCollapsed(lineIdx)) {
      setPendingScrollTarget({ lineIdx, align });
      return false;
    }
    const nearestIndex = items.findIndex((item) => item.kind === 'split-line' && splitRowTouchesOrAfter(item.row, lineIdx));
    if (nearestIndex >= 0) {
      scrollToIndex(nearestIndex, align);
      if (horizontalSplitEnabled) requestAnimationFrame(() => syncPaneScrollPosition('left'));
      return true;
    }
    return false;
  }, [horizontalSplitEnabled, items, revealLineIfCollapsed, scrollToIndex, syncPaneScrollPosition]);

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
  }, [onScrollerReady, scrollToResolvedLine]);

  const searchMatchSet      = useMemo(() => new Set(searchMatches.map(m => m.lineIdx)), [searchMatches]);
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;
  const searchRangesByLineIdx = useMemo(() => {
    const next = new Map<number, TokenSearchRange[]>();
    searchMatches.forEach((match, index) => {
      const ranges = next.get(match.lineIdx) ?? [];
      ranges.push({
        start: match.start,
        end: match.end,
        active: index === activeSearchIdx,
      });
      next.set(match.lineIdx, ranges);
    });
    return next;
  }, [activeSearchIdx, searchMatches]);
  const getSplitRowSideLineIdx = useCallback((row: SplitRow, side: 'left' | 'right'): number | null => {
    if (side === 'left') {
      return row.left ? (row.lineIdxs[0] ?? null) : null;
    }
    if (!row.right) return null;
    return row.left ? (row.lineIdxs[1] ?? null) : (row.lineIdxs[0] ?? null);
  }, []);

  useEffect(() => {
    if (!isWorkbookMode || workbookSections.length === 0) return;
    setActiveWorkbookSectionIdx(prev => Math.min(prev, workbookSections.length - 1));
  }, [isWorkbookMode, workbookSections.length]);

  useEffect(() => {
    if (!isWorkbookMode || !selectedCell || workbookSections.length === 0) return;
    const nextSectionIdx = findWorkbookSectionIndexByName(workbookSections, selectedCell.sheetName);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [isWorkbookMode, selectedCell, workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode || activeSearchLineIdx < 0) return;
    const nextSectionIdx = findWorkbookSectionIndex(workbookSections, activeSearchLineIdx);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [activeSearchLineIdx, isWorkbookMode, workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode) return;
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx === undefined) return;
    const nextSectionIdx = findWorkbookSectionIndex(workbookSections, targetLineIdx);
    setActiveWorkbookSectionIdx(prev => (prev === nextSectionIdx ? prev : nextSectionIdx));
  }, [activeHunkIdx, hunkPositions, isWorkbookMode, workbookSections]);

  useEffect(() => {
    if (searchJumpNonce === completedSearchJumpNonceRef.current) return;
    if (activeSearchLineIdx < 0) {
      completedSearchJumpNonceRef.current = searchJumpNonce;
      return;
    }
    if (scrollToResolvedLine(activeSearchLineIdx, 'center')) {
      completedSearchJumpNonceRef.current = searchJumpNonce;
    }
  }, [activeSearchLineIdx, scrollToResolvedLine, searchJumpNonce]);

  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (scrollToResolvedLine(pendingScrollTarget.lineIdx, pendingScrollTarget.align)) {
      setPendingScrollTarget(null);
    }
  }, [items, pendingScrollTarget, scrollToResolvedLine]);

  useEffect(() => {
    lastCollapseJumpIndexRef.current = null;
  }, [activeWorkbookSection?.name, diffLines]);

  useEffect(() => {
    if (horizontalSplitEnabled) {
      const left = leftPaneScrollRef.current;
      const right = rightPaneScrollRef.current;
      if (!left || !right) return;
      const scrollAdjust = pendingScrollAdjustRef.current;
      if (!scrollAdjust) return;
      pendingScrollAdjustRef.current = 0;
      const nextTop = Math.max(0, left.scrollTop + scrollAdjust);
      programmaticScrollUntilRef.current.left = getNow() + 180;
      programmaticScrollUntilRef.current.right = getNow() + 180;
      left.scrollTop = nextTop;
      right.scrollTop = nextTop;
      return;
    }
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollTop + scrollAdjust);
  }, [horizontalSplitEnabled, items]);

  const workbookFrozenRowHeight = frozenRow
    ? (vertical ? DOUBLE_ROW_H : ROW_H)
    : 0;
  const workbookHeaderHeight = isWorkbookMode
    ? (vertical ? DOUBLE_ROW_H : ROW_H) + workbookFrozenRowHeight
    : 0;
  const collapseIndexes = useMemo(
    () => getCollapseIndexes(items, (item) => item.kind === 'split-collapse'),
    [items],
  );
  const totalCollapseCount = useMemo(
    () => countRemainingCollapses(items, 0, (item) => item.kind === 'split-collapse'),
    [items],
  );
  const activeCollapsePosition = useMemo(
    () => resolveActiveCollapsePosition(collapseIndexes, lastCollapseJumpIndexRef.current, startIdx),
    [collapseIndexes, startIdx],
  );
  const handleJumpToNextCollapse = useCallback(() => {
    const nextCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      endIdx,
      'next',
    );
    if (nextCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = nextCollapseIndex;
    scrollToIndex(nextCollapseIndex, 'start');
  }, [collapseIndexes, endIdx, scrollToIndex]);
  const handleJumpToPreviousCollapse = useCallback(() => {
    const previousCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      lastCollapseJumpIndexRef.current,
      startIdx,
      'prev',
    );
    if (previousCollapseIndex < 0) return;
    lastCollapseJumpIndexRef.current = previousCollapseIndex;
    scrollToIndex(previousCollapseIndex, 'start');
  }, [collapseIndexes, scrollToIndex, startIdx]);
  const columnLabels = getWorkbookColumnLabels(activeWorkbookSection?.maxColumns ?? 0);
  const singleGridWidth = (LN_W + 3) + (columnLabels.length * WORKBOOK_CELL_WIDTH);
  const workbookNavigationRows = useMemo(() => {
    if (!activeWorkbookSection) return [];
    const sourceRows = [
      ...(frozenRow ? [frozenRow] : []),
      ...items.flatMap(item => item.kind === 'split-line' ? [item.row] : []),
    ];

    return sourceRows.flatMap(row => {
      const entries: Array<NonNullable<ReturnType<typeof buildWorkbookRowEntry>>> = [];
      const baseEntry = buildWorkbookRowEntry(row, 'base', activeWorkbookSection.name, baseVersion);
      const mineEntry = buildWorkbookRowEntry(row, 'mine', activeWorkbookSection.name, mineVersion);
      if (baseEntry) entries.push(baseEntry);
      if (mineEntry) entries.push(mineEntry);
      return entries;
    });
  }, [activeWorkbookSection, baseVersion, frozenRow, items, mineVersion]);

  const handleWorkbookMove = useCallback((direction: WorkbookMoveDirection) => {
    if (!onSelectCell) return;
    const nextSelection = moveWorkbookSelection(workbookNavigationRows, selectedCell, direction);
    if (nextSelection) onSelectCell(nextSelection);
  }, [onSelectCell, selectedCell, workbookNavigationRows]);

  useEffect(() => {
    onWorkbookNavigationReady?.(handleWorkbookMove);
    return () => onWorkbookNavigationReady?.(null);
  }, [handleWorkbookMove, onWorkbookNavigationReady]);

  useEffect(() => {
    onCollapseNavigationReady?.((direction) => {
      if (direction === 'prev') {
        handleJumpToPreviousCollapse();
        return;
      }
      handleJumpToNextCollapse();
    });
    return () => onCollapseNavigationReady?.(null);
  }, [handleJumpToNextCollapse, handleJumpToPreviousCollapse, onCollapseNavigationReady]);

  useEffect(() => {
    if (!isWorkbookMode || !selectedCell || !activeWorkbookSection) return;
    if (selectedCell.sheetName !== activeWorkbookSection.name) return;
    const idx = items.findIndex(item => {
      if (item.kind !== 'split-line') return false;
      const entry = buildWorkbookRowEntry(
        item.row,
        selectedCell.side,
        activeWorkbookSection.name,
        selectedCell.side === 'base' ? baseVersion : mineVersion,
      );
      return entry?.rowNumber === selectedCell.rowNumber;
    });
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeWorkbookSection, baseVersion, isWorkbookMode, items, mineVersion, scrollToIndex, selectedCell]);

  const renderWorkbookColumns = (accent: string, stickyLeftBase = 0) => (
    <div style={{
      display: 'flex',
      height: ROW_H,
      minWidth: singleGridWidth,
      background: cssVar('bg1'),
    }}>
      <div style={{
        width: LN_W + 3,
        minWidth: LN_W + 3,
        borderBottom: `1px solid ${cssVar('border')}`,
        background: cssVar('bg2'),
        position: 'sticky',
        left: stickyLeftBase,
        zIndex: 7,
        boxShadow: `10px 0 14px -14px ${cssVar('border2')}`,
      }} />
      {columnLabels.map((label, index) => (
        <div
          key={label}
          style={{
            width: WORKBOOK_CELL_WIDTH,
            minWidth: WORKBOOK_CELL_WIDTH,
            maxWidth: WORKBOOK_CELL_WIDTH,
            borderLeft: `1px solid ${cssVar('border')}`,
            borderBottom: `1px solid ${cssVar('border')}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            background: cssVar('bg1'),
            fontSize: 11,
            fontWeight: 700,
            position: index === 0 ? 'sticky' : 'relative',
            left: index === 0 ? stickyLeftBase + LN_W + 3 : undefined,
            zIndex: index === 0 ? 6 : 1,
            boxShadow: index === 0 ? `10px 0 14px -14px ${cssVar('border2')}` : undefined,
          }}>
          {label}
        </div>
      ))}
    </div>
  );

  const renderWorkbookFrozenRow = () => {
    if (!frozenRow) return null;
    return (
      <div
        style={{
          height: vertical ? DOUBLE_ROW_H : ROW_H,
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          width: 'max-content',
          minWidth: '100%',
          background: cssVar('bg1'),
        }}>
        <SplitCell
          line={frozenRow.left}
          side="left"
          syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, frozenRow.left, 'left')}
          widthMode={vertical ? 'content' : 'fill'}
          lineNumberLayout={vertical ? 'paired' : 'single'}
          isReplacementPair={Boolean(frozenRow.isReplacementPair)}
          isSearchMatch={false}
          isActiveSearch={false}
          showWhitespace={showWhitespace}
          fontSize={fontSize}
          sheetName={activeWorkbookSection?.name ?? ''}
          versionLabel={baseVersion}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          stickyLeftBase={0}
        />
        <div
          style={vertical
            ? { height: 1, background: cssVar('border'), width: '100%', flexShrink: 0 }
            : { width: 1, background: cssVar('border'), flexShrink: 0 }}
        />
        <SplitCell
          line={frozenRow.right}
          side="right"
          syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, frozenRow.right, 'right')}
          widthMode={vertical ? 'content' : 'fill'}
          lineNumberLayout={vertical ? 'paired' : 'single'}
          isReplacementPair={Boolean(frozenRow.isReplacementPair)}
          isSearchMatch={false}
          isActiveSearch={false}
          showWhitespace={showWhitespace}
          fontSize={fontSize}
          sheetName={activeWorkbookSection?.name ?? ''}
          versionLabel={mineVersion}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          stickyLeftBase={vertical ? 0 : singleGridWidth + 1}
        />
      </div>
    );
  };

  useEffect(() => () => {
    if (splitRatioFrameRef.current) cancelAnimationFrame(splitRatioFrameRef.current);
    stopSplitterResize();
  }, [stopSplitterResize]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
    pendingSplitRatioRef.current = splitRatio;
    applySplitRatioStyle(splitRatio);
  }, [applySplitRatioStyle, splitRatio]);

  if (horizontalSplitEnabled) {
    const renderTextPane = (side: 'left' | 'right') => (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div
          ref={side === 'left' ? leftPaneScrollRef : rightPaneScrollRef}
          onScroll={() => handleHorizontalPaneScroll(side)}
          className="flex-1 overflow-auto relative min-w-0 min-h-0"
          style={{ overflowAnchor: 'none' }}>
          <div style={{ height: totalH, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: rowWindowOffsetTop, left: 0, width: 'max-content', minWidth: '100%' }}>
            {items.slice(startIdx, endIdx).map((item) => {
              const key = item.kind === 'split-collapse'
                ? `${side}-${item.blockId}-${item.hiddenStart}-${item.hiddenEnd}`
                : `${side}-row-${item.lineIdx}`;

              if (item.kind === 'split-collapse') {
                if (side === 'right') {
                  return (
                    <div
                      key={key}
                      style={{
                        height: ROW_H,
                        minWidth: '100%',
                        borderTop: `1px dashed ${cssVar('border')}`,
                        borderBottom: `1px dashed ${cssVar('border')}`,
                        background: cssVar('bg2'),
                      }}
                    />
                  );
                }

                return (
                  <div key={key} style={{ position: 'relative', zIndex: 12, pointerEvents: 'auto' }}>
                    <CollapseBar
                      count={item.count}
                      expandCount={Math.min(item.count, item.expandStep)}
                      onExpand={() => {
                        const revealCount = Math.min(item.count, item.expandStep);
                        pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(item.count, revealCount) * ROW_H;
                        setExpandedBlocks((prev) => expandCollapseBlock(
                          prev,
                          item.blockId,
                          item.hiddenStart,
                          item.hiddenEnd,
                          revealCount,
                        ));
                      }}
                      onExpandAll={() => {
                        setExpandedBlocks((prev) => expandCollapseBlockFully(
                          prev,
                          item.blockId,
                          item.hiddenStart,
                          item.hiddenEnd,
                        ));
                      }}
                    />
                  </div>
                );
              }

              const isSearchMatch = item.row.lineIdxs.some(idx => searchMatchSet.has(idx));
              const isActiveSearch = item.row.lineIdxs.includes(activeSearchLineIdx);
              const line = side === 'left' ? item.row.left : item.row.right;

              return (
                <div key={key} style={{ width: 'max-content', minWidth: '100%', height: ROW_H }}>
                  <SplitCell
                    line={line}
                    side={side}
                    syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, line, side)}
                    widthMode="content"
                    lineNumberLayout="single"
                    isReplacementPair={Boolean(item.row.isReplacementPair)}
                    isSearchMatch={isSearchMatch}
                    isActiveSearch={isActiveSearch}
                    searchRanges={(() => {
                      const sideLineIdx = getSplitRowSideLineIdx(item.row, side);
                      return sideLineIdx != null ? (searchRangesByLineIdx.get(sideLineIdx) ?? []) : [];
                    })()}
                    showWhitespace={showWhitespace}
                    fontSize={fontSize}
                    sheetName=""
                    versionLabel={side === 'left' ? baseVersion : mineVersion}
                    selectedCell={null}
                    onSelectCell={undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );

    return (
      <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
          <div
            ref={paneContainerRef}
            className="flex-1 min-w-0 min-h-0"
            style={{
              display: 'grid',
              gridTemplateColumns: horizontalPaneGridTemplateColumns,
              alignItems: 'stretch',
            }}>
            {renderTextPane('left')}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整左右文本宽度"
              aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
              aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
              aria-valuenow={Math.round(splitRatio * 100)}
              tabIndex={0}
              onPointerDown={handleSplitterPointerDown}
              onKeyDown={handleSplitterKeyDown}
              onDoubleClick={() => commitSplitRatio(DEFAULT_SPLIT_RATIO)}
              style={{
                position: 'relative',
                cursor: 'col-resize',
                touchAction: 'none',
                background: isResizingSplitter ? cssAlpha('acc', '12') : 'transparent',
                outline: 'none',
              }}>
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 1,
                  transform: 'translateX(-50%)',
                  background: isResizingSplitter ? cssVar('acc') : cssVar('border'),
                  boxShadow: `0 0 0 1px ${isResizingSplitter ? cssVar('acc') : cssVar('border')}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 4,
                  height: 56,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: 999,
                  background: isResizingSplitter ? cssAlpha('acc', '44') : cssAlpha('border', '66'),
                }}
              />
            </div>
            {renderTextPane('right')}
          </div>
          <CollapseJumpButton
            onPrev={handleJumpToPreviousCollapse}
            onNext={handleJumpToNextCollapse}
            currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
            totalCount={totalCollapseCount}
            storageKey="text-split-h"
          />
        </div>
        <MiniMap
          diffLines={diffLines}
          scrollRef={leftPaneScrollRef as RefObject<HTMLDivElement>}
          totalH={totalH}
          searchMatches={searchMatches}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
      <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
        {isWorkbookMode && activeWorkbookSection && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px 6px',
            background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
            borderBottom: `1px solid ${cssVar('border')}`,
            flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            {workbookSections.map((section, index) => (
              <button
                key={`${section.name}-${section.startLineIdx}`}
                onClick={() => setActiveWorkbookSectionIdx(index)}
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${index === activeWorkbookSectionIdx ? cssAlpha('acc2', '66') : cssVar('border')}`,
                  background: index === activeWorkbookSectionIdx ? cssAlpha('acc2', '20') : cssVar('bg2'),
                  color: index === activeWorkbookSectionIdx ? cssVar('acc2') : cssVar('t1'),
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                {section.name}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto relative min-w-0 min-h-0" style={{ overflowAnchor: 'none' }}>
          <div style={{ height: totalH + workbookHeaderHeight, pointerEvents: 'none' }} />
          {isWorkbookMode && (
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              isolation: 'isolate',
              background: cssVar('bg1'),
              boxShadow: `0 1px 0 ${cssVar('border')}`,
            }}>
              {vertical ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {renderWorkbookColumns(cssVar('acc2'), 0)}
                  <div style={{ height: 1, background: cssVar('border') }} />
                  {renderWorkbookColumns(cssVar('acc'), 0)}
                </div>
              ) : (
                <div style={{ display: 'flex', minWidth: 'max-content' }}>
                  {renderWorkbookColumns(cssVar('acc2'), 0)}
                  <div style={{ width: 1, background: cssVar('border'), flexShrink: 0 }} />
                  {renderWorkbookColumns(cssVar('acc'), singleGridWidth + 1)}
                </div>
              )}
              {renderWorkbookFrozenRow()}
            </div>
          )}

          <div style={isWorkbookMode
            ? { position: 'absolute', top: workbookHeaderHeight + rowWindowOffsetTop, left: 0, minWidth: '100%' }
            : { position: 'absolute', top: workbookHeaderHeight + rowWindowOffsetTop, left: 0, width: 'max-content', minWidth: '100%' }}>
          {items.slice(startIdx, endIdx).map((item) => {
            const key = item.kind === 'split-collapse'
              ? `${item.blockId}-${item.hiddenStart}-${item.hiddenEnd}`
              : `row-${item.lineIdx}`;

            if (item.kind === 'split-collapse') {
              return (
                <div key={key} style={{ position: 'relative', zIndex: 12, pointerEvents: 'auto' }}>
                  <CollapseBar count={item.count} expandCount={Math.min(item.count, item.expandStep)}
                    onExpand={() => {
                      const revealCount = Math.min(item.count, item.expandStep);
                      pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(item.count, revealCount) * ROW_H;
                      setExpandedBlocks(prev => expandCollapseBlock(
                        prev,
                        item.blockId,
                        item.hiddenStart,
                        item.hiddenEnd,
                        revealCount,
                      ));
                    }}
                    onExpandAll={() => {
                      setExpandedBlocks(prev => expandCollapseBlockFully(
                        prev,
                        item.blockId,
                        item.hiddenStart,
                        item.hiddenEnd,
                      ));
                    }} />
                </div>
              );
            }

            // item.kind === 'split-line' — fully typed
            const renderMode = vertical ? getTextVerticalRenderMode(item.row) : 'double';
            const isSearchMatch = item.row.lineIdxs.some(idx => searchMatchSet.has(idx));
            const isActiveSearch = item.row.lineIdxs.includes(activeSearchLineIdx);
            const singleLine = renderMode === 'single-left'
              ? item.row.left
              : renderMode === 'single-right'
              ? item.row.right
              : renderMode === 'single-equal'
              ? (item.row.left ?? item.row.right)
              : null;

            if (vertical && singleLine) {
              return (
                <div key={key} style={{ ...textRowLayoutStyle, height: ROW_H }}>
                  <DiffRow
                    line={singleLine}
                    syntaxTokens={getSplitLineSyntaxTokens(
                      syntaxPresentation,
                      singleLine,
                      singleLine === item.row.left ? 'left' : 'right',
                    )}
                    isReplacementPair={Boolean(item.row.isReplacementPair)}
                    widthMode="content"
                    isSearchMatch={isSearchMatch}
                    isActiveSearch={isActiveSearch}
                    searchRanges={(() => {
                      const lineIdx = renderMode === 'single-left'
                        ? getSplitRowSideLineIdx(item.row, 'left')
                        : renderMode === 'single-right'
                          ? getSplitRowSideLineIdx(item.row, 'right')
                          : (item.row.lineIdxs[0] ?? null);
                      return lineIdx != null ? (searchRangesByLineIdx.get(lineIdx) ?? []) : [];
                    })()}
                    showWhitespace={showWhitespace}
                    fontSize={fontSize}
                  />
                </div>
              );
            }

            const rowHeight = vertical && renderMode === 'double' ? DOUBLE_ROW_H : ROW_H;
            return (
              <div key={key} style={{
                height: rowHeight,
                display: 'flex',
                flexDirection: vertical ? 'column' : 'row',
                ...textRowLayoutStyle,
              }}>
                <SplitCell
                  line={item.row.left} side="left"
                  syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, item.row.left, 'left')}
                  widthMode={vertical ? 'content' : 'fill'}
                  lineNumberLayout={vertical ? 'paired' : 'single'}
                  isReplacementPair={Boolean(item.row.isReplacementPair)}
                  isSearchMatch={isSearchMatch}
                  isActiveSearch={isActiveSearch}
                  searchRanges={(() => {
                    const sideLineIdx = getSplitRowSideLineIdx(item.row, 'left');
                    return sideLineIdx != null ? (searchRangesByLineIdx.get(sideLineIdx) ?? []) : [];
                  })()}
                  showWhitespace={showWhitespace}
                   fontSize={fontSize}
                   sheetName={activeWorkbookSection?.name ?? ''}
                   versionLabel={baseVersion}
                   selectedCell={selectedCell}
                   onSelectCell={onSelectCell}
                   stickyLeftBase={0}
                 />
                 <div
                   style={vertical
                     ? { height: 1, background: cssVar('border'), width: '100%', flexShrink: 0 }
                     : { width: 1, background: cssVar('border'), flexShrink: 0 }} />
                <SplitCell
                  line={item.row.right} side="right"
                  syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, item.row.right, 'right')}
                  widthMode={vertical ? 'content' : 'fill'}
                  lineNumberLayout={vertical ? 'paired' : 'single'}
                  isReplacementPair={Boolean(item.row.isReplacementPair)}
                  isSearchMatch={isSearchMatch}
                  isActiveSearch={isActiveSearch}
                  searchRanges={(() => {
                    const sideLineIdx = getSplitRowSideLineIdx(item.row, 'right');
                    return sideLineIdx != null ? (searchRangesByLineIdx.get(sideLineIdx) ?? []) : [];
                  })()}
                  showWhitespace={showWhitespace}
                   fontSize={fontSize}
                   sheetName={activeWorkbookSection?.name ?? ''}
                   versionLabel={mineVersion}
                   selectedCell={selectedCell}
                   onSelectCell={onSelectCell}
                   stickyLeftBase={vertical ? 0 : singleGridWidth + 1}
                 />
               </div>
             );
          })}
        </div>
        </div>
        <CollapseJumpButton
          onPrev={handleJumpToPreviousCollapse}
          onNext={handleJumpToNextCollapse}
          currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
          totalCount={totalCollapseCount}
          storageKey={vertical ? 'text-split-v' : 'text-split-h'}
        />
      </div>
      <MiniMap
        diffLines={diffLines}
        scrollRef={scrollRef as RefObject<HTMLDivElement>}
        totalH={totalH}
        searchMatches={searchMatches} />
    </div>
  );
});

export default SplitPanel;
