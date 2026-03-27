// src/components/DiffRow.tsx
import { memo, useMemo, useState } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import type { DiffLine } from '@/types';
import { useTheme } from '@/context/theme';
import { copyText } from '@/utils/app/clipboard';
import { tokenize } from '@/engine/text/tokenizer';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { LN_W } from '@/constants/layout';
import Ln from '@/components/diff/Ln';
import TokenText from '@/components/shared/TokenText';

interface DiffRowProps {
  line: DiffLine;
  isReplacementPair?: boolean;
  widthMode?: 'fill' | 'content';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  showWhitespace: boolean;
  fontSize: number;
}

function renderWithWhitespaceMark(text: string, T: ReturnType<typeof useTheme>) {
  const trailingMatch = text.match(/(\s+)$/);
  if (!trailingMatch) return text;
  const body     = text.slice(0, text.length - trailingMatch[1]!.length);
  const trailing = trailingMatch[1]!.replace(/ /g, '·').replace(/\t/g, '→');
  return (
    <>
      {body}
      <span style={{ color: T.t2, opacity: 0.5 }}>{trailing}</span>
    </>
  );
}

const DiffRow = memo(({
  line,
  isReplacementPair = false,
  widthMode = 'fill',
  isSearchMatch,
  isActiveSearch,
  showWhitespace,
  fontSize,
}: DiffRowProps) => {
  const T       = useTheme();
  const { t } = useI18n();
  const content = line.base ?? line.mine ?? '';
  const tokens  = useMemo(() => tokenize(content), [content]);
  const [hovered, setHovered] = useState(false);
  const isContentWidth = widthMode === 'content';
  const gutterWidth = LN_W * 2;

  const isAdd = line.type === 'add';
  const isDel = line.type === 'delete';
  const isModify = isReplacementPair;

  const rowBg     = isModify ? T.chgBg  : isAdd ? T.addBg  : isDel ? T.delBg  : 'transparent';
  const brdL      = isModify ? T.chgTx  : isAdd ? T.addBrd : isDel ? T.delBrd : 'transparent';
  const pfxTx     = isModify ? T.chgTx  : isAdd ? T.addTx  : isDel ? T.delTx  : T.t2;
  const pfx       = isAdd ? '+' : isDel ? '-' : ' ';
  const hlBg      = isModify ? `${T.chgTx}40` : isDel ? T.delHl  : T.addHl;
  const charSpans = isDel ? line.baseCharSpans : isAdd ? line.mineCharSpans : null;
  const searchBg  = isActiveSearch
    ? T.searchActiveBg
    : isSearchMatch
    ? `${T.searchHl}28`
    : undefined;
  const bodyBg = searchBg;
  const inlineBg = searchBg ? undefined : rowBg;
  const copyValue = content;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'stretch',
        width: isContentWidth ? 'max-content' : undefined,
        minWidth: isContentWidth ? 0 : undefined,
        borderLeft: `3px solid ${brdL}`,
        outline: isActiveSearch ? `1px solid ${T.searchHl}` : undefined,
        position: 'relative',
        isolation: 'isolate',
      }}>
      <div style={{
        width: gutterWidth,
        minWidth: gutterWidth,
        display: 'flex',
        flexShrink: 0,
        position: 'sticky',
        left: 0,
        zIndex: 4,
        background: T.lnBg,
        boxShadow: `10px 0 14px -14px ${T.border2}`,
      }}>
        <Ln n={line.baseLineNo} T={T} active={isActiveSearch} tone="base" />
        <Ln n={line.mineLineNo} T={T} active={isActiveSearch} tone="mine" />
      </div>
      <div style={{
        flex: isContentWidth ? '0 0 auto' : 1,
        display: 'flex',
        minWidth: isContentWidth ? 'max-content' : 0,
        background: bodyBg,
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{
          paddingLeft: 4, paddingRight: 3,
          color: pfxTx, userSelect: 'none',
          fontSize: FONT_SIZE.md, flexShrink: 0,
          lineHeight: `${ROW_H}px`,
          fontFamily: FONT_CODE,
          position: 'relative',
          zIndex: 1,
        }}>
          {pfx}
        </span>
        <span style={{
          flex: isContentWidth ? '0 0 auto' : 1,
          paddingRight: 8,
          whiteSpace: 'pre', fontSize,
          lineHeight: `${ROW_H}px`,
          color: T.t0,
          fontFamily: FONT_CODE,
          minWidth: isContentWidth ? 'max-content' : 0,
          position: 'relative',
          zIndex: 1,
        }}
        title={content || undefined}>
          <span style={{
            display: 'inline-block',
            background: inlineBg,
            padding: inlineBg ? '0 2px' : 0,
            borderRadius: inlineBg ? 2 : 0,
          }}>
            {showWhitespace && !charSpans
              ? renderWithWhitespaceMark(content, T)
              : <TokenText tokens={tokens} charSpans={charSpans} hlBg={hlBg} />}
          </span>
        </span>
      </div>
      {hovered && (
        <button
          onClick={() => copyText(copyValue)}
          aria-label={t('diffRowCopy')}
          style={{
            position: 'absolute', right: 4, top: 2,
            height: 17, padding: '0 6px', fontSize: FONT_SIZE.xs,
            background: T.bg3, border: `1px solid ${T.border2}`,
            borderRadius: 3, color: T.t1,
            cursor: 'pointer', fontFamily: FONT_UI, zIndex: 2,
          }}>
          {t('diffRowCopy')}
        </button>
      )}
    </div>
  );
});

export default DiffRow;
