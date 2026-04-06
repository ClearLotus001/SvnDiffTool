// src/components/DiffRow.tsx
import { memo, useMemo, type CSSProperties, type MouseEventHandler } from 'react';
import { FONT_CODE, FONT_SIZE } from '@/constants/typography';
import type { DiffLine, Token } from '@/types';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { tokenize } from '@/engine/text/tokenizer';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { LN_W } from '@/constants/layout';
import { buildDiffSelectionSurfaces } from '@/utils/diff/selectionVisuals';
import {
  resolveTextDiffCssPalette,
  resolveTextDiffVisualTone,
} from '@/utils/diff/textDiffVisuals';
import Ln from '@/components/diff/Ln';
import TokenText from '@/components/shared/TokenText';
import type { TokenSearchRange } from '@/components/shared/TokenText';

interface TextSelectionRange {
  start: number;
  end: number;
}

interface DiffRowProps {
  line: DiffLine;
  copySide?: 'base' | 'mine' | 'both';
  syntaxTokens?: Token[] | undefined;
  isReplacementPair?: boolean;
  widthMode?: 'fill' | 'content';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  searchRanges?: TokenSearchRange[] | undefined;
  showWhitespace: boolean;
  fontSize: number;
  allowTextSelection?: boolean;
  textSelectionRange?: TextSelectionRange | null | undefined;
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
  const body = text.slice(0, text.length - trailingMatch[1]!.length);
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

const DiffRow = memo(({
  line,
  copySide = 'both',
  syntaxTokens,
  isReplacementPair = false,
  widthMode = 'fill',
  isSearchMatch: _isSearchMatch,
  isActiveSearch,
  searchRanges = [],
  showWhitespace,
  fontSize,
  allowTextSelection = false,
  textSelectionRange = null,
  isRangeSelected = false,
  isBaseLineSelected = false,
  isMineLineSelected = false,
  selectionAccentColor,
  lineNumberTitle,
  onBaseLineNumberClick,
  onMineLineNumberClick,
}: DiffRowProps) => {
  const content = line.base ?? line.mine ?? '';
  const tokens = useMemo(() => syntaxTokens ?? tokenize(content), [content, syntaxTokens]);
  const isContentWidth = widthMode === 'content';
  const gutterWidth = LN_W * 2;

  const isAdd = line.type === 'add';
  const isDel = line.type === 'delete';
  const tone = resolveTextDiffVisualTone(line, isReplacementPair);
  const palette = resolveTextDiffCssPalette(tone);
  const rowBg = palette.rowBackground;
  const brdL = palette.accent;
  const pfxTx = palette.prefix;
  const pfx = isAdd ? '+' : isDel ? '-' : ' ';
  const hlBg = palette.inlineHighlight;
  const charSpans = isDel ? line.baseCharSpans : isAdd ? line.mineCharSpans : null;
  const hasSearchRanges = searchRanges.length > 0;
  const hasTextSelection = Boolean(textSelectionRange && textSelectionRange.end > textSelectionRange.start);
  const textSelectionOverlayStyle = useMemo<CSSProperties | null>(
    () => buildTextSelectionOverlayStyle(textSelectionRange, content.length),
    [content.length, textSelectionRange],
  );
  const {
    activeCapsuleSurface,
    diffHighlightBackground,
    gutterBackground,
    gutterShadow,
  } = buildDiffSelectionSurfaces({
    selectionAccentColor,
    isBaseLineSelected,
    isMineLineSelected,
    isRangeSelected,
    isActiveSearch,
  });
  const inlineBg = hasSearchRanges || isRangeSelected ? undefined : rowBg;
  const effectiveHighlightBackground = diffHighlightBackground ?? hlBg;
  const contentHighlightBackground = undefined;

  return (
    <div
      data-copy-side={copySide}
      className="flex items-stretch relative isolate"
      style={{
        height: ROW_H,
        width: isContentWidth ? '100%' : undefined,
        minWidth: isContentWidth ? 'max-content' : undefined,
        background: activeCapsuleSurface,
        borderRadius: isActiveSearch ? 999 : isRangeSelected ? 12 : undefined,
      }}>
      {brdL !== 'transparent' && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[6]"
          style={{
            left: isActiveSearch ? 2 : 0,
            top: 2,
            bottom: 2,
            width: 3,
            borderRadius: 999,
            background: brdL,
          }}
        />
      )}
      <div
        className="flex shrink-0 sticky left-0 z-[4]"
        style={{
          width: gutterWidth,
          minWidth: gutterWidth,
          background: gutterBackground,
          boxShadow: gutterShadow,
        }}>
        <Ln
          n={line.baseLineNo}
          active={isActiveSearch}
          tone="base"
          selected={isBaseLineSelected}
          selectedColor={selectionAccentColor}
          title={lineNumberTitle}
          onClick={onBaseLineNumberClick}
        />
        <Ln
          n={line.mineLineNo}
          active={isActiveSearch}
          tone="mine"
          selected={isMineLineSelected}
          selectedColor={selectionAccentColor}
          title={lineNumberTitle}
          onClick={onMineLineNumberClick}
        />
      </div>
      <div
        className="flex relative z-[1]"
          style={{
            flex: 1,
            minWidth: isContentWidth ? 'max-content' : 0,
            background: contentHighlightBackground,
          }}>
        <span
          className="select-none shrink-0 relative z-[1]"
          style={{
            paddingLeft: 4, paddingRight: 3,
            color: pfxTx,
            fontSize: FONT_SIZE.md,
            lineHeight: `${ROW_H}px`,
            fontFamily: FONT_CODE,
          }}>
          {pfx}
        </span>
        <span
          data-selectable-text-root="true"
          className={allowTextSelection ? 'relative z-[1] logical-text-selection-surface cursor-text' : 'relative z-[1]'}
          style={{
            display: 'block',
            flex: 1,
            paddingRight: 8,
            whiteSpace: 'pre',
            fontSize,
            lineHeight: `${ROW_H}px`,
            color: cssVar('t0'),
            fontFamily: FONT_CODE,
            minWidth: isContentWidth ? 'max-content' : 0,
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
            className="relative z-[1] inline-block"
            style={{
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
          className="pointer-events-none absolute inset-0 rounded-[999px]"
          style={{
            zIndex: 5,
            border: `1px solid ${cssAlpha('searchHl', 'de')}`,
            boxSizing: 'border-box',
            boxShadow: `0 6px 18px -16px ${cssAlpha('searchHl', '44')}`,
          }}
        />
      )}
    </div>
  );
});

export default DiffRow;
