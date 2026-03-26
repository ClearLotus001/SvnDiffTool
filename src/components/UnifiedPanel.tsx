// src/components/UnifiedPanel.tsx  [v4 — typecheck clean]
import { memo, useCallback, useEffect, useRef, useState, useMemo, RefObject, startTransition } from 'react';
import type { DiffLine, SearchMatch, RenderItem, CollapseItem, LineItem } from '../types';
import { LN_W } from '../constants/layout';
import { useTheme } from '../context/theme';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import {
  findWorkbookSectionIndex,
  getWorkbookColumnLabels,
  getWorkbookSections,
} from '../utils/workbookSections';
import {
  type CollapseExpansionState,
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  revealCollapsedLine,
} from '../utils/collapseState';
import {
  buildCollapsedItems,
  buildCollapsibleRowBlocks,
  findCollapsedRowTarget,
} from '../utils/collapsibleRows';
import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '../utils/collapseNavigation';
import DiffRow from './DiffRow';
import CollapseBar from './CollapseBar';
import CollapseJumpButton from './CollapseJumpButton';
import MiniMap from './MiniMap';

const CONTEXT_LINES = 3;
type CollapseNavigationHandler = (direction: 'prev' | 'next') => void;

interface UnifiedPanelProps {
  diffLines: DiffLine[];
  collapseCtx: boolean;
  activeHunkIdx: number;
  searchMatches: SearchMatch[];
  activeSearchIdx: number;
  hunkPositions: number[];
  showWhitespace: boolean;
  fontSize: number;
  onScrollerReady: (scrollToIndex: (idx: number, align?: 'start' | 'center') => void) => void;
  onCollapseNavigationReady?: ((navigate: CollapseNavigationHandler | null) => void) | undefined;
}

const UnifiedPanel = memo(({
  diffLines, collapseCtx, activeHunkIdx, searchMatches, activeSearchIdx,
  hunkPositions, showWhitespace, fontSize, onScrollerReady, onCollapseNavigationReady,
}: UnifiedPanelProps) => {
  const T = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustRef = useRef(0);
  const lastCollapseJumpIndexRef = useRef<number | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ lineIdx: number; align: 'start' | 'center' } | null>(null);
  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const isWorkbookMode = workbookSections.length > 0;
  const activeWorkbookSection = workbookSections[activeWorkbookSectionIdx] ?? workbookSections[0];
  const visibleDiffLines = useMemo(() => {
    if (!activeWorkbookSection) return diffLines;
    return diffLines.slice(activeWorkbookSection.startLineIdx, activeWorkbookSection.endLineIdx + 1);
  }, [activeWorkbookSection, diffLines]);
  const visibleLineItems = useMemo(() => {
    if (isWorkbookMode) {
      const offset = activeWorkbookSection?.startLineIdx ?? 0;
      return visibleDiffLines.map((line, index) => ({ line, lineIdx: offset + index }));
    }
    return diffLines.map((line, index) => ({ line, lineIdx: index }));
  }, [activeWorkbookSection?.startLineIdx, diffLines, isWorkbookMode, visibleDiffLines]);
  const blockPrefix = isWorkbookMode
    ? `unified-${activeWorkbookSection?.name ?? activeWorkbookSection?.startLineIdx ?? 0}`
    : 'unified-text';
  const rowBlocks = useMemo(
    () => buildCollapsibleRowBlocks(visibleLineItems, (item) => item.line.type === 'equal'),
    [visibleLineItems],
  );
  const items = useMemo<RenderItem[]>(
    () => buildCollapsedItems(rowBlocks, collapseCtx, expandedBlocks, {
      contextLines: CONTEXT_LINES,
      blockPrefix,
      buildRowItem: (item): LineItem => ({ kind: 'line', line: item.line, lineIdx: item.lineIdx }),
      buildCollapseItem: ({ blockId, count, fromIdx, toIdx, hiddenStart, hiddenEnd, expandStep }): CollapseItem => ({
        kind: 'collapse',
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

  const { totalH, startIdx, endIdx, scrollToIndex } = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
  );

  const revealLineIfCollapsed = useCallback((lineIdx: number) => {
    const target = findCollapsedRowTarget(rowBlocks, expandedBlocks, lineIdx, {
      contextLines: CONTEXT_LINES,
      blockPrefix,
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
    const exactIndex = items.findIndex((item) => item.kind === 'line' && item.lineIdx === lineIdx);
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
    const nearestIndex = items.findIndex((item) => item.kind === 'line' && item.lineIdx > lineIdx);
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
  }, [diffLines, activeWorkbookSection?.name]);

  useEffect(() => {
    const scrollAdjust = pendingScrollAdjustRef.current;
    if (!scrollAdjust) return;
    pendingScrollAdjustRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollTop + scrollAdjust);
  }, [items]);

  const workbookHeaderHeight = isWorkbookMode ? ROW_H : 0;
  const columnLabels = getWorkbookColumnLabels(activeWorkbookSection?.maxColumns ?? 0);
  const collapseIndexes = useMemo(
    () => getCollapseIndexes(items, (item) => item.kind === 'collapse'),
    [items],
  );
  const totalCollapseCount = useMemo(
    () => countRemainingCollapses(items, 0, (item) => item.kind === 'collapse'),
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
              display: 'flex',
              background: T.bg1,
              minWidth: LN_W + LN_W + 3 + (columnLabels.length * WORKBOOK_CELL_WIDTH),
            }}>
              <div style={{
                width: (LN_W * 2) + 3,
                minWidth: (LN_W * 2) + 3,
                background: T.bg2,
                borderBottom: `1px solid ${T.border}`,
              }} />
              {columnLabels.map(label => (
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
                    color: T.acc2,
                    background: T.bg1,
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                  {label}
                </div>
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', top: workbookHeaderHeight + (startIdx * ROW_H), left: 0, minWidth: '100%' }}>
          {items.slice(startIdx, endIdx).map((item) => {
            const key = item.kind === 'collapse'
              ? `${item.blockId}-${item.hiddenStart}-${item.hiddenEnd}`
              : `line-${item.lineIdx}`;
            if (item.kind === 'collapse') {
              const ci = item as CollapseItem;
              return (
                <CollapseBar key={key} count={ci.count} expandCount={Math.min(ci.count, ci.expandStep)}
                  onExpand={() => startTransition(() => {
                    const revealCount = Math.min(ci.count, ci.expandStep);
                    pendingScrollAdjustRef.current += getCollapseLeadingRevealCount(ci.count, revealCount) * ROW_H;
                    setExpandedBlocks(prev => expandCollapseBlock(
                      prev,
                      ci.blockId,
                      ci.hiddenStart,
                      ci.hiddenEnd,
                      revealCount,
                    ));
                  })}
                  onExpandAll={() => startTransition(() => {
                    setExpandedBlocks(prev => expandCollapseBlockFully(
                      prev,
                      ci.blockId,
                      ci.hiddenStart,
                      ci.hiddenEnd,
                    ));
                  })} />
              );
            }
            const li = item as LineItem;
            return (
              <DiffRow key={key} line={li.line}
                isSearchMatch={searchMatchSet.has(li.lineIdx)}
                isActiveSearch={activeSearchLineIdx === li.lineIdx}
                showWhitespace={showWhitespace}
                fontSize={fontSize} />
            );
          })}
        </div>
        </div>
        <CollapseJumpButton
          onPrev={handleJumpToPreviousCollapse}
          onNext={handleJumpToNextCollapse}
          currentIndex={activeCollapsePosition >= 0 ? activeCollapsePosition + 1 : 0}
          totalCount={totalCollapseCount}
          storageKey="text-unified"
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

export default UnifiedPanel;
