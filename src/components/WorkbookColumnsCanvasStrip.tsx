import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import { buildWorkbookCompareCells } from '../utils/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell } from '../utils/workbookNavigation';
import { useTheme } from '../context/theme';
import type { SplitRow, WorkbookSelectedCell } from '../types';
import { ROW_H } from '../hooks/useVirtual';
import type { WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';

export interface WorkbookColumnsCanvasRow {
  row: SplitRow;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
}

interface WorkbookColumnsCanvasStripProps {
  rows: WorkbookColumnsCanvasRow[];
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  rowSelectionColumn: number;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onHoverChange?: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  renderColumns: HorizontalVirtualColumnEntry[];
}

function trimCellText(value: string) {
  return value.replace(/\u001F/g, ' ').replace(/\r\n/g, ' / ').replace(/\r/g, ' / ').replace(/\n/g, ' / ');
}

const WorkbookColumnsCanvasStrip = memo(({
  rows,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  sheetName,
  baseVersion,
  mineVersion,
  headerRowNumber,
  rowSelectionColumn,
  selectedCell,
  onSelectCell,
  onHoverChange,
  fontSize,
  visibleColumns,
  renderColumns,
}: WorkbookColumnsCanvasStripProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hoverKeyRef = useRef('');
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const height = rows.length * ROW_H;

  const renderRows = useMemo(() => rows.map((renderRow) => {
    const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
    const compareCells = buildWorkbookCompareCells(
      renderRow.row.left,
      renderRow.row.right,
      renderColumns.map(entry => entry.column),
    );
    return {
      baseEntry,
      mineEntry,
      compareCells,
      isSearchMatch: renderRow.isSearchMatch,
      isActiveSearch: renderRow.isActiveSearch,
      baseTone: renderRow.row.left?.type === 'delete' ? 'delete' : 'neutral',
      mineTone: renderRow.row.right?.type === 'add' ? 'add' : 'neutral',
    };
  }), [baseVersion, mineVersion, renderColumns, rows, sheetName, visibleColumns]);

  const positionToColumn = useMemo(
    () => new Map(renderColumns.map(entry => [entry.position, entry.column])),
    [renderColumns],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.ceil(viewportWidth));
      const canvasHeight = Math.max(1, Math.ceil(height));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      canvas.width = Math.max(1, Math.ceil(width * dpr));
      canvas.height = Math.max(1, Math.ceil(canvasHeight * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${canvasHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, canvasHeight);
      ctx.fillStyle = T.bg0;
      ctx.fillRect(0, 0, width, canvasHeight);

      const frozenPairWidth = freezeColumnCount * WORKBOOK_CELL_WIDTH * 2;
      const contentLeft = LN_W + 3;
      const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);
      const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);

      renderRows.forEach((renderRow, rowIndex) => {
        const y = rowIndex * ROW_H;
        const rowBg = renderRow.isActiveSearch
          ? T.searchActiveBg
          : renderRow.isSearchMatch
          ? `${T.searchHl}28`
          : T.bg0;
        const border = renderRow.baseEntry?.rowNumber || renderRow.mineEntry?.rowNumber
          ? T.border2
          : T.border;
        const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;

        ctx.fillStyle = rowBg;
        ctx.fillRect(0, y, width, ROW_H);
        ctx.fillStyle = T.lnBg;
        ctx.fillRect(3, y, LN_W, ROW_H);
        ctx.fillStyle = border;
        ctx.fillRect(0, y, 3, ROW_H);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();

        ctx.fillStyle = T.lnTx;
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowNumber ? String(rowNumber) : '', LN_W - 8, y + (ROW_H / 2));

        const drawCell = (
          side: 'base' | 'mine',
          columnEntry: HorizontalVirtualColumnEntry,
          drawX: number,
        ) => {
          const column = columnEntry.column;
          const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
          const cell = entry?.cells[column] ?? { value: '', formula: '' };
          const compareCell = renderRow.compareCells.get(column);
          const tone = side === 'base' ? renderRow.baseTone : renderRow.mineTone;
          const bandBg = tone === 'add' ? T.addBg : tone === 'delete' ? T.delBg : T.bg1;
          const changed = compareCell?.changed ?? tone !== 'neutral';
          const masked = compareCell?.masked ?? false;
          const isSelected = Boolean(
            selectedCell
            && selectedCell.kind === 'cell'
            && selectedCell.sheetName === sheetName
            && selectedCell.side === side
            && selectedCell.rowNumber === rowNumber
            && selectedCell.colIndex === column
          );
          const isMirrored = Boolean(
            selectedCell
            && selectedCell.kind === 'cell'
            && selectedCell.sheetName === sheetName
            && selectedCell.side !== side
            && selectedCell.rowNumber === rowNumber
            && selectedCell.colIndex === column
          );
          const cellBg = entry
            ? (changed ? bandBg : (cell.value.trim() ? T.bg1 : T.bg0))
            : T.bg2;

          ctx.fillStyle = cellBg;
          ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, ROW_H);
          if (masked && !isSelected && (cell.value.trim() || cell.formula.trim())) {
            ctx.fillStyle = `${T.bg1}22`;
            ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, ROW_H);
          }
          if (isSelected || isMirrored) {
            ctx.fillStyle = isSelected ? `${selectedCell?.side === 'base' ? T.acc2 : T.acc}20` : `${selectedCell?.side === 'base' ? T.acc2 : T.acc}12`;
            ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, ROW_H);
          }
          ctx.strokeStyle = tone === 'add' ? T.addBrd : tone === 'delete' ? T.delBrd : T.border2;
          ctx.strokeRect(drawX + 0.5, y + 0.5, WORKBOOK_CELL_WIDTH - 1, ROW_H - 1);

          if (isSelected) {
            ctx.strokeStyle = selectedCell?.side === 'base' ? T.acc2 : T.acc;
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX + 1, y + 1, WORKBOOK_CELL_WIDTH - 2, ROW_H - 2);
            ctx.lineWidth = 1;
          }

          ctx.save();
          ctx.beginPath();
          ctx.rect(drawX + 8, y + 1, WORKBOOK_CELL_WIDTH - 16, ROW_H - 2);
          ctx.clip();
          ctx.fillStyle = side === 'mine' ? T.t0 : T.t1;
          ctx.font = `${sizes.ui}px ${FONT_UI}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(trimCellText(cell.value || '\u00A0'), drawX + 8, y + (ROW_H / 2));
          ctx.restore();
        };

        const drawPair = (columnEntry: HorizontalVirtualColumnEntry, drawX: number) => {
          drawCell('base', columnEntry, drawX);
          drawCell('mine', columnEntry, drawX + WORKBOOK_CELL_WIDTH);
        };

        floatingEntries.forEach((columnEntry) => {
          const x = contentLeft + frozenPairWidth + ((columnEntry.position - freezeColumnCount) * WORKBOOK_CELL_WIDTH * 2) - currentScrollLeft;
          if (x + (WORKBOOK_CELL_WIDTH * 2) < contentLeft + frozenPairWidth || x > width) return;
          drawPair(columnEntry, x);
        });

        frozenEntries.forEach((columnEntry) => {
          const x = contentLeft + (columnEntry.position * WORKBOOK_CELL_WIDTH * 2);
          drawPair(columnEntry, x);
        });
      });

      ctx.restore();
    };

    const scheduleDraw = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', scheduleDraw, { passive: true });
    draw();

    return () => {
      scroller?.removeEventListener('scroll', scheduleDraw);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [freezeColumnCount, height, renderColumns, renderRows, scrollRef, selectedCell, sheetName, sizes.line, sizes.ui, T, viewportWidth]);

  const resolveHit = (
    x: number,
    y: number,
    canvasRect: DOMRect,
  ): { selection: WorkbookSelectedCell; hover: WorkbookCanvasHoverCell | null } | null => {
    const rowIndex = Math.floor(y / ROW_H);
    const renderRow = renderRows[rowIndex];
    if (!renderRow) return null;
    const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;

    if (x < LN_W + 3) {
      return {
        selection: {
          kind: 'row',
          sheetName,
          side: selectedCell?.side ?? 'base',
          versionLabel: selectedCell?.versionLabel ?? baseVersion,
          rowNumber,
          colIndex: selectedCell?.colIndex ?? 0,
          colLabel: selectedCell?.colLabel ?? 'A',
          address: `${rowNumber}`,
          value: '',
          formula: '',
        },
        hover: null,
      };
    }

    const frozenPairWidth = freezeColumnCount * WORKBOOK_CELL_WIDTH * 2;
    const contentLeft = LN_W + 3;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const xInContent = x - contentLeft;
    let columnPosition: number;
    let side: 'base' | 'mine';
    if (xInContent < frozenPairWidth) {
      columnPosition = Math.floor(xInContent / (WORKBOOK_CELL_WIDTH * 2));
      side = (xInContent % (WORKBOOK_CELL_WIDTH * 2)) < WORKBOOK_CELL_WIDTH ? 'base' : 'mine';
    } else {
      const relativeX = xInContent - frozenPairWidth + currentScrollLeft;
      columnPosition = freezeColumnCount + Math.floor(relativeX / (WORKBOOK_CELL_WIDTH * 2));
      side = (relativeX % (WORKBOOK_CELL_WIDTH * 2)) < WORKBOOK_CELL_WIDTH ? 'base' : 'mine';
    }

    const column = positionToColumn.get(columnPosition);
    if (column == null) return null;
    const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
    if (!entry) return null;
    const compareCell = renderRow.compareCells.get(column);
    const pairX = columnPosition < freezeColumnCount
      ? contentLeft + (columnPosition * WORKBOOK_CELL_WIDTH * 2)
      : contentLeft + frozenPairWidth + ((columnPosition - freezeColumnCount) * WORKBOOK_CELL_WIDTH * 2) - currentScrollLeft;
    const cellX = side === 'base' ? pairX : pairX + WORKBOOK_CELL_WIDTH;
    const selected = buildWorkbookSelectedCell(entry, column);

    if (headerRowNumber > 0 && entry.rowNumber === headerRowNumber) {
      return {
        selection: {
          kind: 'column',
          sheetName,
          side,
          versionLabel: entry.versionLabel,
          rowNumber: entry.rowNumber,
          colIndex: column,
          colLabel: selected.colLabel,
          address: selected.colLabel,
          value: selected.value,
          formula: selected.formula,
        },
        hover: compareCell ? {
          key: `${side}-${entry.rowNumber}-${column}`,
          anchorRect: {
            left: canvasRect.left + cellX,
            top: canvasRect.top + (rowIndex * ROW_H),
            width: WORKBOOK_CELL_WIDTH,
            height: ROW_H,
            right: canvasRect.left + cellX + WORKBOOK_CELL_WIDTH,
            bottom: canvasRect.top + ((rowIndex + 1) * ROW_H),
          },
          compareCell,
        } : null,
      };
    }

    if (column === rowSelectionColumn) {
      return {
        selection: {
          kind: 'row',
          sheetName,
          side,
          versionLabel: entry.versionLabel,
          rowNumber: entry.rowNumber,
          colIndex: column,
          colLabel: selected.colLabel,
          address: `${entry.rowNumber}`,
          value: '',
          formula: '',
        },
        hover: compareCell ? {
          key: `${side}-${entry.rowNumber}-${column}`,
          anchorRect: {
            left: canvasRect.left + cellX,
            top: canvasRect.top + (rowIndex * ROW_H),
            width: WORKBOOK_CELL_WIDTH,
            height: ROW_H,
            right: canvasRect.left + cellX + WORKBOOK_CELL_WIDTH,
            bottom: canvasRect.top + ((rowIndex + 1) * ROW_H),
          },
          compareCell,
        } : null,
      };
    }

    return {
      selection: selected,
      hover: compareCell ? {
        key: `${side}-${entry.rowNumber}-${column}`,
        anchorRect: {
          left: canvasRect.left + cellX,
          top: canvasRect.top + (rowIndex * ROW_H),
          width: WORKBOOK_CELL_WIDTH,
          height: ROW_H,
          right: canvasRect.left + cellX + WORKBOOK_CELL_WIDTH,
          bottom: canvasRect.top + ((rowIndex + 1) * ROW_H),
        },
        compareCell,
      } : null,
    };
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left, event.clientY - rect.top, rect);
    if (!hit) return;
    onSelectCell(hit.selection);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onHoverChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left, event.clientY - rect.top, rect);
    const nextKey = hit?.hover?.key ?? '';
    if (hoverKeyRef.current === nextKey) return;
    hoverKeyRef.current = nextKey;
    onHoverChange(hit?.hover ?? null);
  };

  const handleMouseLeave = () => {
    hoverKeyRef.current = '';
    onHoverChange?.(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'block',
        cursor: 'pointer',
      }}
    />
  );
});

export default WorkbookColumnsCanvasStrip;
