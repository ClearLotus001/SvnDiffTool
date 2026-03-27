// src/components/SplitPanel.tsx  [v4 — typecheck clean]
import { memo, useCallback, useEffect, useRef, useState, useMemo, RefObject, startTransition } from 'react';
import type {
  DiffLine,
  SearchMatch,
  SplitRow,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from '@/types';
import { useTheme } from '@/context/theme';
import { buildSplitRows } from '@/engine/text/diff';
import { useVariableVirtual } from '@/hooks/virtualization/useVariableVirtual';
import { useVirtual, ROW_H } from '@/hooks/virtualization/useVirtual';
import { LN_W } from '@/constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import { extractVersionLabel } from '@/utils/diff/diffMeta';
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

const CONTEXT_LINES = 3;
const DOUBLE_ROW_H = (ROW_H * 2) + 1;
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

interface SplitPanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
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
  diffLines, collapseCtx, activeHunkIdx, searchMatches, activeSearchIdx,
  hunkPositions, showWhitespace, fontSize, vertical, onScrollerReady, onCollapseNavigationReady,
  baseName = '', mineName = '', selectedCell = null, onSelectCell, onWorkbookNavigationReady,
}: SplitPanelProps) => {
  const T         = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustRef = useRef(0);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const baseVersion = useMemo(() => extractVersionLabel(baseName) || baseName, [baseName]);
  const mineVersion = useMemo(() => extractVersionLabel(mineName) || mineName, [mineName]);

  const splitRows = useMemo(() => buildSplitRows(diffLines), [diffLines]);
  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const isWorkbookMode = workbookSections.length > 0;
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
  const constantVirtual = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
    vertical ? DOUBLE_ROW_H : ROW_H,
  );
  const variableVirtual = useVariableVirtual(
    itemHeights,
    scrollRef as RefObject<HTMLDivElement>,
    { overscanMin: 80, overscanFactor: 3 },
  );
  const activeVirtual = vertical ? variableVirtual : constantVirtual;
  const { totalH, startIdx, endIdx, scrollToIndex } = activeVirtual;
  const rowWindowOffsetTop = vertical ? variableVirtual.offsetTop : startIdx * ROW_H;
  const textRowLayoutStyle = isWorkbookMode
    ? { width: 'max-content' as const, minWidth: '100%' as const }
    : { width: 'max-content' as const, minWidth: '100%' as const };

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
      return true;
    }
    return false;
  }, [items, revealLineIfCollapsed, scrollToIndex]);

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      scrollToResolvedLine(lineIdx, align ?? 'center');
    });
  }, [onScrollerReady, scrollToResolvedLine]);

  const searchMatchSet      = useMemo(() => new Set(searchMatches.map(m => m.lineIdx)), [searchMatches]);
  const activeSearchLineIdx = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx]?.lineIdx ?? -1)
    : -1;

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
    if (activeSearchLineIdx < 0) return;
    scrollToResolvedLine(activeSearchLineIdx, 'center');
  }, [activeSearchLineIdx, scrollToResolvedLine]);

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
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollTop + scrollAdjust);
  }, [items]);

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
      background: T.bg1,
    }}>
      <div style={{
        width: LN_W + 3,
        minWidth: LN_W + 3,
        borderBottom: `1px solid ${T.border}`,
        background: T.bg2,
        position: 'sticky',
        left: stickyLeftBase,
        zIndex: 7,
        boxShadow: `10px 0 14px -14px ${T.border2}`,
      }} />
      {columnLabels.map((label, index) => (
        <div
          key={label}
          style={{
            width: WORKBOOK_CELL_WIDTH,
            minWidth: WORKBOOK_CELL_WIDTH,
            maxWidth: WORKBOOK_CELL_WIDTH,
            borderLeft: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            background: T.bg1,
            fontSize: 11,
            fontWeight: 700,
            position: index === 0 ? 'sticky' : 'relative',
            left: index === 0 ? stickyLeftBase + LN_W + 3 : undefined,
            zIndex: index === 0 ? 6 : 1,
            boxShadow: index === 0 ? `10px 0 14px -14px ${T.border2}` : undefined,
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
          background: T.bg1,
        }}>
        <SplitCell
          line={frozenRow.left}
          side="left"
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
            ? { height: 1, background: T.border, width: '100%', flexShrink: 0 }
            : { width: 1, background: T.border, flexShrink: 0 }}
        />
        <SplitCell
          line={frozenRow.right}
          side="right"
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

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {isWorkbookMode && activeWorkbookSection && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px 6px',
            background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
            borderBottom: `1px solid ${T.border}`,
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
                  border: `1px solid ${index === activeWorkbookSectionIdx ? `${T.acc2}66` : T.border}`,
                  background: index === activeWorkbookSectionIdx ? `${T.acc2}20` : T.bg2,
                  color: index === activeWorkbookSectionIdx ? T.acc2 : T.t1,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                {section.name}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          overflowAnchor: 'none',
          position: 'relative',
          minWidth: 0,
          minHeight: 0,
        }}>
          <div style={{ height: totalH + workbookHeaderHeight, pointerEvents: 'none' }} />
          {isWorkbookMode && (
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              isolation: 'isolate',
              background: T.bg1,
              boxShadow: `0 1px 0 ${T.border}`,
            }}>
              {vertical ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {renderWorkbookColumns(T.acc2, 0)}
                  <div style={{ height: 1, background: T.border }} />
                  {renderWorkbookColumns(T.acc, 0)}
                </div>
              ) : (
                <div style={{ display: 'flex', minWidth: 'max-content' }}>
                  {renderWorkbookColumns(T.acc2, 0)}
                  <div style={{ width: 1, background: T.border, flexShrink: 0 }} />
                  {renderWorkbookColumns(T.acc, singleGridWidth + 1)}
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
                <CollapseBar key={key} count={item.count} expandCount={Math.min(item.count, item.expandStep)}
                  onExpand={() => startTransition(() => {
                    const revealCount = Math.min(item.count, item.expandStep);
                    pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(item.count, revealCount) * ROW_H;
                    setExpandedBlocks(prev => expandCollapseBlock(
                      prev,
                      item.blockId,
                      item.hiddenStart,
                      item.hiddenEnd,
                      revealCount,
                    ));
                  })}
                  onExpandAll={() => startTransition(() => {
                    setExpandedBlocks(prev => expandCollapseBlockFully(
                      prev,
                      item.blockId,
                      item.hiddenStart,
                      item.hiddenEnd,
                    ));
                  })} />
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
                    isReplacementPair={Boolean(item.row.isReplacementPair)}
                    widthMode="content"
                    isSearchMatch={isSearchMatch}
                    isActiveSearch={isActiveSearch}
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
                  widthMode={vertical ? 'content' : 'fill'}
                  lineNumberLayout={vertical ? 'paired' : 'single'}
                  isReplacementPair={Boolean(item.row.isReplacementPair)}
                  isSearchMatch={isSearchMatch}
                  isActiveSearch={isActiveSearch}
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
                     ? { height: 1, background: T.border, width: '100%', flexShrink: 0 }
                     : { width: 1, background: T.border, flexShrink: 0 }} />
                <SplitCell
                  line={item.row.right} side="right"
                  widthMode={vertical ? 'content' : 'fill'}
                  lineNumberLayout={vertical ? 'paired' : 'single'}
                  isReplacementPair={Boolean(item.row.isReplacementPair)}
                  isSearchMatch={isSearchMatch}
                  isActiveSearch={isActiveSearch}
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
