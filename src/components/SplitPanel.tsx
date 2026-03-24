// src/components/SplitPanel.tsx  [v4 — typecheck clean]
import { memo, useCallback, useEffect, useRef, useState, useMemo, RefObject, startTransition } from 'react';
import type {
  DiffLine,
  SearchMatch,
  SplitRow,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from '../types';
import { useTheme } from '../context/theme';
import { buildSplitRows } from '../engine/diff';
import { useVirtual, ROW_H } from '../hooks/useVirtual';
import { LN_W } from '../constants/layout';
import { parseWorkbookDisplayLine, WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import { extractVersionLabel } from '../utils/diffMeta';
import {
  findWorkbookSectionIndex,
  getWorkbookColumnLabels,
  getWorkbookSections,
} from '../utils/workbookSections';
import {
  buildWorkbookRowEntry,
  findWorkbookSectionIndexByName,
  moveWorkbookSelection,
} from '../utils/workbookNavigation';
import {
  type CollapseExpansionState,
  expandCollapseBlock,
  getExpandedHiddenCount,
} from '../utils/collapseState';
import SplitCell from './SplitCell';
import CollapseBar from './CollapseBar';
import MiniMap from './MiniMap';

const CONTEXT_LINES = 3;

// Fully typed — no `as any` casts
type SplitItem =
  | { kind: 'split-line';     row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; count: number; blockId: string; fromIdx: number; toIdx: number };

function isEqualSplitRow(row: SplitRow): boolean {
  return row.left?.type === 'equal' && row.right?.type === 'equal';
}

function splitRowHasLineIdx(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.includes(lineIdx);
}

function splitRowTouchesOrAfter(row: SplitRow, lineIdx: number): boolean {
  return row.lineIdxs.some(idx => idx >= lineIdx);
}

function buildSplitItems(
  splitRows: SplitRow[],
  collapseCtx: boolean,
  expandedBlocks: CollapseExpansionState,
): SplitItem[] {
  if (!collapseCtx) {
    return splitRows.map((row) => ({ kind: 'split-line' as const, row, lineIdx: row.lineIdx }));
  }

  const result: SplitItem[] = [];
  let i = 0;

  while (i < splitRows.length) {
    // i < splitRows.length — guaranteed
    const row = splitRows[i]!;
    const isEqual = isEqualSplitRow(row);

    if (!isEqual) {
      result.push({ kind: 'split-line', row, lineIdx: row.lineIdx });
      i++;
      continue;
    }

    const eqStart = i;
    while (i < splitRows.length && isEqualSplitRow(splitRows[i]!)) i++;
    const count = i - eqStart;

    if (count <= CONTEXT_LINES * 2) {
      for (let k = eqStart; k < i; k++) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
    } else {
    const blockId = `s-${eqStart}-${i}`;
    const hiddenCount = count - CONTEXT_LINES * 2;
    const expandedHiddenCount = Math.min(hiddenCount, getExpandedHiddenCount(expandedBlocks, blockId));
    if (expandedHiddenCount >= hiddenCount) {
      for (let k = eqStart; k < i; k++) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
    } else {
      for (let k = eqStart; k < eqStart + CONTEXT_LINES; k++) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
      for (let k = eqStart + CONTEXT_LINES; k < eqStart + CONTEXT_LINES + expandedHiddenCount; k++) {
        result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
      }
      result.push({
        kind: 'split-collapse',
        count: hiddenCount - expandedHiddenCount,
        blockId,
        fromIdx: splitRows[eqStart + CONTEXT_LINES + expandedHiddenCount]!.lineIdx,
        toIdx: splitRows[i - CONTEXT_LINES - 1]!.lineIdx,
      });
        for (let k = i - CONTEXT_LINES; k < i; k++) {
          result.push({ kind: 'split-line', row: splitRows[k]!, lineIdx: splitRows[k]!.lineIdx });
        }
      }
    }
  }

  return result;
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
  baseName?: string;
  mineName?: string;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: (cell: WorkbookSelectedCell | null) => void;
  onWorkbookNavigationReady?: ((navigate: ((direction: WorkbookMoveDirection) => void) | null) => void) | undefined;
}

const SplitPanel = memo(({
  diffLines, collapseCtx, activeHunkIdx, searchMatches, activeSearchIdx,
  hunkPositions, showWhitespace, fontSize, vertical, onScrollerReady,
  baseName = '', mineName = '', selectedCell = null, onSelectCell, onWorkbookNavigationReady,
}: SplitPanelProps) => {
  const T         = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>({});
  const [activeWorkbookSectionIdx, setActiveWorkbookSectionIdx] = useState(0);
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
  const items     = useMemo(() => {
    if (isWorkbookMode) return buildSplitItems(visibleSplitRows, collapseCtx, expandedBlocks);
    return buildSplitItems(splitRows, collapseCtx, expandedBlocks);
  }, [collapseCtx, expandedBlocks, isWorkbookMode, splitRows, visibleSplitRows]);
  const rowHeight = vertical ? (ROW_H * 2) + 1 : ROW_H;

  const { totalH, startIdx, endIdx, scrollToIndex } = useVirtual(
    items.length,
    scrollRef as RefObject<HTMLDivElement>,
    rowHeight,
  );

  useEffect(() => {
    onScrollerReady((lineIdx, align) => {
      const itemIndex = items.findIndex(it => it.kind === 'split-line' && splitRowTouchesOrAfter(it.row, lineIdx));
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
    const idx = items.findIndex(it => it.kind === 'split-line' && splitRowHasLineIdx(it.row, activeSearchLineIdx));
    if (idx >= 0) scrollToIndex(idx, 'center');
  }, [activeSearchLineIdx, items, scrollToIndex]);

  const workbookFrozenRowHeight = frozenRow
    ? (vertical ? (ROW_H * 2) + 1 : ROW_H)
    : 0;
  const workbookHeaderHeight = isWorkbookMode
    ? (vertical ? ((ROW_H * 2) + 1) : ROW_H) + workbookFrozenRowHeight
    : 0;
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
          height: vertical ? (ROW_H * 2) + 1 : ROW_H,
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          width: 'max-content',
          minWidth: '100%',
          background: T.bg1,
        }}>
        <SplitCell
          line={frozenRow.left}
          side="left"
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

          <div style={{ position: 'absolute', top: workbookHeaderHeight + (startIdx * rowHeight), left: 0, minWidth: '100%' }}>
          {items.slice(startIdx, endIdx).map((item) => {
            const key = item.kind === 'split-collapse'
              ? item.blockId
              : `row-${item.lineIdx}`;

            if (item.kind === 'split-collapse') {
              return (
                <CollapseBar key={key} count={item.count}
                  onExpand={() => startTransition(() => {
                    setExpandedBlocks(prev => expandCollapseBlock(
                      prev,
                      item.blockId,
                      item.count + getExpandedHiddenCount(prev, item.blockId),
                    ));
                  })} />
              );
            }

            // item.kind === 'split-line' — fully typed
            return (
              <div key={key} style={{
                height: rowHeight,
                display: 'flex',
                flexDirection: vertical ? 'column' : 'row',
                width: 'max-content',
                minWidth: '100%',
              }}>
                <SplitCell
                  line={item.row.left} side="left"
                  isSearchMatch={item.row.lineIdxs.some(idx => searchMatchSet.has(idx))}
                  isActiveSearch={item.row.lineIdxs.includes(activeSearchLineIdx)}
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
                  isSearchMatch={item.row.lineIdxs.some(idx => searchMatchSet.has(idx))}
                  isActiveSearch={item.row.lineIdxs.includes(activeSearchLineIdx)}
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
