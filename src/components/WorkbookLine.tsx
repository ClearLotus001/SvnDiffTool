import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { useTheme } from '../context/theme';
import type { Theme, WorkbookSelectedCell } from '../types';
import { LN_W } from '../constants/layout';
import { ROW_H } from '../hooks/useVirtual';
import {
  type WorkbookDisplayLine,
  WORKBOOK_CELL_WIDTH,
  getWorkbookVisualWidth,
} from '../utils/workbookDisplay';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import type { WorkbookCompareCellState } from '../utils/workbookCompare';
import type { WorkbookMergeRange } from '../utils/workbookMeta';
import WorkbookGridCell from './WorkbookGridCell';

export const WORKBOOK_ROLE_BADGE_W = 24;

interface WorkbookLineProps {
  parsed: WorkbookDisplayLine;
  tone: 'neutral' | 'add' | 'delete';
  active: boolean;
  sheetName?: string;
  side?: 'base' | 'mine';
  versionLabel?: string;
  headerRowNumber?: number;
  rowSelectionColumn?: number;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  lineNumber?: number | null;
  rowHeight?: number;
  freezeColumnCount?: number;
  stickyLeft?: number;
  rowHighlightBg?: string | undefined;
  fontSize?: number;
  columnCount?: number;
  visibleColumns?: number[];
  renderColumns?: HorizontalVirtualColumnEntry[] | undefined;
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  mergedRanges?: WorkbookMergeRange[];
  maskedColumns?: number[];
  changedColumns?: number[];
  compareCells?: Map<number, WorkbookCompareCellState>;
  roleLabel?: string;
  roleTone?: 'base' | 'mine';
}

function getToneColors(tone: WorkbookLineProps['tone'], T: Theme) {
  if (tone === 'add') {
    return {
      border: T.addBrd,
      bg: `${T.addBg}`,
      chipBg: `${T.addTx}18`,
      chipFg: T.addTx,
    };
  }
  if (tone === 'delete') {
    return {
      border: T.delBrd,
      bg: `${T.delBg}`,
      chipBg: `${T.delTx}18`,
      chipFg: T.delTx,
    };
  }
  return {
    border: T.border2,
    bg: T.bg1,
    chipBg: `${T.acc2}16`,
    chipFg: T.acc2,
  };
}

type MergeSlot =
  | { kind: 'start'; range: WorkbookMergeRange; visibleSpan: number; rowSpan: number }
  | { kind: 'placeholder'; range: WorkbookMergeRange; visibleSpan: number; rowSpan: number }
  | { kind: 'covered'; range: WorkbookMergeRange };

const WorkbookLine = memo(({
  parsed,
  tone,
  active,
  sheetName = '',
  side = 'mine',
  versionLabel = '',
  headerRowNumber = 0,
  rowSelectionColumn = 0,
  selectedCell = null,
  onSelectCell,
  lineNumber = null,
  rowHeight = ROW_H,
  freezeColumnCount = 1,
  stickyLeft = 0,
  rowHighlightBg,
  fontSize = FONT_SIZE.sm,
  columnCount = 0,
  visibleColumns = [],
  renderColumns,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  mergedRanges = [],
  maskedColumns = [],
  changedColumns = [],
  compareCells,
  roleLabel,
  roleTone = 'base',
}: WorkbookLineProps) => {
  const T = useTheme();
  const toneColors = getToneColors(tone, T);
  const maskedColumnSet = useMemo(() => new Set(maskedColumns), [maskedColumns]);
  const changedColumnSet = useMemo(() => new Set(changedColumns), [changedColumns]);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);

  if (parsed.kind === 'sheet') {
    return (
      <div
        style={{
          minWidth: getWorkbookVisualWidth(parsed, columnCount || visibleColumns.length || 1),
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
        }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: 999,
            border: `1px solid ${toneColors.border}`,
            background: toneColors.chipBg,
            color: toneColors.chipFg,
            fontSize: sizes.ui,
            fontFamily: FONT_UI,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
          {parsed.sheetName}
        </span>
      </div>
    );
  }

  const allVisibleColumns = visibleColumns.length > 0
    ? visibleColumns
    : Array.from({ length: Math.max(parsed.cells.length, columnCount, 1) }, (_, index) => index);
  const displayColumnEntries = renderColumns ?? allVisibleColumns.map((column, position) => ({ column, position }));
  const displayCells = displayColumnEntries.map(entry => parsed.cells[entry.column] ?? { value: '', formula: '' });
  const rowNumber = parsed.rowNumber;
  const selectionKind = selectedCell?.kind ?? 'cell';
  const roleAccent = roleTone === 'base' ? T.acc2 : T.acc;
  const selectionAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
  const isSelectionSheet = Boolean(selectedCell && selectedCell.sheetName === sheetName);
  const isSelectedRow = Boolean(
    isSelectionSheet
    && selectionKind !== 'column'
    && selectedCell?.rowNumber === rowNumber,
  );
  const roleBadgeWidth = roleLabel ? WORKBOOK_ROLE_BADGE_W : 0;
  const roleGlyphStyle = roleTone === 'base'
    ? {
        width: 8,
        height: 8,
        borderRadius: 3,
        transform: 'rotate(45deg)',
      }
    : {
        width: 9,
        height: 9,
        borderRadius: '50%',
      };

  const mergeSlots = new Map<number, MergeSlot>();
  mergedRanges.forEach(range => {
    if (parsed.rowNumber < range.startRow || parsed.rowNumber > range.endRow) return;

    const visibleColumnsInRange = displayColumnEntries.filter(
      entry => entry.column >= range.startCol && entry.column <= range.endCol,
    );
    if (visibleColumnsInRange.length === 0) return;

    const leadEntry = visibleColumnsInRange[0];
    if (!leadEntry) return;

    visibleColumnsInRange.forEach((entry, index) => {
      if (entry.column === leadEntry.column) {
        mergeSlots.set(entry.column, parsed.rowNumber === range.startRow
          ? {
              kind: 'start',
              range,
              visibleSpan: visibleColumnsInRange.length,
              rowSpan: Math.max(1, range.endRow - range.startRow + 1),
            }
          : {
              kind: 'placeholder',
              range,
              visibleSpan: visibleColumnsInRange.length,
              rowSpan: Math.max(1, range.endRow - range.startRow + 1),
            });
        return;
      }

      if (index > 0) {
        mergeSlots.set(entry.column, { kind: 'covered', range });
      }
    });
  });

  function renderCell(
    cell: typeof displayCells[number],
    entry: HorizontalVirtualColumnEntry,
  ) {
    const originalColumn = entry.column;
    const visibleIndex = entry.position;
    const mergeSlot = mergeSlots.get(originalColumn);
    if (mergeSlot?.kind === 'covered') return null;

    const mergedWidth = mergeSlot
      ? mergeSlot.visibleSpan * WORKBOOK_CELL_WIDTH
      : WORKBOOK_CELL_WIDTH;
    const mergedHeight = mergeSlot?.kind === 'start'
      ? mergeSlot.rowSpan * rowHeight
      : rowHeight;

    const sticky = visibleIndex < freezeColumnCount;
    const stickyBoundary = sticky && visibleIndex === freezeColumnCount - 1;
    const stickyCellLeft = stickyLeft + LN_W + 3 + roleBadgeWidth + (visibleIndex * WORKBOOK_CELL_WIDTH);

    if (mergeSlot?.kind === 'placeholder') {
      return (
        <div
          key={`placeholder-${rowNumber}-${originalColumn}`}
          style={{
            width: mergedWidth,
            minWidth: mergedWidth,
            maxWidth: mergedWidth,
            height: rowHeight,
            visibility: 'hidden',
            pointerEvents: 'none',
            flexShrink: 0,
          }}
        />
      );
    }
    return (
      <WorkbookGridCell
        key={`${rowNumber}-${originalColumn}`}
        cell={cell}
        rowNumber={rowNumber}
        originalColumn={originalColumn}
        tone={changedColumnSet.has(originalColumn) ? tone : 'neutral'}
        active={active}
        sheetName={sheetName}
        side={side}
        versionLabel={versionLabel}
        headerRowNumber={headerRowNumber}
        rowSelectionColumn={rowSelectionColumn}
        selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          width={mergedWidth}
          height={mergedHeight}
        fontSize={fontSize}
          masked={maskedColumnSet.has(originalColumn)}
          rowHighlightBg={rowHighlightBg}
          sticky={sticky}
          stickyLeft={sticky ? stickyCellLeft : 0}
          stickyBoundary={stickyBoundary}
          zIndex={mergeSlot?.kind === 'start' ? 7 : 1}
          compareCell={compareCells?.get(originalColumn)}
        />
    );
  }

  return (
    <div
      style={{
        minWidth: LN_W + 3 + roleBadgeWidth + getWorkbookVisualWidth(parsed, columnCount || allVisibleColumns.length),
        height: '100%',
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'visible',
        contain: 'layout paint style',
      }}>
      <div
        style={{
          width: LN_W + 3,
          minWidth: LN_W + 3,
          maxWidth: LN_W + 3,
          display: 'flex',
          alignItems: 'stretch',
          position: freezeColumnCount > 0 ? 'sticky' : 'relative',
          left: freezeColumnCount > 0 ? stickyLeft : undefined,
          zIndex: 7,
        }}>
        <div
          style={{
            width: 3,
            minWidth: 3,
            background: toneColors.border,
            flexShrink: 0,
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!onSelectCell) return;
            onSelectCell({
              kind: 'row',
              sheetName,
              side,
              versionLabel,
              rowNumber,
              colIndex: selectedCell?.colIndex ?? 0,
              colLabel: selectedCell?.colLabel ?? 'A',
              address: `${rowNumber}`,
              value: '',
              formula: '',
            });
          }}
          style={{
            width: LN_W,
            minWidth: LN_W,
            color: active ? T.acc2 : T.lnTx,
            ...(isSelectedRow ? { color: selectionAccent } : {}),
            textAlign: 'right',
            paddingRight: 8,
            userSelect: 'none',
            fontSize: sizes.line,
            fontWeight: isSelectedRow ? 700 : 500,
            lineHeight: `${rowHeight}px`,
            flexShrink: 0,
            background: isSelectedRow
              ? `linear-gradient(180deg, ${selectionAccent}24 0%, ${selectionAccent}12 100%)`
              : rowHighlightBg ?? T.lnBg,
            fontFamily: FONT_CODE,
            borderTop: `1px solid ${toneColors.border}`,
            boxSizing: 'border-box',
            cursor: onSelectCell ? 'pointer' : 'default',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            appearance: 'none',
            outline: 'none',
            boxShadow: isSelectedRow ? `inset 0 0 0 1px ${selectionAccent}4d` : undefined,
          }}>
          {lineNumber ?? ''}
        </button>
      </div>
      {roleLabel && (
        <div
          style={{
            width: roleBadgeWidth,
            minWidth: roleBadgeWidth,
            maxWidth: roleBadgeWidth,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: freezeColumnCount > 0 ? 'sticky' : 'relative',
            left: freezeColumnCount > 0 ? stickyLeft + LN_W + 3 : undefined,
            zIndex: 8,
            background: isSelectedRow ? `${selectionAccent}14` : T.bg1,
            borderTop: `1px solid ${toneColors.border}`,
            boxSizing: 'border-box',
          }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: roleAccent,
            }}
          />
          <span
            aria-label={roleLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              borderRadius: 999,
              background: `${roleAccent}20`,
              border: `1px solid ${roleAccent}55`,
              lineHeight: 1,
            }}>
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                background: roleAccent,
                boxShadow: `0 0 0 1px ${roleAccent}22`,
                ...roleGlyphStyle,
              }}
            />
          </span>
        </div>
      )}
      {leadingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: leadingSpacerWidth, minWidth: leadingSpacerWidth, maxWidth: leadingSpacerWidth, flexShrink: 0 }}
        />
      )}
      {displayColumnEntries.map((entry, index) => renderCell(
        displayCells[index] ?? { value: '', formula: '' },
        entry,
      ))}
      {trailingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: trailingSpacerWidth, minWidth: trailingSpacerWidth, maxWidth: trailingSpacerWidth, flexShrink: 0 }}
        />
      )}
    </div>
  );
});

export default WorkbookLine;
