// src/components/DiffRow.tsx
import { memo, useMemo, useState } from 'react';
import { FONT_CODE, FONT_SIZE } from '@/constants/typography';
import { Copy } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import type { DiffLine, Token } from '@/types';
import { copyText } from '@/utils/app/clipboard';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import { tokenize } from '@/engine/text/tokenizer';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { LN_W } from '@/constants/layout';
import Ln from '@/components/diff/Ln';
import TokenText from '@/components/shared/TokenText';
import type { TokenSearchRange } from '@/components/shared/TokenText';

interface DiffRowProps {
  line: DiffLine;
  syntaxTokens?: Token[] | undefined;
  isReplacementPair?: boolean;
  widthMode?: 'fill' | 'content';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  searchRanges?: TokenSearchRange[] | undefined;
  showWhitespace: boolean;
  fontSize: number;
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

const DiffRow = memo(({
  line, syntaxTokens, isReplacementPair = false, widthMode = 'fill',
  isSearchMatch: _isSearchMatch, isActiveSearch, searchRanges = [], showWhitespace, fontSize,
}: DiffRowProps) => {
  const { t } = useI18n();
  const content = line.base ?? line.mine ?? '';
  const tokens = useMemo(() => syntaxTokens ?? tokenize(content), [content, syntaxTokens]);
  const [hovered, setHovered] = useState(false);
  const isContentWidth = widthMode === 'content';
  const gutterWidth = LN_W * 2;

  const isAdd = line.type === 'add';
  const isDel = line.type === 'delete';
  const isModify = isReplacementPair;

  const rowBg = isModify ? cssVar('chgBg') : isAdd ? cssVar('addBg') : isDel ? cssVar('delBg') : 'transparent';
  const brdL = isModify ? cssVar('chgTx') : isAdd ? cssVar('addBrd') : isDel ? cssVar('delBrd') : 'transparent';
  const pfxTx = isModify ? cssVar('chgTx') : isAdd ? cssVar('addTx') : isDel ? cssVar('delTx') : cssVar('t2');
  const pfx = isAdd ? '+' : isDel ? '-' : ' ';
  const hlBg = isModify ? cssAlpha('chgTx', '40') : isDel ? cssVar('delHl') : cssVar('addHl');
  const charSpans = isDel ? line.baseCharSpans : isAdd ? line.mineCharSpans : null;
  const hasSearchRanges = searchRanges.length > 0;
  const inlineBg = hasSearchRanges ? undefined : rowBg;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-stretch relative isolate"
      style={{
        height: ROW_H,
        width: isContentWidth ? 'max-content' : undefined,
        minWidth: isContentWidth ? 0 : undefined,
        borderLeft: `3px solid ${brdL}`,
        borderRadius: isActiveSearch ? 6 : undefined,
        boxShadow: isActiveSearch
          ? `inset 0 0 0 1px ${cssAlpha('searchHl', 'cc')}, 0 0 0 1px ${cssAlpha('searchHl', '30')}`
          : undefined,
      }}>
      <div
        className="flex shrink-0 sticky left-0 z-[4]"
        style={{
          width: gutterWidth,
          minWidth: gutterWidth,
          background: cssVar('lnBg'),
          boxShadow: `10px 0 14px -14px ${cssVar('border2')}`,
        }}>
        <Ln n={line.baseLineNo} active={isActiveSearch} tone="base" />
        <Ln n={line.mineLineNo} active={isActiveSearch} tone="mine" />
      </div>
      <div
        className="flex relative z-[1]"
          style={{
            flex: isContentWidth ? '0 0 auto' : 1,
            minWidth: isContentWidth ? 'max-content' : 0,
            background: isActiveSearch
              ? `linear-gradient(90deg, ${cssAlpha('searchHl', '22')} 0%, transparent 26%)`
              : undefined,
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
          className="relative z-[1]"
          style={{
            flex: isContentWidth ? '0 0 auto' : 1,
            paddingRight: 8,
            whiteSpace: 'pre', fontSize,
            lineHeight: `${ROW_H}px`,
            color: cssVar('t0'),
            fontFamily: FONT_CODE,
            minWidth: isContentWidth ? 'max-content' : 0,
          }}
          title={content || undefined}>
          <span
            className="inline-block"
            style={{
              background: inlineBg,
              padding: inlineBg ? '0 2px' : 0,
              borderRadius: inlineBg ? 2 : 0,
            }}>
            {showWhitespace && !charSpans && searchRanges.length === 0
              ? renderWithWhitespaceMark(content)
              : (
                <TokenText
                  tokens={tokens}
                  charSpans={charSpans}
                  hlBg={hlBg}
                  searchRanges={searchRanges}
                  searchHlBg={cssAlpha('searchHl', '3a')}
                  activeSearchHlBg={cssAlpha('searchHl', '66')}
                />
              )}
          </span>
        </span>
      </div>
      {hovered && (
        <button
          onClick={() => { void copyText(content); }}
          aria-label={t('diffRowCopy')}
          className="
            absolute right-1 top-0.5 h-[17px] px-1.5
            bg-bg-elevated border border-border-strong
            rounded text-text-primary text-[11px] font-ui
            cursor-pointer z-[2]
            inline-flex items-center gap-1
            hover:text-accent hover:border-accent
            active:scale-95 transition-all duration-150
          ">
          <Copy size={10} />
          {t('diffRowCopy')}
        </button>
      )}
    </div>
  );
});

export default DiffRow;
