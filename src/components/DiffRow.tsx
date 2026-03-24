// src/components/DiffRow.tsx
import { memo, useMemo, useState } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import type { DiffLine } from '../types';
import { useTheme } from '../context/theme';
import { copyText } from '../utils/clipboard';
import { tokenize } from '../engine/tokenizer';
import { ROW_H } from '../hooks/useVirtual';
import Ln from './Ln';
import TokenText from './TokenText';

interface DiffRowProps {
  line: DiffLine;
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

const DiffRow = memo(({ line, isSearchMatch, isActiveSearch, showWhitespace, fontSize }: DiffRowProps) => {
  const T       = useTheme();
  const { t } = useI18n();
  const content = line.base ?? line.mine ?? '';
  const tokens  = useMemo(() => tokenize(content), [content]);
  const [hovered, setHovered] = useState(false);

  const isAdd = line.type === 'add';
  const isDel = line.type === 'delete';

  const rowBg     = isAdd ? T.addBg  : isDel ? T.delBg  : 'transparent';
  const brdL      = isAdd ? T.addBrd : isDel ? T.delBrd : 'transparent';
  const pfxTx     = isAdd ? T.addTx  : isDel ? T.delTx  : T.t2;
  const pfx       = isAdd ? '+' : isDel ? '-' : ' ';
  const hlBg      = isDel ? T.delHl  : T.addHl;
  const charSpans = isDel ? line.baseCharSpans : isAdd ? line.mineCharSpans : null;
  const searchBg  = isActiveSearch
    ? T.searchActiveBg
    : isSearchMatch
    ? `${T.searchHl}28`
    : undefined;
  const copyValue = content;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'stretch',
        borderLeft: `3px solid ${brdL}`,
        background: searchBg ?? rowBg,
        outline: isActiveSearch ? `1px solid ${T.searchHl}` : undefined,
        position: 'relative',
      }}>
      <Ln n={line.baseLineNo} T={T} active={isActiveSearch} />
      <Ln n={line.mineLineNo} T={T} active={isActiveSearch} />
      <span style={{
        paddingLeft: 4, paddingRight: 3,
        color: pfxTx, userSelect: 'none',
        fontSize: FONT_SIZE.md, flexShrink: 0,
        lineHeight: `${ROW_H}px`,
        fontFamily: FONT_CODE,
      }}>
        {pfx}
      </span>
      <span style={{
        flex: 1, paddingRight: 8,
        whiteSpace: 'pre', fontSize,
        overflow: 'hidden',
        lineHeight: `${ROW_H}px`,
        color: T.t0,
        fontFamily: FONT_CODE,
        minWidth: 0,
      }}>
        {showWhitespace && !charSpans
          ? renderWithWhitespaceMark(content, T)
          : <TokenText tokens={tokens} charSpans={charSpans} hlBg={hlBg} />}
      </span>
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
