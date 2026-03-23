// src/components/SplitCell.tsx
import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_SIZE } from '../constants/typography';
import type { DiffLine, WorkbookSelectedCell } from '../types';
import { useTheme } from '../context/theme';
import { tokenize } from '../engine/tokenizer';
import { ROW_H } from '../hooks/useVirtual';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { getWorkbookVisualWidth, parseWorkbookDisplayLine } from '../utils/workbookDisplay';
import { buildWorkbookCompareCells, type WorkbookCompareCellState } from '../utils/workbookCompare';
import type { WorkbookMergeRange } from '../utils/workbookMeta';
import Ln from './Ln';
import TokenText from './TokenText';
import WorkbookLine, { WORKBOOK_ROLE_BADGE_W } from './WorkbookLine';

interface SplitCellProps {
  line: DiffLine | null;
  side: 'left' | 'right';
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  showWhitespace: boolean;
  fontSize: number;
  sheetName?: string;
  versionLabel?: string;
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
}

const EMPTY_COMPARE_CELLS = new Map<number, WorkbookCompareCellState>();

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
  sheetName = '',
  versionLabel = '',
  selectedCell = null,
  onSelectCell,
  pairedLine = null,
  maskEqualCells = true,
  stickyLeftBase = 0,
  freezeColumnCount = 1,
  columnCount = 0,
  visibleColumns = [],
  renderColumns,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  mergedRanges = [],
  changedColumns,
  workbookRoleLabel,
  workbookRoleTone,
}: SplitCellProps) => {
  const T = useTheme();

  // Empty padding cell (for alignment when one side has no matching line)
  if (!line) {
    return (
      <div style={{
        flex: 1, display: 'flex', height: ROW_H,
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
  const workbookLine = useMemo(() => parseWorkbookDisplayLine(content), [content]);
  const tokens   = useMemo(() => (workbookLine ? null : tokenize(content)), [content, workbookLine]);
  const charSpans = side === 'left' ? line.baseCharSpans : line.mineCharSpans;
  const lineNo   = workbookLine?.kind === 'row'
    ? workbookLine.rowNumber
    : side === 'left'
    ? line.baseLineNo
    : line.mineLineNo;
  const searchBg = isActiveSearch
    ? T.searchActiveBg
    : isSearchMatch
    ? `${T.searchHl}28`
    : undefined;
  const renderColumnIndexes = useMemo(
    () => renderColumns?.map(entry => entry.column) ?? visibleColumns,
    [renderColumns, visibleColumns],
  );
  const compareCells = useMemo(
    () => (workbookLine ? buildWorkbookCompareCells(line, pairedLine, renderColumnIndexes) : EMPTY_COMPARE_CELLS),
    [line, pairedLine, renderColumnIndexes, workbookLine],
  );
  const maskedColumns = useMemo(
    () => (maskEqualCells ? [...compareCells.values()].filter(cell => cell.masked).map(cell => cell.column) : []),
    [compareCells, maskEqualCells],
  );
  const effectiveChangedColumns = useMemo(
    () => changedColumns ?? [...compareCells.values()].filter(cell => cell.changed).map(cell => cell.column),
    [changedColumns, compareCells],
  );

  const tone = isAdd ? 'add' : isDel ? 'delete' : 'neutral';
  const workbookWidth = workbookLine
    ? getWorkbookVisualWidth(workbookLine, visibleColumns.length || columnCount || 1)
    : 0;

  return (
    <div style={{
      flex: workbookLine ? '0 0 auto' : 1, display: 'flex', height: ROW_H,
      borderLeft: workbookLine ? 'none' : `3px solid ${brd}`,
      background: searchBg ?? bg,
      overflow: workbookLine ? 'visible' : 'hidden',
      minWidth: 0,
      width: workbookLine ? 46 + workbookWidth + 3 + (workbookRoleLabel ? WORKBOOK_ROLE_BADGE_W : 0) : undefined,
      contain: workbookLine ? 'layout paint style' : undefined,
    }}>
      {!workbookLine && (
        <Ln n={lineNo} T={T} active={isActiveSearch} />
      )}
      {!workbookLine && (
        <span style={{
          paddingLeft: 4, paddingRight: 3,
          color: pfxC, userSelect: 'none',
          fontSize: FONT_SIZE.md, flexShrink: 0,
          lineHeight: `${ROW_H}px`,
          fontFamily: FONT_CODE,
        }}>
          {pfx}
        </span>
      )}
      {workbookLine ? (
        <WorkbookLine
          parsed={workbookLine}
          tone={tone}
          active={isActiveSearch}
          sheetName={sheetName}
          side={side === 'left' ? 'base' : 'mine'}
          versionLabel={versionLabel}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          lineNumber={lineNo}
          freezeColumnCount={freezeColumnCount}
          stickyLeft={stickyLeftBase}
          rowHighlightBg={searchBg}
          fontSize={fontSize}
          columnCount={columnCount}
          visibleColumns={visibleColumns}
          renderColumns={renderColumns}
          leadingSpacerWidth={leadingSpacerWidth}
          trailingSpacerWidth={trailingSpacerWidth}
          mergedRanges={mergedRanges}
          maskedColumns={maskedColumns}
          changedColumns={effectiveChangedColumns}
          compareCells={compareCells}
          {...(workbookRoleLabel
            ? {
                roleLabel: workbookRoleLabel,
                roleTone: workbookRoleTone ?? (side === 'left' ? 'base' : 'mine'),
              }
            : {})}
        />
      ) : (
        <span style={{
          flex: 1, paddingRight: 6,
          whiteSpace: 'pre', fontSize,
          overflow: 'hidden',
          lineHeight: `${ROW_H}px`,
          color: T.t0,
          fontFamily: FONT_CODE,
          minWidth: 0,
        }}>
          {showWhitespace && !charSpans
            ? renderWithWhitespaceMark(content, T)
            : <TokenText tokens={tokens ?? []} charSpans={charSpans} hlBg={hlBg} />}
        </span>
      )}
    </div>
  );
});

export default SplitCell;
