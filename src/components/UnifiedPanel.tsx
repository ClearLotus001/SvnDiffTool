// src/components/UnifiedPanel.tsx  [v4 — typecheck clean]
import { memo, useEffect, useRef, useState, useMemo, RefObject, startTransition } from 'react';
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
  getExpandedHiddenCount,
} from '../utils/collapseState';
import DiffRow from './DiffRow';
import CollapseBar from './CollapseBar';
import MiniMap from './MiniMap';

const CONTEXT_LINES = 3;

function buildRenderItems(
  diffLines: DiffLine[],
  collapseCtx: boolean,
  expandedBlocks: CollapseExpansionState,
  lineIdxOffset = 0,
): RenderItem[] {
  if (!collapseCtx) {
    return diffLines.map((line, i): LineItem => ({ kind: 'line', line, lineIdx: lineIdxOffset + i }));
  }

  const result: RenderItem[] = [];
  let i = 0;

  while (i < diffLines.length) {
    // i < diffLines.length — guaranteed in-bounds
    const cur = diffLines[i]!;
    if (cur.type !== 'equal') {
      result.push({ kind: 'line', line: cur, lineIdx: lineIdxOffset + i });
      i++;
      continue;
    }

    const eqStart = i;
    while (i < diffLines.length && diffLines[i]!.type === 'equal') i++;
    const count = i - eqStart;

    if (count <= CONTEXT_LINES * 2) {
      for (let k = eqStart; k < i; k++) {
        result.push({ kind: 'line', line: diffLines[k]!, lineIdx: k });
      }
    } else {
      const blockId = `${lineIdxOffset + eqStart}-${lineIdxOffset + i}`;
      const hiddenCount = count - CONTEXT_LINES * 2;
      const expandedHiddenCount = Math.min(hiddenCount, getExpandedHiddenCount(expandedBlocks, blockId));
      if (expandedHiddenCount >= hiddenCount) {
        for (let k = eqStart; k < i; k++) {
          result.push({ kind: 'line', line: diffLines[k]!, lineIdx: lineIdxOffset + k });
        }
      } else {
        for (let k = eqStart; k < eqStart + CONTEXT_LINES; k++) {
          result.push({ kind: 'line', line: diffLines[k]!, lineIdx: lineIdxOffset + k });
        }
        for (let k = eqStart + CONTEXT_LINES; k < eqStart + CONTEXT_LINES + expandedHiddenCount; k++) {
          result.push({ kind: 'line', line: diffLines[k]!, lineIdx: lineIdxOffset + k });
        }
        result.push({
          kind: 'collapse',
          count: hiddenCount - expandedHiddenCount,
          blockId,
          fromIdx: lineIdxOffset + eqStart + CONTEXT_LINES + expandedHiddenCount,
          toIdx: lineIdxOffset + i - CONTEXT_LINES,
        } as CollapseItem);
        for (let k = i - CONTEXT_LINES; k < i; k++) {
          result.push({ kind: 'line', line: diffLines[k]!, lineIdx: lineIdxOffset + k });
        }
      }
    }
  }

  return result;
}

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
}

const UnifiedPanel = memo(({
  diffLines, collapseCtx, activeHunkIdx, searchMatches, activeSearchIdx,
  hunkPositions, showWhitespace, fontSize, onScrollerReady,
}: UnifiedPanelProps) => {
  const T = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(0);
  const workbookSections = useMemo(() => getWorkbookSections(diffLines), [diffLines]);
  const isWorkbookMode = workbookSections.length > 0;
  const activeWorkbookSection = workbookSections[activeWorkbookSectionIdx] ?? workbookSections[0];
  const visibleDiffLines = useMemo(() => {
    if (!activeWorkbookSection) return diffLines;
    return diffLines.slice(activeWorkbookSection.startLineIdx, activeWorkbookSection.endLineIdx + 1);
  }, [activeWorkbookSection, diffLines]);

  const items = useMemo(
    () => (isWorkbookMode
      ? buildRenderItems(
        visibleDiffLines,
        collapseCtx,
        expandedBlocks,
        activeWorkbookSection?.startLineIdx ?? 0,
      )
      : buildRenderItems(diffLines, collapseCtx, expandedBlocks)),
    [activeWorkbookSection, collapseCtx, diffLines, expandedBlocks, isWorkbookMode, visibleDiffLines],
  );

  const { totalH, startIdx, endIdx, scrollToIndex } = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
  );

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      const itemIndex = items.findIndex(item => item.kind === 'line' && item.lineIdx >= lineIdx);
      if (itemIndex >= 0) {
        scrollToIndex(itemIndex, align);
      }
    });
  }, [items, onScrollerReady, scrollToIndex]);

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
    const idx = items.findIndex(
      it => it.kind === 'line' && (it as LineItem).lineIdx === activeSearchLineIdx,
    );
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeSearchLineIdx, items, scrollToIndex]);

  useEffect(() => {
    const targetLineIdx = hunkPositions[activeHunkIdx];
    if (targetLineIdx === undefined) return;
    const idx = items.findIndex(
      it => it.kind === 'line' && (it as LineItem).lineIdx === targetLineIdx,
    );
    if (idx >= 0) scrollToIndex(idx);
  }, [activeHunkIdx, hunkPositions, items, scrollToIndex]);

  const workbookHeaderHeight = isWorkbookMode ? ROW_H : 0;
  const columnLabels = getWorkbookColumnLabels(activeWorkbookSection?.maxColumns ?? 0);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
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
              ? item.blockId
              : `line-${item.lineIdx}`;
            if (item.kind === 'collapse') {
              const ci = item as CollapseItem;
              return (
                <CollapseBar key={key} count={ci.count}
                  onExpand={() => startTransition(() => {
                    setExpandedBlocks(prev => expandCollapseBlock(
                      prev,
                      ci.blockId,
                      ci.count + getExpandedHiddenCount(prev, ci.blockId),
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
