// src/components/SplitCell.tsx
import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_SIZE } from '@/constants/typography';
import { LN_W } from '@/constants/layout';
import type { DiffLine, Token, WorkbookSelectedCell } from '@/types';
import { tokenize } from '@/engine/text/tokenizer';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import Ln from '@/components/diff/Ln';
import TokenText from '@/components/shared/TokenText';
import type { TokenSearchRange } from '@/components/shared/TokenText';

interface SplitCellProps {
  line: DiffLine | null;
  side: 'left' | 'right';
  syntaxTokens?: Token[] | undefined;
  widthMode?: 'fill' | 'content';
  lineNumberLayout?: 'single' | 'paired';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  searchRanges?: TokenSearchRange[] | undefined;
  showWhitespace: boolean;
  fontSize: number;
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

const SplitCell = memo(({
  line,
  side,
  syntaxTokens,
  widthMode = 'fill',
  lineNumberLayout = 'single',
  isSearchMatch: _isSearchMatch,
  isActiveSearch,
  searchRanges = [],
  showWhitespace,
  fontSize,
  isReplacementPair = false,
  rowHeightOverride,
  rowHighlightBg,
}: SplitCellProps) => {
  const resolvedRowHeight = rowHeightOverride ?? ROW_H;
  const lineNumberTone = side === 'left' ? 'base' : 'mine';
  const isContentWidth = widthMode === 'content';
  const usesPairedLineNumbers = lineNumberLayout === 'paired';
  const gutterWidth = usesPairedLineNumbers ? LN_W * 2 : LN_W;
  const content = line?.base ?? line?.mine ?? '';
  const tokens = useMemo(() => syntaxTokens ?? tokenize(content), [content, syntaxTokens]);

  const renderLineNumberGutter = (currentLine: DiffLine | null) => (
    <div style={{
      width: gutterWidth,
      minWidth: gutterWidth,
      display: 'flex',
      flexShrink: 0,
      position: 'sticky',
      left: 0,
      zIndex: 4,
      background: cssVar('lnBg'),
      boxShadow: `10px 0 14px -14px ${cssVar('border2')}`,
    }}>
      {usesPairedLineNumbers ? (
        <>
          <Ln n={currentLine?.baseLineNo ?? null} active={isActiveSearch} tone="base" />
          <Ln n={currentLine?.mineLineNo ?? null} active={isActiveSearch} tone="mine" />
        </>
      ) : (
        <Ln
          n={side === 'left' ? (currentLine?.baseLineNo ?? null) : (currentLine?.mineLineNo ?? null)}
          active={isActiveSearch}
          tone={lineNumberTone}
        />
      )}
    </div>
  );

  // Empty padding cell (for alignment when one side has no matching line)
  if (!line) {
    return (
      <div style={{
        flex: isContentWidth ? '0 0 auto' : 1,
        display: 'flex',
        height: resolvedRowHeight,
        borderLeft: `3px solid ${cssVar('bg4')}`,
        width: isContentWidth ? 'max-content' : undefined,
        minWidth: 0,
        isolation: 'isolate',
      }}>
        {renderLineNumberGutter(null)}
        <div style={{ flex: 1, background: cssVar('bg2'), minWidth: 0 }} />
      </div>
    );
  }

  const isAdd    = line.type === 'add';
  const isDel    = line.type === 'delete';
  const isModify = isReplacementPair;
  const useModifyTone = isModify;
  const bg       = useModifyTone ? cssVar('chgBg') : isAdd ? cssVar('addBg')  : isDel ? cssVar('delBg')  : 'transparent';
  const brd      = useModifyTone ? cssVar('chgTx') : isAdd ? cssVar('addBrd') : isDel ? cssVar('delBrd') : 'transparent';
  const pfx      = isAdd ? '+' : isDel ? '-' : ' ';
  const pfxC     = useModifyTone ? cssVar('chgTx') : isAdd ? cssVar('addTx')  : isDel ? cssVar('delTx')  : cssVar('t2');
  const hlBg     = useModifyTone ? cssAlpha('chgTx', '40') : isDel ? cssVar('delHl')  : cssVar('addHl');
  const charSpans = side === 'left' ? line.baseCharSpans : line.mineCharSpans;
  const hasInlineModifyHighlight = isModify && Boolean(charSpans && charSpans.length > 0);
  const hasSearchRanges = searchRanges.length > 0;
  const searchBg = rowHighlightBg;
  const contentBg = searchBg;
  const inlineBg = searchBg || hasSearchRanges
    ? undefined
    : useModifyTone
      ? (hasInlineModifyHighlight ? undefined : cssVar('chgBg'))
      : bg;

  return (
    <div style={{
      flex: isContentWidth ? '0 0 auto' : 1,
      display: 'flex',
      height: resolvedRowHeight,
      borderLeft: `3px solid ${brd}`,
      width: isContentWidth ? 'max-content' : undefined,
      minWidth: 0,
      isolation: 'isolate',
      borderRadius: isActiveSearch ? 6 : undefined,
      boxShadow: isActiveSearch
        ? `inset 0 0 0 1px ${cssAlpha('searchHl', 'cc')}, 0 0 0 1px ${cssAlpha('searchHl', '30')}`
        : undefined,
    }}>
      {renderLineNumberGutter(line)}
      <div style={{
        flex: isContentWidth ? '0 0 auto' : 1,
        display: 'flex',
        minWidth: 0,
        background: contentBg,
        backgroundImage: isActiveSearch
          ? `linear-gradient(90deg, ${cssAlpha('searchHl', '22')} 0%, transparent 26%)`
          : undefined,
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
        <span style={{
          flex: isContentWidth ? '0 0 auto' : 1,
          paddingRight: 6,
          whiteSpace: 'pre', fontSize,
          lineHeight: `${resolvedRowHeight}px`,
          color: cssVar('t0'),
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
    </div>
  );
});

export default SplitCell;
