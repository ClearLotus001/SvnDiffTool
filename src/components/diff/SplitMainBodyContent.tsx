import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';

import type {
  DiffLine,
  SplitRow,
  SyntaxPresentation,
  WorkbookSelectedCell,
} from '@/types';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { cssVar } from '@/theme/cssUtils';
import { getSplitLineSyntaxTokens } from '@/utils/diff/syntaxHighlighting';
import { getTextVerticalRenderMode } from '@/utils/diff/splitRowBehavior';
import DiffRow from '@/components/diff/DiffRow';
import SplitCell from '@/components/diff/SplitCell';
import type { TokenSearchRange } from '@/components/shared/TokenText';

const DOUBLE_ROW_H = (ROW_H * 2) + 1;

export type SplitMainBodyItem =
  | { kind: 'split-line'; row: SplitRow; lineIdx: number }
  | { kind: 'split-collapse'; source?: 'auto' | 'manual'; count: number; blockId: string; fromIdx: number; toIdx: number; hiddenStart: number; hiddenEnd: number; expandStep: number };

interface SplitMainBodyContentProps {
  isWorkbookMode: boolean;
  vertical: boolean;
  activeWorkbookSectionName: string;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  baseVersion: string;
  mineVersion: string;
  syntaxPresentation?: SyntaxPresentation | null;
  showWhitespace: boolean;
  fontSize: number;
  items: SplitMainBodyItem[];
  startIdx: number;
  activeCollapseIndex: number | null;
  searchMatchSet: ReadonlySet<number>;
  activeSearchLineIdx: number;
  searchRangesByLineIdx: Map<number, TokenSearchRange[]>;
  selectionAccentColor?: string;
  lineNumberTitle?: string | undefined;
  textRowLayoutStyle: CSSProperties;
  bodyContainerStyle: CSSProperties;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  isSplitRowSelected: (row: SplitRow) => boolean;
  getSplitRowSideLineIdx: (row: SplitRow, side: 'left' | 'right') => number | null;
  getCombinedTextSelectionRangeForLine: (lineIdx: number, copySide: 'base' | 'mine' | 'both', lineLength: number) => { start: number; end: number } | null;
  onLineNumberClick: (lineIdx: number, extend: boolean, side: 'left' | 'right') => void;
  renderTextCollapseBar: (item: Extract<SplitMainBodyItem, { kind: 'split-collapse' }>, active?: boolean) => ReactNode;
  singleGridWidth: number;
}

export default function SplitMainBodyContent({
  isWorkbookMode,
  vertical,
  activeWorkbookSectionName,
  selectedCell,
  onSelectCell,
  baseVersion,
  mineVersion,
  syntaxPresentation = null,
  showWhitespace,
  fontSize,
  items,
  startIdx,
  activeCollapseIndex,
  searchMatchSet,
  activeSearchLineIdx,
  searchRangesByLineIdx,
  selectionAccentColor,
  lineNumberTitle,
  textRowLayoutStyle,
  bodyContainerStyle,
  onPointerDown,
  isSplitRowSelected,
  getSplitRowSideLineIdx,
  getCombinedTextSelectionRangeForLine,
  onLineNumberClick,
  renderTextCollapseBar,
  singleGridWidth,
}: SplitMainBodyContentProps) {
  return (
    <div onPointerDown={onPointerDown} style={bodyContainerStyle}>
      {items.map((item, visibleOffset) => {
        const itemIndex = startIdx + visibleOffset;
        const key = item.kind === 'split-collapse'
          ? `${item.blockId}-${item.hiddenStart}-${item.hiddenEnd}`
          : `row-${item.lineIdx}`;

        if (item.kind === 'split-collapse') {
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
        const leftLineIdx = getSplitRowSideLineIdx(item.row, 'left');
        const rightLineIdx = getSplitRowSideLineIdx(item.row, 'right');
        const leftClickLineIdx = leftLineIdx ?? item.lineIdx;
        const rightClickLineIdx = rightLineIdx ?? item.lineIdx;
        const singleLineIdx = renderMode === 'single-left'
          ? leftLineIdx
          : renderMode === 'single-right'
            ? rightLineIdx
            : (item.row.lineIdxs[0] ?? null);
        const singleCopySide = renderMode === 'single-left'
          ? 'base'
          : renderMode === 'single-right'
            ? 'mine'
            : 'both';
        const singleLineText = renderMode === 'single-left'
          ? (singleLine?.base ?? '')
          : renderMode === 'single-right'
            ? (singleLine?.mine ?? '')
            : (singleLine?.base ?? singleLine?.mine ?? '');

        if (vertical && singleLine) {
          return (
            <div
              key={key}
              data-line-idx={item.lineIdx}
              data-line-span-end={Math.max(...item.row.lineIdxs)}
              data-selection-band={isSplitRowSelected(item.row) ? 'true' : undefined}
              onPointerDown={onPointerDown}
              style={{ ...textRowLayoutStyle, height: ROW_H }}>
              <DiffRow
                line={singleLine as DiffLine}
                copySide={singleCopySide}
                syntaxTokens={getSplitLineSyntaxTokens(
                  syntaxPresentation,
                  singleLine,
                  singleLine === item.row.left ? 'left' : 'right',
                )}
                isReplacementPair={Boolean(item.row.isReplacementPair)}
                widthMode="content"
                isSearchMatch={isSearchMatch}
                isActiveSearch={isActiveSearch}
                isRangeSelected={isSplitRowSelected(item.row)}
                isBaseLineSelected={isSplitRowSelected(item.row) && singleLine.baseLineNo != null}
                isMineLineSelected={isSplitRowSelected(item.row) && singleLine.mineLineNo != null}
                selectionAccentColor={selectionAccentColor}
                lineNumberTitle={!isWorkbookMode ? lineNumberTitle : undefined}
                onBaseLineNumberClick={!isWorkbookMode && singleLine.baseLineNo != null
                  ? (event) => onLineNumberClick(singleLineIdx ?? item.lineIdx, event.shiftKey, 'left')
                  : undefined}
                onMineLineNumberClick={!isWorkbookMode && singleLine.mineLineNo != null
                  ? (event) => onLineNumberClick(singleLineIdx ?? item.lineIdx, event.shiftKey, 'right')
                  : undefined}
                searchRanges={singleLineIdx != null ? (searchRangesByLineIdx.get(singleLineIdx) ?? []) : []}
                showWhitespace={showWhitespace}
                fontSize={fontSize}
                allowTextSelection={!isWorkbookMode}
                textSelectionRange={!isWorkbookMode
                  ? getCombinedTextSelectionRangeForLine(item.lineIdx, singleCopySide, singleLineText.length)
                  : null}
              />
            </div>
          );
        }

        const rowHeight = vertical && renderMode === 'double' ? DOUBLE_ROW_H : ROW_H;
        return (
          <div
            key={key}
            data-line-idx={item.lineIdx}
            data-line-span-end={Math.max(...item.row.lineIdxs)}
            data-selection-band={isSplitRowSelected(item.row) ? 'true' : undefined}
            onPointerDown={onPointerDown}
            style={{
              height: rowHeight,
              display: 'flex',
              flexDirection: vertical ? 'column' : 'row',
              ...textRowLayoutStyle,
            }}>
            <SplitCell
              line={item.row.left}
              side="left"
              copySide="base"
              syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, item.row.left, 'left')}
              widthMode={vertical ? 'content' : 'fill'}
              lineNumberLayout={vertical ? 'paired' : 'single'}
              isReplacementPair={Boolean(item.row.isReplacementPair)}
              isSearchMatch={isSearchMatch}
              isActiveSearch={isActiveSearch}
              isRangeSelected={isSplitRowSelected(item.row)}
              isBaseLineSelected={isSplitRowSelected(item.row) && item.row.left?.baseLineNo != null}
              isMineLineSelected={isSplitRowSelected(item.row) && item.row.left?.mineLineNo != null}
              selectionAccentColor={selectionAccentColor}
              lineNumberTitle={!isWorkbookMode ? lineNumberTitle : undefined}
              onBaseLineNumberClick={!isWorkbookMode
                ? (event) => onLineNumberClick(leftClickLineIdx, event.shiftKey, 'left')
                : undefined}
              onMineLineNumberClick={!isWorkbookMode && item.row.left?.mineLineNo != null
                ? (event) => onLineNumberClick(leftClickLineIdx, event.shiftKey, 'right')
                : undefined}
              searchRanges={leftLineIdx != null ? (searchRangesByLineIdx.get(leftLineIdx) ?? []) : []}
              showWhitespace={showWhitespace}
              fontSize={fontSize}
              allowTextSelection={!isWorkbookMode}
              textSelectionRange={!isWorkbookMode
                ? getCombinedTextSelectionRangeForLine(item.lineIdx, 'base', item.row.left?.base?.length ?? 0)
                : null}
              sheetName={activeWorkbookSectionName}
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
              line={item.row.right}
              side="right"
              copySide="mine"
              syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, item.row.right, 'right')}
              widthMode={vertical ? 'content' : 'fill'}
              lineNumberLayout={vertical ? 'paired' : 'single'}
              isReplacementPair={Boolean(item.row.isReplacementPair)}
              isSearchMatch={isSearchMatch}
              isActiveSearch={isActiveSearch}
              isRangeSelected={isSplitRowSelected(item.row)}
              isBaseLineSelected={isSplitRowSelected(item.row) && item.row.right?.baseLineNo != null}
              isMineLineSelected={isSplitRowSelected(item.row) && item.row.right?.mineLineNo != null}
              selectionAccentColor={selectionAccentColor}
              lineNumberTitle={!isWorkbookMode ? lineNumberTitle : undefined}
              onBaseLineNumberClick={!isWorkbookMode && item.row.right?.baseLineNo != null
                ? (event) => onLineNumberClick(rightClickLineIdx, event.shiftKey, 'left')
                : undefined}
              onMineLineNumberClick={!isWorkbookMode
                ? (event) => onLineNumberClick(rightClickLineIdx, event.shiftKey, 'right')
                : undefined}
              searchRanges={rightLineIdx != null ? (searchRangesByLineIdx.get(rightLineIdx) ?? []) : []}
              showWhitespace={showWhitespace}
              fontSize={fontSize}
              allowTextSelection={!isWorkbookMode}
              textSelectionRange={!isWorkbookMode
                ? getCombinedTextSelectionRangeForLine(item.lineIdx, 'mine', item.row.right?.mine?.length ?? 0)
                : null}
              sheetName={activeWorkbookSectionName}
              versionLabel={mineVersion}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              stickyLeftBase={vertical ? 0 : singleGridWidth + 1}
            />
          </div>
        );
      })}
    </div>
  );
}
