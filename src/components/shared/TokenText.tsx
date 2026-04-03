// src/components/TokenText.tsx
import { memo, useMemo } from 'react';
import type { Token } from '@/types';
import { makeTokenColors } from '@/theme';
import { useTheme } from '@/context/theme';

export interface TokenSearchRange {
  start: number;
  end: number;
  active?: boolean;
}

interface TokenTextProps {
  tokens: Token[];
  charSpans?: { highlight: boolean; text: string }[] | null;
  hlBg?: string;
  searchRanges?: TokenSearchRange[] | undefined;
  searchHlBg?: string | undefined;
  activeSearchHlBg?: string | undefined;
}

interface AnnotatedSegment {
  text: string;
  color: string;
  fontStyle: number | null;
  diffHighlighted: boolean;
  searchHighlighted: boolean;
  activeSearch: boolean;
}

function resolveFontStyle(fontStyle: number | null | undefined) {
  if (fontStyle == null || fontStyle <= 0) return undefined;

  return {
    fontStyle: (fontStyle & 1) !== 0 ? 'italic' : undefined,
    fontWeight: (fontStyle & 2) !== 0 ? 700 : undefined,
    textDecorationLine: [
      (fontStyle & 4) !== 0 ? 'underline' : '',
      (fontStyle & 8) !== 0 ? 'line-through' : '',
    ].filter(Boolean).join(' ') || undefined,
  };
}

const TokenText = memo(({
  tokens,
  charSpans,
  hlBg,
  searchRanges = [],
  searchHlBg,
  activeSearchHlBg,
}: TokenTextProps) => {
  const themeKey = useTheme();
  const colors = useMemo(() => makeTokenColors(themeKey), [themeKey]);
  const annotatedSegments = useMemo<AnnotatedSegment[] | null>(() => {
    if (searchRanges.length === 0 && (!charSpans || charSpans.length === 0)) return null;

    const content = (charSpans?.map((span) => span.text).join('') ?? tokens.map((token) => token.text).join(''));
    if (!content) return null;

    const length = content.length;
    const colorByIndex = new Array<string>(length).fill(colors.plain);
    const fontStyleByIndex = new Array<number | null>(length).fill(null);
    const diffHighlightByIndex = new Array<boolean>(length).fill(false);
    const searchHighlightByIndex = new Array<boolean>(length).fill(false);
    const activeSearchByIndex = new Array<boolean>(length).fill(false);

    let offset = 0;
    tokens.forEach((token) => {
      const color = token.color ?? colors[token.type] ?? colors.plain;
      const fontStyle = token.fontStyle ?? null;
      for (let index = 0; index < token.text.length && (offset + index) < length; index += 1) {
        colorByIndex[offset + index] = color;
        fontStyleByIndex[offset + index] = fontStyle;
      }
      offset += token.text.length;
    });

    if (charSpans && charSpans.length > 0) {
      offset = 0;
      charSpans.forEach((span) => {
        for (let index = 0; index < span.text.length && (offset + index) < length; index += 1) {
          diffHighlightByIndex[offset + index] = span.highlight;
        }
        offset += span.text.length;
      });
    }

    searchRanges.forEach((range) => {
      const start = Math.max(0, Math.min(length, range.start));
      const end = Math.max(start, Math.min(length, range.end));
      for (let index = start; index < end; index += 1) {
        searchHighlightByIndex[index] = true;
        if (range.active) activeSearchByIndex[index] = true;
      }
    });

    const segments: AnnotatedSegment[] = [];
    let cursor = 0;
    while (cursor < length) {
      const nextColor = colorByIndex[cursor] ?? colors.plain;
      const nextFontStyle = fontStyleByIndex[cursor] ?? null;
      const nextDiff = diffHighlightByIndex[cursor] ?? false;
      const nextSearch = searchHighlightByIndex[cursor] ?? false;
      const nextActive = activeSearchByIndex[cursor] ?? false;
      let end = cursor + 1;

      while (end < length) {
        if (
          (colorByIndex[end] ?? colors.plain) !== nextColor
          || (fontStyleByIndex[end] ?? null) !== nextFontStyle
          || (diffHighlightByIndex[end] ?? false) !== nextDiff
          || (searchHighlightByIndex[end] ?? false) !== nextSearch
          || (activeSearchByIndex[end] ?? false) !== nextActive
        ) {
          break;
        }
        end += 1;
      }

      segments.push({
        text: content.slice(cursor, end),
        color: nextColor,
        fontStyle: nextFontStyle,
        diffHighlighted: nextDiff,
        searchHighlighted: nextSearch,
        activeSearch: nextActive,
      });
      cursor = end;
    }

    return segments;
  }, [charSpans, colors, searchRanges, tokens]);

  if (annotatedSegments) {
    return (
      <>
        {annotatedSegments.map((segment, index) => {
          const background = segment.activeSearch
            ? activeSearchHlBg
            : segment.searchHighlighted
              ? searchHlBg
              : segment.diffHighlighted
                ? hlBg
                : undefined;
          const style = {
            color: segment.color,
            borderRadius: background ? 2 : undefined,
            background,
            padding: background ? '0 1px' : undefined,
            ...resolveFontStyle(segment.fontStyle),
          };
          return background ? (
            <mark key={index} style={style}>
              {segment.text}
            </mark>
          ) : (
            <span key={index} style={{ color: segment.color, ...resolveFontStyle(segment.fontStyle) }}>{segment.text}</span>
          );
        })}
      </>
    );
  }

  return (
    <>
      {tokens.map((tok, i) => (
        <span
          key={i}
          style={{
            color: tok.color ?? colors[tok.type] ?? colors.plain,
            ...resolveFontStyle(tok.fontStyle),
          }}>
          {tok.text}
        </span>
      ))}
    </>
  );
});

export default TokenText;
