// src/components/SplitCell.tsx
import { memo, useMemo, type CSSProperties, type MouseEventHandler } from 'react';
import { FONT_CODE, FONT_SIZE } from '@/constants/typography';
import { LN_W } from '@/constants/layout';
import type { DiffLine, Token, WorkbookSelectedCell } from '@/types';
import { tokenize } from '@/engine/text/tokenizer';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import { buildDiffSelectionSurfaces } from '@/utils/diff/selectionVisuals';
import {
  resolveTextDiffCssPalette,
  resolveTextInlineBackground,
  resolveTextDiffVisualTone,
} from '@/utils/diff/textDiffVisuals';
import Ln from '@/components/diff/Ln';
import TokenText from '@/components/shared/TokenText';
import type { TokenSearchRange } from '@/components/shared/TokenText';

interface TextSelectionRange {
  start: number;
  end: number;
}

interface SplitCellProps {
  line: DiffLine | null;
  side: 'left' | 'right';
  copySide?: 'base' | 'mine' | 'both';
  lineIdx?: number | null;
  syntaxTokens?: Token[] | undefined;
  widthMode?: 'fill' | 'content';
  lineNumberLayout?: 'single' | 'paired';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  searchRanges?: TokenSearchRange[] | undefined;
  showWhitespace: boolean;
  fontSize: number;
  allowTextSelection?: boolean;
  textSelectionRange?: TextSelectionRange | null | undefined;
  sheetName?: string;
  versionLabel?: string;
  headerRowNumber?: number;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  isReplacementPair?: boolean;
  maskEqualCells?: boolean;
  stickyLeftBase?: number;
  freezeColumnCount?: number;
  columnCount?: number;
  visibleColumns?: number[];
  renderColumns?: HorizontalVirtualColumnEntry[];
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  mergedRanges?: WorkbookMergeRange[];
  changedColumns?: number[];
  workbookRoleLabel?: string;
  workbookRoleTone?: 'base' | 'mine';
  rowHeightOverride?: number;
  rowHighlightBg?: string | undefined;
  isRangeSelected?: boolean;
  isBaseLineSelected?: boolean;
  isMineLineSelected?: boolean;
  selectionAccentColor?: string | undefined;
  lineNumberTitle?: string | undefined;
  onBaseLineNumberClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  onMineLineNumberClick?: MouseEventHandler<HTMLButtonElement> | undefined;
}

function renderWithWhitespaceMark(text: string) {
  const trailingMatch = text.match(/(\s+)$/);
  if (!trailingMatch) return text;
  const body     = text.slice(0, text.length - trailingMatch[1]!.length);
  const trailing = trailingMatch[1]!.replace(/ /g, '·').replace(/\t/g, '→');
  return (
    <>
      {body}
      <span className="text-text-secondary/50">{trailing}</span>
    </>
  );
}

function buildTextSelectionOverlayStyle(
  range: TextSelectionRange | null | undefined,
  textLength: number,
): CSSProperties | null {
  if (!range || range.end <= range.start) return null;
  const startsWithinLine = range.start > 0;
  const endsWithinLine = range.end < textLength;

  return {
    left: `calc(${range.start} * 1ch)`,
    width: `calc(${range.end - range.start} * 1ch)`,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: startsWithinLine ? 2 : 0,
    borderBottomLeftRadius: startsWithinLine ? 2 : 0,
    borderTopRightRadius: endsWithinLine ? 2 : 0,
    borderBottomRightRadius: endsWithinLine ? 2 : 0,
  };
}

const SplitCell = memo(({
  line,
  side,
  copySide = side === 'left' ? 'base' : 'mine',
  lineIdx,
  syntaxTokens,
  widthMode = 'fill',
  lineNumberLayout = 'single',
  isSearchMatch: _isSearchMatch,
  isActiveSearch,
  searchRanges = [],
  showWhitespace,
  fontSize,
  allowTextSelection = false,
  textSelectionRange = null,
  isReplacementPair = false,
  rowHeightOverride,
  rowHighlightBg,
  isRangeSelected = false,
  isBaseLineSelected = false,
  isMineLineSelected = false,
  selectionAccentColor,
  lineNumberTitle,
  onBaseLineNumberClick,
  onMineLineNumberClick,
}: SplitCellProps) => {
  const resolvedRowHeight = rowHeightOverride ?? ROW_H;
  const lineNumberTone = side === 'left' ? 'base' : 'mine';
  const isContentWidth = widthMode === 'content';
  const usesPairedLineNumbers = lineNumberLayout === 'paired';
  const gutterWidth = usesPairedLineNumbers ? LN_W * 2 : LN_W;
  const content = line?.base ?? line?.mine ?? '';
  const tokens = useMemo(() => syntaxTokens ?? tokenize(content), [content, syntaxTokens]);
  const {
    activeCapsuleSurface,
    diffHighlightBackground,
    gutterBackground,
    gutterShadow,
    selectionAccent,
  } = buildDiffSelectionSurfaces({
    selectionAccentColor,
    isBaseLineSelected,
    isMineLineSelected,
    isRangeSelected,
    isActiveSearch,
  });
  const textSelectionOverlayStyle = useMemo<CSSProperties | null>(
    () => buildTextSelectionOverlayStyle(textSelectionRange, content.length),
    [content.length, textSelectionRange],
  );

  const renderLineNumberGutter = (currentLine: DiffLine | null) => (
    <div style={{
      width: gutterWidth,
      minWidth: gutterWidth,
      display: 'flex',
      flexShrink: 0,
      position: 'sticky',
      left: 0,
      zIndex: 4,
      background: currentLine == null && isRangeSelected
        ? `linear-gradient(180deg,
            color-mix(in srgb, ${selectionAccent} 14%, ${cssVar('lnBg')} 86%) 0%,
            color-mix(in srgb, ${selectionAccent} 8%, ${cssVar('bg0')} 92%) 100%)`
        : gutterBackground,
      boxShadow: currentLine == null && isRangeSelected
        ? `inset -1px 0 0 color-mix(in srgb, ${selectionAccent} 12%, transparent)`
        : gutterShadow,
    }}>
      {usesPairedLineNumbers ? (
        <>
          <Ln
            n={currentLine?.baseLineNo ?? null}
            active={isActiveSearch}
            tone="base"
            selected={isBaseLineSelected}
            selectedColor={selectionAccentColor}
            title={lineNumberTitle}
            onClick={onBaseLineNumberClick}
          />
          <Ln
            n={currentLine?.mineLineNo ?? null}
            active={isActiveSearch}
            tone="mine"
            selected={isMineLineSelected}
            selectedColor={selectionAccentColor}
            title={lineNumberTitle}
            onClick={onMineLineNumberClick}
          />
        </>
      ) : (
        <Ln
          n={side === 'left' ? (currentLine?.baseLineNo ?? null) : (currentLine?.mineLineNo ?? null)}
          active={isActiveSearch}
          tone={lineNumberTone}
          selected={side === 'left' ? isBaseLineSelected : isMineLineSelected}
          selectedColor={selectionAccentColor}
          title={lineNumberTitle}
          onClick={side === 'left' ? onBaseLineNumberClick : onMineLineNumberClick}
        />
      )}
    </div>
  );

  // Empty padding cell (for alignment when one side has no matching line)
  if (!line) {
    return (
      <div
        {...(lineIdx != null ? { 'data-line-idx': lineIdx } : {})}
        data-copy-side={copySide}
        style={{
        flex: isContentWidth ? '1 1 auto' : 1,
        display: 'flex',
        height: resolvedRowHeight,
        width: isContentWidth ? '100%' : undefined,
        minWidth: isContentWidth ? 'max-content' : 0,
        isolation: 'isolate',
        position: 'relative',
      }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 2,
            bottom: 2,
            width: 3,
            borderRadius: 999,
            background: cssVar('bg4'),
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {renderLineNumberGutter(null)}
        {!isContentWidth && (
          <div style={{ flex: 1, background: cssVar('bg2'), minWidth: 0 }} />
        )}
      </div>
    );
  }

  const isAdd    = line.type === 'add';
  const isDel    = line.type === 'delete';
  const tone = resolveTextDiffVisualTone(line, isReplacementPair);
  const palette = resolveTextDiffCssPalette(tone);
  const brd      = palette.accent;
  const pfx      = isAdd ? '+' : isDel ? '-' : ' ';
  const pfxC     = palette.prefix;
  const hlBg     = palette.inlineHighlight;
  const charSpans = side === 'left' ? line.baseCharSpans : line.mineCharSpans;
  const hasSearchRanges = searchRanges.length > 0;
  const hasTextSelection = Boolean(textSelectionRange && textSelectionRange.end > textSelectionRange.start);
  const searchBg = rowHighlightBg;
  const contentBg = searchBg;
  const inlineBg = resolveTextInlineBackground({
    tone,
    hasSearchRanges,
    isRangeSelected,
    hasRowSurfaceOverride: Boolean(searchBg),
    hasTextSelection,
  });
  const effectiveHighlightBackground = hasTextSelection ? undefined : (diffHighlightBackground ?? hlBg);
  const contentHighlightBackground = undefined;

  return (
    <div
      data-copy-side={copySide}
      {...(lineIdx != null ? { 'data-line-idx': lineIdx } : {})}
      style={{
        flex: isContentWidth ? '1 1 auto' : 1,
        display: 'flex',
        height: resolvedRowHeight,
        width: isContentWidth ? '100%' : undefined,
        minWidth: isContentWidth ? 'max-content' : 0,
        isolation: 'isolate',
        position: 'relative',
        background: activeCapsuleSurface,
        borderRadius: isActiveSearch ? 999 : isRangeSelected ? 12 : undefined,
      }}>
      {brd !== 'transparent' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: isActiveSearch ? 2 : 0,
            top: 2,
            bottom: 2,
            width: 3,
            borderRadius: 999,
            background: brd,
            pointerEvents: 'none',
            zIndex: 6,
          }}
        />
      )}
      {renderLineNumberGutter(line)}
      <div style={{
        flex: 1,
        display: 'flex',
        minWidth: isContentWidth ? 'max-content' : 0,
        background: contentBg,
        backgroundImage: contentHighlightBackground,
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{
          paddingLeft: 4, paddingRight: 3,
          color: pfxC, userSelect: 'none',
          fontSize: FONT_SIZE.md, flexShrink: 0,
          lineHeight: `${resolvedRowHeight}px`,
          fontFamily: FONT_CODE,
          position: 'relative',
          zIndex: 1,
        }}>
          {pfx}
        </span>
        <span
          data-selectable-text-root="true"
          className={allowTextSelection ? 'logical-text-selection-surface cursor-text' : undefined}
          style={{
            display: 'block',
            flex: 1,
            paddingRight: 6,
            whiteSpace: 'pre',
            fontSize,
            lineHeight: `${resolvedRowHeight}px`,
            color: cssVar('t0'),
            fontFamily: FONT_CODE,
            minWidth: isContentWidth ? 'max-content' : 0,
            position: 'relative',
            zIndex: 1,
          }}>
          {textSelectionOverlayStyle && (
            <span
              aria-hidden
              data-logical-selection-overlay="true"
              className="logical-text-selection-overlay"
              style={textSelectionOverlayStyle}
            />
          )}
          <span
            data-selectable-text-content="true"
            style={{
              display: 'inline-block',
              position: 'relative',
              zIndex: 1,
              background: inlineBg,
              padding: inlineBg ? '0 2px' : 0,
              borderRadius: inlineBg ? 2 : 0,
            }}>
            {showWhitespace && !charSpans && searchRanges.length === 0
              && !hasTextSelection
              ? renderWithWhitespaceMark(content)
              : (
                <TokenText
                  tokens={tokens}
                  charSpans={charSpans}
                  hlBg={effectiveHighlightBackground}
                  searchRanges={searchRanges}
                  searchHlBg={cssAlpha('searchHl', '32')}
                  activeSearchHlBg={cssAlpha('searchHl', '92')}
                />
              )}
          </span>
        </span>
      </div>
      {isActiveSearch && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            border: `1px solid ${cssAlpha('searchHl', 'de')}`,
            boxSizing: 'border-box',
            boxShadow: `0 6px 18px -16px ${cssAlpha('searchHl', '44')}`,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
});

export default SplitCell;
