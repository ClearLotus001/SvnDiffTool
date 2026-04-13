// src/components/navigation/RevisionOptionRow.tsx
import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SvnRevisionInfo } from '@/types';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import Tooltip from '@/components/shared/Tooltip';
import {
  RP_UI,
  buildRevisionOptionDescription,
  buildRevisionOptionMeta,
  clampInlineText,
  formatDisplayRevision,
  renderHighlightedText,
} from '@/utils/navigation/revisionPickerUtils';

// ── TruncatedTooltipText ────────────────────────────────────────────────────

interface TruncatedTooltipTextProps {
  text: string;
  query: string;
  lines?: number;
  maxWidth?: number;
  textStyle: CSSProperties;
  tooltipText?: string;
  highlightStyle: CSSProperties;
  anchorStyle?: CSSProperties | undefined;
}

const TruncatedTooltipText = memo(({
  text, query, lines = 1, maxWidth = 360, textStyle, tooltipText, highlightStyle, anchorStyle,
}: TruncatedTooltipTextProps) => {
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const measure = () => {
      const next = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
      setIsTruncated((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lines, query, text]);

  return (
    <Tooltip content={tooltipText ?? text} maxWidth={maxWidth} disabled={!isTruncated} anchorStyle={anchorStyle}>
      <span ref={contentRef} style={{ ...textStyle, ...clampInlineText(lines) }}>
        {renderHighlightedText(text, query, highlightStyle)}
      </span>
    </Tooltip>
  );
});

// ── RevisionOptionRow ───────────────────────────────────────────────────────

interface RevisionOptionRowProps {
  option: SvnRevisionInfo;
  selected: boolean;
  hovered: boolean;
  searchQuery: string;
  highlightStyle: CSSProperties;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onLeave: (id: string) => void;
}

const RevisionOptionRow = memo(({
  option, selected, hovered, searchQuery, highlightStyle,
  onSelect, onHover, onLeave,
}: RevisionOptionRowProps) => {
  const description = buildRevisionOptionDescription(option);
  const meta = buildRevisionOptionMeta(option);
  const isSpecial = option.kind !== 'revision';
  const displayRevision = formatDisplayRevision(option.revision);
  const normalizedQuery = searchQuery.replace(/^r(?=\d)/i, '');

  const rowBackground = selected
    ? `linear-gradient(90deg, ${cssAlpha('acc2', '18')} 0%, ${cssAlpha('acc2', '0d')} 100%)`
    : hovered ? `linear-gradient(90deg, ${cssAlpha('acc2', '12')} 0%, ${cssVar('bg2')} 100%)` : 'transparent';
  const revisionColor = cssVar('acc2');
  const rowStroke = selected ? cssAlpha('acc2', 'aa') : hovered ? cssAlpha('acc2', '88') : '';
  const rowStrokeWidth = selected ? 4 : 3;

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(option.id)}
      onMouseLeave={() => onLeave(option.id)}
      onClick={() => onSelect(option.id)}
      className="relative block w-full border-none text-left cursor-pointer transition-[background,box-shadow] duration-150"
      style={{
        zIndex: selected ? 2 : hovered ? 1 : 0,
        borderBottom: `1px solid ${cssVar('border')}`,
        background: rowBackground,
        color: cssVar('t0'),
      }}>
      <div className="flex items-start gap-3.5 min-w-0" style={{ padding: RP_UI.rowPadding }}>
        <div className="grid content-center gap-0.5 min-w-0 box-border" style={{ flex: `0 0 ${RP_UI.rowLeftWidth}px`, width: RP_UI.rowLeftWidth }}>
          <span
            className="whitespace-nowrap overflow-hidden text-ellipsis font-code text-[13px] font-bold"
            style={{ color: revisionColor }}>
            {renderHighlightedText(displayRevision, normalizedQuery, highlightStyle)}
          </span>
        </div>
        <div className="grid gap-0.5 min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <TruncatedTooltipText
              text={description || option.title || option.revision}
              tooltipText={description || option.title || option.revision}
              query={searchQuery}
              lines={2}
              maxWidth={420}
              highlightStyle={highlightStyle}
              anchorStyle={{ display: 'block', flexShrink: 1, minWidth: 0, maxWidth: '100%' }}
              textStyle={{
                minWidth: 0,
                color: selected ? cssVar('t0') : cssVar('t1'),
                fontSize: FONT_SIZE.xs,
                fontWeight: selected ? 700 : 600,
                fontFamily: FONT_UI,
              }}
            />
            {meta && (
              <span className="shrink-0 text-text-secondary text-[10px] font-ui whitespace-nowrap text-right">
                {renderHighlightedText(meta, searchQuery, highlightStyle)}
              </span>
            )}
          </div>
          {isSpecial && option.message && option.message !== description && (
            <TruncatedTooltipText
              text={option.message}
              tooltipText={option.message}
              query={searchQuery}
              lines={2}
              maxWidth={420}
              highlightStyle={highlightStyle}
              anchorStyle={{ display: 'block', minWidth: 0, maxWidth: '100%' }}
              textStyle={{ color: cssVar('t2'), fontSize: RP_UI.metaSize, fontFamily: FONT_UI }}
            />
          )}
        </div>
      </div>
      {rowStroke && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none box-border"
          style={{
            border: `1px solid ${rowStroke}`,
            borderLeftWidth: rowStrokeWidth,
          }}
        />
      )}
    </button>
  );
});

export default RevisionOptionRow;
