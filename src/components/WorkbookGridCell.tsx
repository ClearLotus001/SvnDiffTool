import { memo, useEffect, useMemo, useState } from 'react';
import { FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { useTheme } from '../context/theme';
import type { Theme, WorkbookSelectedCell } from '../types';
import type { WorkbookCellDisplay } from '../utils/workbookDisplay';
import type { WorkbookCompareCellState } from '../utils/workbookCompare';
import { ROW_H } from '../hooks/useVirtual';

type WorkbookCellTone = 'neutral' | 'add' | 'delete';

function getToneColors(tone: WorkbookCellTone, T: Theme) {
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

interface WorkbookGridCellProps {
  cell: WorkbookCellDisplay;
  rowNumber: number;
  originalColumn: number;
  tone: WorkbookCellTone;
  active: boolean;
  sheetName: string;
  side: 'base' | 'mine';
  versionLabel: string;
  headerRowNumber?: number;
  rowSelectionColumn?: number;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
  width: number;
  height: number;
  fontSize: number;
  masked?: boolean;
  rowHighlightBg?: string | undefined;
  sticky?: boolean;
  stickyLeft?: number;
  stickyBoundary?: boolean;
  zIndex?: number;
  compareCell?: WorkbookCompareCellState | undefined;
}

function getSelectionVisualState(
  selectedCell: WorkbookSelectedCell | null | undefined,
  sheetName: string,
  side: 'base' | 'mine',
  rowNumber: number,
  column: number,
) {
  const selectionKind = selectedCell?.kind ?? 'cell';

  return {
    accent: selectedCell?.side === 'base' ? 'base' : 'mine',
    isSelected: Boolean(
      selectedCell
      && selectionKind === 'cell'
      && selectedCell.sheetName === sheetName
      && selectedCell.side === side
      && selectedCell.rowNumber === rowNumber
      && selectedCell.colIndex === column,
    ),
    isMirroredSelection: Boolean(
      selectedCell
      && selectionKind === 'cell'
      && selectedCell.sheetName === sheetName
      && selectedCell.side !== side
      && selectedCell.rowNumber === rowNumber
      && selectedCell.colIndex === column,
    ),
    isSelectedRow: Boolean(
      selectedCell
      && selectionKind === 'row'
      && selectedCell.sheetName === sheetName
      && selectedCell.rowNumber === rowNumber,
    ),
    isSelectedColumn: Boolean(
      selectedCell
      && selectionKind === 'column'
      && selectedCell.sheetName === sheetName
      && selectedCell.colIndex === column,
    ),
  };
}

const WorkbookGridCell = memo(({
  cell,
  rowNumber,
  originalColumn,
  tone,
  active,
  sheetName,
  side,
  versionLabel,
  headerRowNumber = 0,
  rowSelectionColumn = 0,
  selectedCell = null,
  onSelectCell,
  width,
  height,
  fontSize,
  masked = false,
  rowHighlightBg,
  sticky = false,
  stickyLeft = 0,
  stickyBoundary = false,
  zIndex = 1,
  compareCell,
}: WorkbookGridCellProps) => {
  const T = useTheme();
  const toneColors = useMemo(() => getToneColors(tone, T), [T, tone]);
  const [revealed, setRevealed] = useState(false);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);

  const colLabel = useMemo(() => {
    let value = originalColumn + 1;
    let label = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }

    return label;
  }, [originalColumn]);
  const {
    isSelected,
    isMirroredSelection,
    isSelectedRow,
    isSelectedColumn,
  } = getSelectionVisualState(selectedCell, sheetName, side, rowNumber, originalColumn);
  const hasValue = Boolean(cell.value || cell.formula);
  const selectionAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
  const shouldDeemphasize = masked && !isSelected && Boolean(cell.value.trim() || cell.formula.trim());
  const dimmed = shouldDeemphasize && !revealed;
  const compareState = compareCell ?? {
    column: originalColumn,
    baseCell: side === 'base' ? cell : { value: '', formula: '' },
    mineCell: side === 'mine' ? cell : { value: '', formula: '' },
    changed: tone !== 'neutral',
    masked,
  };

  useEffect(() => {
    setRevealed(false);
  }, [masked, cell.value, cell.formula, rowNumber, originalColumn]);

  const background = rowHighlightBg
    ?? (cell.value.trim() === '' ? T.bg0 : toneColors.bg);
  const selectionOverlay = isSelected
    ? `${selectionAccent}20`
    : isMirroredSelection
    ? `${selectionAccent}12`
    : isSelectedRow && isSelectedColumn
    ? `${selectionAccent}18`
    : isSelectedColumn
    ? `${selectionAccent}12`
    : isSelectedRow
    ? `${selectionAccent}10`
    : null;

  const anchorStyle = sticky
    ? {
        position: 'sticky' as const,
        left: stickyLeft,
        zIndex: isSelected ? 10 : Math.max(8, zIndex + 1),
        boxShadow: stickyBoundary ? `10px 0 14px -14px ${T.border2}` : undefined,
      }
    : undefined;

  const cellNode = (
    <button
      type="button"
      data-workbook-role="cell"
      data-workbook-side={side}
      data-workbook-row={rowNumber}
      data-workbook-col={originalColumn}
      onClick={() => {
        if (!onSelectCell) return;
        if (headerRowNumber > 0 && rowNumber === headerRowNumber) {
          onSelectCell({
            kind: 'column',
            sheetName,
            side,
            versionLabel,
            rowNumber,
            colIndex: originalColumn,
            colLabel,
            address: colLabel,
            value: cell.value,
            formula: cell.formula,
          });
          return;
        }
        if (originalColumn === rowSelectionColumn) {
          onSelectCell({
            kind: 'row',
            sheetName,
            side,
            versionLabel,
            rowNumber,
            colIndex: originalColumn,
            colLabel,
            address: `${rowNumber}`,
            value: '',
            formula: '',
          });
          return;
        }
        onSelectCell({
          kind: 'cell',
          sheetName,
          side,
          versionLabel,
          rowNumber,
          colIndex: originalColumn,
          colLabel,
          address: `${colLabel}${rowNumber}`,
          value: cell.value,
          formula: cell.formula,
        });
      }}
      onMouseEnter={() => {
        if (shouldDeemphasize) setRevealed(true);
      }}
      onMouseLeave={() => {
        if (shouldDeemphasize) setRevealed(false);
      }}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        height,
        borderRight: `1px solid ${toneColors.border}`,
        borderTop: `1px solid ${toneColors.border}`,
        borderBottom: height > ROW_H ? `1px solid ${toneColors.border}` : 'none',
        background,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: active ? T.t0 : T.t1,
        fontFamily: FONT_UI,
        fontSize: sizes.ui,
        boxSizing: 'border-box',
        cursor: 'pointer',
        outline: isSelected
          ? `2px solid ${selectionAccent}`
          : isMirroredSelection
          ? `1px dashed ${selectionAccent}`
          : 'none',
        outlineOffset: -2,
        appearance: 'none',
        textAlign: 'left',
        position: 'relative',
        zIndex: isSelected ? 9 : zIndex,
        boxShadow: isSelected
          ? `inset 0 0 0 1px ${T.bg1}, inset 0 0 0 2px ${selectionAccent}, 0 8px 18px -14px ${selectionAccent}85`
          : isSelectedRow || isSelectedColumn
          ? `inset 0 0 0 1px ${selectionAccent}26`
          : undefined,
        transition: 'background-color 120ms ease, box-shadow 120ms ease, outline-color 120ms ease',
      }}>
      {selectionOverlay && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: selectionOverlay,
            pointerEvents: 'none',
          }}
        />
      )}
      {(isSelectedRow || isSelectedColumn) && !isSelected && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderTop: isSelectedRow ? `1px solid ${selectionAccent}45` : 'none',
            borderBottom: isSelectedRow ? `1px solid ${selectionAccent}45` : 'none',
            borderLeft: isSelectedColumn ? `1px solid ${selectionAccent}55` : 'none',
            borderRight: isSelectedColumn ? `1px solid ${selectionAccent}55` : 'none',
            pointerEvents: 'none',
          }}
        />
      )}
      {dimmed && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, transparent, ${T.bg1}18)`,
            boxShadow: `inset 0 0 0 999px ${T.bg1}0f`,
            pointerEvents: 'none',
          }}
        />
      )}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          opacity: dimmed ? 0.58 : 1,
          transition: 'opacity 120ms ease',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
        {cell.value || '\u00A0'}
      </span>
    </button>
  );

  if (!hasValue && !compareState.changed) {
    return <div style={anchorStyle}>{cellNode}</div>;
  }

  return <div style={anchorStyle}>{cellNode}</div>;
}, (prevProps, nextProps) => {
  if (prevProps.rowNumber !== nextProps.rowNumber || prevProps.originalColumn !== nextProps.originalColumn) return false;
  if (prevProps.sheetName !== nextProps.sheetName || prevProps.side !== nextProps.side) return false;
  if (prevProps.tone !== nextProps.tone || prevProps.active !== nextProps.active) return false;
  if (prevProps.versionLabel !== nextProps.versionLabel) return false;
  if (prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) return false;
  if (prevProps.fontSize !== nextProps.fontSize || prevProps.masked !== nextProps.masked) return false;
  if (prevProps.rowHighlightBg !== nextProps.rowHighlightBg) return false;
  if (prevProps.sticky !== nextProps.sticky || prevProps.stickyLeft !== nextProps.stickyLeft) return false;
  if (prevProps.stickyBoundary !== nextProps.stickyBoundary || prevProps.zIndex !== nextProps.zIndex) return false;
  if (prevProps.onSelectCell !== nextProps.onSelectCell) return false;
  if (prevProps.cell.value !== nextProps.cell.value || prevProps.cell.formula !== nextProps.cell.formula) return false;

  const prevCompare = prevProps.compareCell;
  const nextCompare = nextProps.compareCell;
  if (prevCompare?.changed !== nextCompare?.changed || prevCompare?.masked !== nextCompare?.masked) return false;

  const prevSelection = getSelectionVisualState(
    prevProps.selectedCell,
    prevProps.sheetName,
    prevProps.side,
    prevProps.rowNumber,
    prevProps.originalColumn,
  );
  const nextSelection = getSelectionVisualState(
    nextProps.selectedCell,
    nextProps.sheetName,
    nextProps.side,
    nextProps.rowNumber,
    nextProps.originalColumn,
  );

  return (
    prevSelection.accent === nextSelection.accent
    && prevSelection.isSelected === nextSelection.isSelected
    && prevSelection.isMirroredSelection === nextSelection.isMirroredSelection
    && prevSelection.isSelectedRow === nextSelection.isSelectedRow
    && prevSelection.isSelectedColumn === nextSelection.isSelectedColumn
  );
});

export default WorkbookGridCell;
