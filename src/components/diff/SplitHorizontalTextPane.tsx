import type {
  MouseEventHandler,
  PointerEventHandler,
  RefObject,
  ReactNode,
} from 'react';

import type { DiffLine, SplitRow, SyntaxPresentation } from '@/types';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { getSplitLineSyntaxTokens } from '@/utils/diff/syntaxHighlighting';
import { resolveTextSplitRowVisualTone } from '@/utils/diff/textDiffVisuals';
import SplitCell from '@/components/diff/SplitCell';
import type { TokenSearchRange } from '@/components/shared/TokenText';

export type SplitHorizontalTextPaneItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; source?: 'auto' | 'manual'; count: number; blockId: string; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number };

interface SplitHorizontalTextPaneProps {
  side: 'left' | 'right';
  paneRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  totalHeight: number;
  rowWindowOffsetTop: number;
  visibleItems: SplitHorizontalTextPaneItem[];
  startIdx: number;
  activeCollapseIndex: number | null;
  renderTextCollapseBar: (item: Extract<SplitHorizontalTextPaneItem, { kind: 'split-collapse' }>, active?: boolean) => ReactNode;
  isCollapseTextSelected?: (item: Extract<SplitHorizontalTextPaneItem, { kind: 'split-collapse' }>) => boolean;
  isSplitRowSelected: (row: SplitRow) => boolean;
  getSplitRowSideLineIdx: (row: SplitRow, side: 'left' | 'right') => number | null;
  searchMatchSet: ReadonlySet<number>;
  activeSearchLineIdx: number;
  searchRangesByLineIdx: Map<number, TokenSearchRange[]>;
  getTextSelectionRangeForLine: (lineIdx: number, lineLength: number) => { start: number; end: number } | null;
  syntaxPresentation?: SyntaxPresentation | null;
  showWhitespace: boolean;
  fontSize: number;
  selectionAccentColor?: string;
  lineNumberTitle?: string | undefined;
  onLineNumberClick: (lineIdx: number, extend: boolean, side: 'left' | 'right') => void;
  versionLabel: string;
}

export default function SplitHorizontalTextPane({
  side,
  paneRef,
  onScroll,
  onContextMenu,
  onPointerDown,
  totalHeight,
  rowWindowOffsetTop,
  visibleItems,
  startIdx,
  activeCollapseIndex,
  renderTextCollapseBar,
  isCollapseTextSelected,
  isSplitRowSelected,
  getSplitRowSideLineIdx,
  searchMatchSet,
  activeSearchLineIdx,
  searchRangesByLineIdx,
  getTextSelectionRangeForLine,
  syntaxPresentation = null,
  showWhitespace,
  fontSize,
  selectionAccentColor,
  lineNumberTitle,
  onLineNumberClick,
  versionLabel,
}: SplitHorizontalTextPaneProps) {
  return (
    <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      <div
        ref={paneRef}
        onContextMenu={onContextMenu}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        className="flex-1 overflow-auto relative min-w-0 min-h-0"
        style={{ overflowAnchor: 'none' }}>
        <div style={{ height: totalHeight, pointerEvents: 'none' }} />
        <div
          onPointerDown={onPointerDown}
          style={{ position: 'absolute', top: rowWindowOffsetTop, left: 0, width: 'max-content', minWidth: '100%' }}>
          {visibleItems.map((item, visibleOffset) => {
            const itemIndex = startIdx + visibleOffset;
            const key = item.kind === 'split-collapse'
              ? `${side}-${item.blockId}-${item.hiddenStart}-${item.hiddenEnd}`
              : `${side}-row-${item.lineIdx}`;

            if (item.kind === 'split-collapse') {
              if (side === 'right') {
                return (
                  <div
                    key={key}
                    data-collapse-range="true"
                    data-collapse-start={item.fromIdx}
                    data-collapse-end={item.toIdx}
                    data-active-collapse={itemIndex === activeCollapseIndex ? 'true' : 'false'}
                    className={itemIndex === activeCollapseIndex ? 'collapse-bar-placeholder' : undefined}
                    style={{
                      height: ROW_H,
                      minWidth: '100%',
                      borderTop: `1px dashed ${cssVar('border')}`,
                      borderBottom: `1px dashed ${cssVar('border')}`,
                      background: isCollapseTextSelected?.(item)
                        ? `linear-gradient(90deg,
                          color-mix(in srgb, var(--text-selection-bg) 72%, ${cssVar('bg2')} 28%) 0%,
                          color-mix(in srgb, var(--text-selection-bg) 18%, transparent) 100%)`
                        : itemIndex === activeCollapseIndex
                        ? `linear-gradient(90deg, ${cssAlpha('acc2', '14')} 0%, ${cssAlpha('acc2', '06')} 100%)`
                        : cssVar('bg2'),
                    }}
                  />
                );
              }

              return (
                <div
                  key={key}
                  data-collapse-range="true"
                  data-collapse-start={item.fromIdx}
                  data-collapse-end={item.toIdx}
                  style={{ position: 'relative', zIndex: 12, pointerEvents: 'auto' }}>
                  {renderTextCollapseBar(item, itemIndex === activeCollapseIndex)}
                </div>
              );
            }

            const rowSelected = isSplitRowSelected(item.row);
            const isSearchMatch = item.row.lineIdxs.some(idx => searchMatchSet.has(idx));
            const isActiveSearch = item.row.lineIdxs.includes(activeSearchLineIdx);
            const line: DiffLine | null = side === 'left' ? item.row.left : item.row.right;
            const sideLineIdx = getSplitRowSideLineIdx(item.row, side);
            const sideClickLineIdx = sideLineIdx ?? item.lineIdx;
            const lineText = side === 'left'
              ? (line?.base ?? '')
              : (line?.mine ?? '');
            const textSelectionRange = sideLineIdx != null
              ? getTextSelectionRangeForLine(sideLineIdx, lineText.length)
              : null;
            const isModifyRow = resolveTextSplitRowVisualTone(item.row) === 'modify';

            return (
              <div
                key={key}
                data-line-idx={sideClickLineIdx}
                data-line-span-end={Math.max(...item.row.lineIdxs)}
                data-selection-band={rowSelected ? 'true' : undefined}
                onPointerDown={onPointerDown}
                style={{ width: 'max-content', minWidth: '100%', height: ROW_H }}>
                <SplitCell
                  line={line}
                  side={side}
                  copySide={side === 'left' ? 'base' : 'mine'}
                  lineIdx={sideLineIdx}
                  syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, line, side)}
                  widthMode="content"
                  lineNumberLayout="single"
                  isReplacementPair={isModifyRow}
                  isSearchMatch={isSearchMatch}
                  isActiveSearch={isActiveSearch}
                  isRangeSelected={rowSelected}
                  isBaseLineSelected={rowSelected && side === 'left' && line?.baseLineNo != null}
                  isMineLineSelected={rowSelected && side === 'right' && line?.mineLineNo != null}
                  selectionAccentColor={selectionAccentColor}
                  lineNumberTitle={lineNumberTitle}
                  onBaseLineNumberClick={side === 'left'
                    ? (event) => onLineNumberClick(sideClickLineIdx, event.shiftKey, 'left')
                    : undefined}
                  onMineLineNumberClick={side === 'right'
                    ? (event) => onLineNumberClick(sideClickLineIdx, event.shiftKey, 'right')
                    : undefined}
                  searchRanges={sideLineIdx != null ? (searchRangesByLineIdx.get(sideLineIdx) ?? []) : []}
                  showWhitespace={showWhitespace}
                  fontSize={fontSize}
                  allowTextSelection
                  textSelectionRange={textSelectionRange}
                  sheetName=""
                  versionLabel={versionLabel}
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
}
