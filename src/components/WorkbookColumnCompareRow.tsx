import { memo, useMemo } from 'react';
import { FONT_CODE, getWorkbookFontScale } from '../constants/typography';
import { useTheme } from '../context/theme';
import { LN_W } from '../constants/layout';
import { ROW_H } from '../hooks/useVirtual';
import type { SplitRow, WorkbookSelectedCell } from '../types';
import { WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { buildWorkbookCompareCells, parseWorkbookRowLine } from '../utils/workbookCompare';
import { getWorkbookColumnLabel } from '../utils/workbookSections';
import WorkbookGridCell from './WorkbookGridCell';

interface WorkbookColumnCompareRowProps {
  row: SplitRow;
  visibleColumns: number[];
  renderColumns?: HorizontalVirtualColumnEntry[];
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  freezeColumnCount: number;
  active: boolean;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  rowHighlightBg?: string | undefined;
  maskEqualCells?: boolean;
  fontSize: number;
}

function getRowTone(row: SplitRow, side: 'base' | 'mine') {
  if (side === 'base') return row.left?.type === 'delete' ? 'delete' : 'neutral';
  return row.right?.type === 'add' ? 'add' : 'neutral';
}

const WorkbookColumnCompareRow = memo(({
  row,
  visibleColumns,
  renderColumns,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  freezeColumnCount,
  active,
  sheetName,
  baseVersion,
  mineVersion,
  selectedCell = null,
  onSelectCell,
  rowHighlightBg,
  maskEqualCells = true,
  fontSize,
}: WorkbookColumnCompareRowProps) => {
  const T = useTheme();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const baseRow = parseWorkbookRowLine(row.left);
  const mineRow = parseWorkbookRowLine(row.right);
  const baseRowNumber = baseRow?.rowNumber ?? mineRow?.rowNumber ?? 0;
  const mineRowNumber = mineRow?.rowNumber ?? baseRow?.rowNumber ?? 0;
  const displayRowLabel = baseRowNumber !== mineRowNumber
    ? `${baseRowNumber || '-'}|${mineRowNumber || '-'}`
    : String(baseRowNumber || mineRowNumber || '');
  const rowSelectionSide = selectedCell?.sheetName === sheetName
    ? selectedCell.side
    : baseRow
    ? 'base'
    : 'mine';
  const rowSelectionNumber = rowSelectionSide === 'base' ? baseRowNumber : mineRowNumber;
  const rowSelectionVersion = rowSelectionSide === 'base' ? baseVersion : mineVersion;
  const compareCells = useMemo(
    () => buildWorkbookCompareCells(row.left, row.right, renderColumns?.map(entry => entry.column) ?? visibleColumns),
    [renderColumns, row.left, row.right, visibleColumns],
  );
  const selectionKind = selectedCell?.kind ?? 'cell';
  const selectionAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
  const isSelectionSheet = Boolean(selectedCell && selectedCell.sheetName === sheetName);
  const isSelectedRow = Boolean(
    isSelectionSheet
    && selectionKind !== 'column'
    && selectedCell?.rowNumber === rowSelectionNumber,
  );
  const baseTone = getRowTone(row, 'base');
  const mineTone = getRowTone(row, 'mine');
  const minWidth = (LN_W + 3) + (visibleColumns.length * WORKBOOK_CELL_WIDTH * 2);
  const renderColumnEntries = useMemo(
    () => renderColumns ?? visibleColumns.map((column, position) => ({ column, position })),
    [renderColumns, visibleColumns],
  );

  return (
    <div
      style={{
        minWidth,
        height: ROW_H,
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
          position: 'sticky',
          left: 0,
          zIndex: 12,
        }}>
        <div
          style={{
            width: 3,
            minWidth: 3,
            background: row.left?.type === 'delete' ? T.delBrd : row.right?.type === 'add' ? T.addBrd : T.border2,
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
              side: rowSelectionSide,
              versionLabel: rowSelectionVersion,
              rowNumber: rowSelectionNumber,
              colIndex: selectedCell?.colIndex ?? 0,
              colLabel: selectedCell?.colLabel ?? 'A',
              address: `${rowSelectionNumber}`,
              value: '',
              formula: '',
            });
          }}
          style={{
            width: LN_W,
            minWidth: LN_W,
            color: active ? T.acc2 : T.lnTx,
            textAlign: 'right',
            paddingRight: 10,
            userSelect: 'none',
            fontSize: baseRowNumber !== mineRowNumber ? sizes.meta : sizes.line,
            fontWeight: isSelectedRow ? 700 : 500,
            lineHeight: `${ROW_H}px`,
            flexShrink: 0,
            background: isSelectedRow
              ? `linear-gradient(180deg, ${selectionAccent}24 0%, ${selectionAccent}12 100%)`
              : rowHighlightBg ?? T.lnBg,
            fontFamily: FONT_CODE,
            borderTop: `1px solid ${T.border2}`,
            boxSizing: 'border-box',
            cursor: onSelectCell ? 'pointer' : 'default',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            appearance: 'none',
            outline: 'none',
            boxShadow: isSelectedRow ? `inset 0 0 0 1px ${selectionAccent}4d` : undefined,
          }}>
          {displayRowLabel}
        </button>
      </div>

      {leadingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: leadingSpacerWidth, minWidth: leadingSpacerWidth, maxWidth: leadingSpacerWidth, flexShrink: 0 }}
        />
      )}
      {renderColumnEntries.map((entry) => {
        const originalColumn = entry.column;
        const index = entry.position;
        const baseCell = baseRow?.cells[originalColumn] ?? { value: '', formula: '' };
        const mineCell = mineRow?.cells[originalColumn] ?? { value: '', formula: '' };
        const compareCell = compareCells.get(originalColumn);
        const baseSticky = index < freezeColumnCount;
        const mineSticky = index < freezeColumnCount;
        const stickyBoundary = index === freezeColumnCount - 1;
        const baseStickyLeft = LN_W + 3 + (index * WORKBOOK_CELL_WIDTH * 2);
        const mineStickyLeft = LN_W + 3 + (index * WORKBOOK_CELL_WIDTH * 2) + WORKBOOK_CELL_WIDTH;

        return (
          <div
            key={`pair-${displayRowLabel}-${originalColumn}`}
            style={{ display: 'flex', minWidth: WORKBOOK_CELL_WIDTH * 2, flexShrink: 0 }}>
            <WorkbookGridCell
              cell={baseCell}
              rowNumber={baseRowNumber}
              originalColumn={originalColumn}
              tone={compareCell?.changed ? baseTone : 'neutral'}
              active={active}
              sheetName={sheetName}
              side="base"
              versionLabel={baseVersion}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              width={WORKBOOK_CELL_WIDTH}
              height={ROW_H}
              fontSize={fontSize}
              masked={maskEqualCells ? (compareCell?.masked ?? false) : false}
              rowHighlightBg={rowHighlightBg}
              sticky={baseSticky}
              stickyLeft={baseStickyLeft}
              stickyBoundary={stickyBoundary}
              zIndex={baseSticky ? 10 : 7}
              compareCell={compareCell}
            />
            <WorkbookGridCell
              cell={mineCell}
              rowNumber={mineRowNumber}
              originalColumn={originalColumn}
              tone={compareCell?.changed ? mineTone : 'neutral'}
              active={active}
              sheetName={sheetName}
              side="mine"
              versionLabel={mineVersion}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              width={WORKBOOK_CELL_WIDTH}
              height={ROW_H}
              fontSize={fontSize}
              masked={maskEqualCells ? (compareCell?.masked ?? false) : false}
              rowHighlightBg={rowHighlightBg}
              sticky={mineSticky}
              stickyLeft={mineStickyLeft}
              stickyBoundary={stickyBoundary}
              zIndex={mineSticky ? 10 : 7}
              compareCell={compareCell}
            />
          </div>
        );
      })}
      {trailingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: trailingSpacerWidth, minWidth: trailingSpacerWidth, maxWidth: trailingSpacerWidth, flexShrink: 0 }}
        />
      )}
    </div>
  );
});

export function WorkbookColumnCompareHeader({
  visibleColumns,
  renderColumns,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  fontSize,
  selectedCell,
  sheetName,
  freezeColumnCount,
  onSelectColumn,
}: {
  visibleColumns: number[];
  renderColumns?: HorizontalVirtualColumnEntry[];
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  fontSize: number;
  selectedCell?: WorkbookSelectedCell | null;
  sheetName: string;
  freezeColumnCount: number;
  onSelectColumn?: ((column: number, side: 'base' | 'mine') => void) | undefined;
}) {
  const T = useTheme();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const minWidth = (LN_W + 3) + (visibleColumns.length * WORKBOOK_CELL_WIDTH * 2);
  const selectionAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
  const selectionKind = selectedCell?.kind ?? 'cell';
  const renderColumnEntries = useMemo(
    () => renderColumns ?? visibleColumns.map((column, position) => ({ column, position })),
    [renderColumns, visibleColumns],
  );

  return (
    <div
      style={{
        display: 'flex',
        height: ROW_H,
        minWidth,
        background: T.bg1,
      }}>
      <div
        style={{
          width: LN_W + 3,
          minWidth: LN_W + 3,
          borderBottom: `1px solid ${T.border}`,
          background: T.bg2,
          position: 'sticky',
          left: 0,
          zIndex: 13,
        }}
      />
      {leadingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: leadingSpacerWidth, minWidth: leadingSpacerWidth, maxWidth: leadingSpacerWidth, flexShrink: 0 }}
        />
      )}
      {renderColumnEntries.map((entry) => {
        const column = entry.column;
        const index = entry.position;
        const label = getWorkbookColumnLabel(column);
        const baseSticky = index < freezeColumnCount;
        const mineSticky = index < freezeColumnCount;
        const stickyBoundary = index === freezeColumnCount - 1;
        const baseStickyLeft = LN_W + 3 + (index * WORKBOOK_CELL_WIDTH * 2);
        const mineStickyLeft = LN_W + 3 + (index * WORKBOOK_CELL_WIDTH * 2) + WORKBOOK_CELL_WIDTH;
        const isSelectedColumn = Boolean(
          selectedCell
          && selectionKind !== 'row'
          && selectedCell.sheetName === sheetName
          && selectedCell.colIndex === column,
        );
        const isBaseFocused = isSelectedColumn && selectedCell?.side === 'base';
        const isMineFocused = isSelectedColumn && selectedCell?.side === 'mine';

        const commonStyle = {
          width: WORKBOOK_CELL_WIDTH,
          minWidth: WORKBOOK_CELL_WIDTH,
          maxWidth: WORKBOOK_CELL_WIDTH,
          borderLeft: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.bg1,
          fontSize: sizes.header,
          fontWeight: 700,
          lineHeight: 1,
          fontFamily: FONT_CODE,
          boxSizing: 'border-box',
          overflow: 'hidden',
        } as const;

        return (
          <div key={`header-pair-${column}`} style={{ display: 'flex', minWidth: WORKBOOK_CELL_WIDTH * 2, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onSelectColumn?.(column, 'base')}
              data-workbook-role="column-header"
              data-workbook-side="base"
              data-workbook-col={column}
              style={{
                ...commonStyle,
                color: T.t0,
                background: isBaseFocused
                  ? `linear-gradient(180deg, ${selectionAccent}28 0%, ${T.acc2}16 100%)`
                  : isSelectedColumn
                  ? `linear-gradient(180deg, ${selectionAccent}12 0%, ${T.acc2}0d 100%)`
                  : `linear-gradient(180deg, ${T.bg1} 0%, ${T.acc2}10 100%)`,
                position: baseSticky ? 'sticky' : 'relative',
                left: baseSticky ? baseStickyLeft : undefined,
                zIndex: baseSticky ? 12 : 2,
                boxShadow: isBaseFocused
                  ? `inset 0 0 0 1px ${selectionAccent}55${baseSticky && stickyBoundary ? `, 10px 0 14px -14px ${T.border2}` : ''}`
                  : baseSticky && stickyBoundary
                  ? `10px 0 14px -14px ${T.border2}`
                  : undefined,
                cursor: onSelectColumn ? 'pointer' : 'default',
                appearance: 'none',
                outline: 'none',
                borderRight: 'none',
                borderTop: 'none',
              }}>
               <span
                 aria-hidden="true"
                 style={{
                   position: 'absolute',
                   left: 0,
                   top: 0,
                   bottom: 0,
                   width: 3,
                   background: T.acc2,
                   pointerEvents: 'none',
                 }}
                />
                <span style={{ color: isBaseFocused ? T.t0 : T.t1, fontWeight: 700 }}>{label}</span>
               </button>
               <button
                 type="button"
                 onClick={() => onSelectColumn?.(column, 'mine')}
                 data-workbook-role="column-header"
                 data-workbook-side="mine"
                 data-workbook-col={column}
                 style={{
                   ...commonStyle,
                 color: T.t0,
                  background: isMineFocused
                    ? `linear-gradient(180deg, ${selectionAccent}28 0%, ${T.acc}16 100%)`
                    : isSelectedColumn
                    ? `linear-gradient(180deg, ${selectionAccent}12 0%, ${T.acc}0d 100%)`
                    : `linear-gradient(180deg, ${T.bg1} 0%, ${T.acc}10 100%)`,
                  position: mineSticky ? 'sticky' : 'relative',
                  left: mineSticky ? mineStickyLeft : undefined,
                  zIndex: mineSticky ? 12 : 2,
                  boxShadow: isMineFocused
                    ? `inset 0 0 0 1px ${selectionAccent}55${mineSticky && stickyBoundary ? `, 10px 0 14px -14px ${T.border2}` : ''}`
                    : mineSticky && stickyBoundary
                    ? `10px 0 14px -14px ${T.border2}`
                    : undefined,
                  cursor: onSelectColumn ? 'pointer' : 'default',
                  appearance: 'none',
                  outline: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                }}>
               <span
                 aria-hidden="true"
                 style={{
                   position: 'absolute',
                   left: 0,
                   top: 0,
                   bottom: 0,
                   width: 3,
                   background: T.acc,
                   pointerEvents: 'none',
                 }}
                />
                <span style={{ color: isMineFocused ? T.t0 : T.t1, fontWeight: 700 }}>{label}</span>
               </button>
          </div>
        );
      })}
      {trailingSpacerWidth > 0 && (
        <div
          aria-hidden="true"
          style={{ width: trailingSpacerWidth, minWidth: trailingSpacerWidth, maxWidth: trailingSpacerWidth, flexShrink: 0 }}
        />
      )}
    </div>
  );
}

export default WorkbookColumnCompareRow;
