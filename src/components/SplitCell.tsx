// src/components/SplitCell.tsx
import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_SIZE } from '../constants/typography';
import type { DiffLine, WorkbookSelectedCell } from '../types';
import { useTheme } from '../context/theme';
import { tokenize } from '../engine/tokenizer';
import { ROW_H } from '../hooks/useVirtual';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import type { WorkbookMergeRange } from '../utils/workbookMeta';
import Ln from './Ln';
import TokenText from './TokenText';

interface SplitCellProps {
  line: DiffLine | null;
  side: 'left' | 'right';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  showWhitespace: boolean;
  fontSize: number;
  sheetName?: string;
  versionLabel?: string;
  headerRowNumber?: number;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  pairedLine?: DiffLine | null;
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

const SplitCell = memo(({
  line,
  side,
  isSearchMatch,
  isActiveSearch,
  showWhitespace,
  fontSize,
  rowHeightOverride,
  rowHighlightBg,
}: SplitCellProps) => {
  const T = useTheme();
  const resolvedRowHeight = rowHeightOverride ?? ROW_H;

  // Empty padding cell (for alignment when one side has no matching line)
  if (!line) {
    return (
      <div style={{
        flex: 1, display: 'flex', height: resolvedRowHeight,
        background: T.bg2,
        borderLeft: `3px solid ${T.bg4}`,
        minWidth: 0,
      }}>
        <Ln T={T} />
        <span style={{ flex: 1 }} />
      </div>
    );
  }

  const isAdd    = line.type === 'add';
  const isDel    = line.type === 'delete';
  const bg       = isAdd ? T.addBg  : isDel ? T.delBg  : 'transparent';
  const brd      = isAdd ? T.addBrd : isDel ? T.delBrd : 'transparent';
  const pfx      = isAdd ? '+' : isDel ? '-' : ' ';
  const pfxC     = isAdd ? T.addTx  : isDel ? T.delTx  : T.t2;
  const hlBg     = isDel ? T.delHl  : T.addHl;
  const content  = line.base ?? line.mine ?? '';
  const tokens   = useMemo(() => tokenize(content), [content]);
  const charSpans = side === 'left' ? line.baseCharSpans : line.mineCharSpans;
  const lineNo   = side === 'left'
    ? line.baseLineNo
    : line.mineLineNo;
  const searchBg = rowHighlightBg ?? (isActiveSearch
    ? T.searchActiveBg
    : isSearchMatch
    ? `${T.searchHl}28`
    : undefined);

  return (
    <div style={{
      flex: 1, display: 'flex', height: resolvedRowHeight,
      borderLeft: `3px solid ${brd}`,
      background: searchBg ?? bg,
      overflow: 'hidden',
      minWidth: 0,
    }}>
      <Ln n={lineNo} T={T} active={isActiveSearch} />
      <span style={{
        paddingLeft: 4, paddingRight: 3,
        color: pfxC, userSelect: 'none',
        fontSize: FONT_SIZE.md, flexShrink: 0,
        lineHeight: `${resolvedRowHeight}px`,
        fontFamily: FONT_CODE,
      }}>
        {pfx}
      </span>
      <span style={{
        flex: 1, paddingRight: 6,
        whiteSpace: 'pre', fontSize,
        overflow: 'hidden',
        lineHeight: `${resolvedRowHeight}px`,
        color: T.t0,
        fontFamily: FONT_CODE,
        minWidth: 0,
      }}>
        {showWhitespace && !charSpans
          ? renderWithWhitespaceMark(content, T)
          : <TokenText tokens={tokens} charSpans={charSpans} hlBg={hlBg} />}
      </span>
    </div>
  );
});

export default SplitCell;
