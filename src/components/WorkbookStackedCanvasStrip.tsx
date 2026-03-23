import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { WORKBOOK_CELL_WIDTH } from '../utils/workbookDisplay';
import { buildWorkbookCompareCells } from '../utils/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell, type WorkbookRowEntry } from '../utils/workbookNavigation';
import { useTheme } from '../context/theme';
import type { SplitRow, WorkbookSelectedCell } from '../types';
import { ROW_H } from '../hooks/useVirtual';
import type { WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';

type CanvasRenderMode = 'single-base' | 'single-mine' | 'single-equal' | 'double';

export interface WorkbookCanvasRenderRow {
  row: SplitRow;
  renderMode: CanvasRenderMode;
  height: number;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
}

interface WorkbookStackedCanvasStripProps {
  rows: WorkbookCanvasRenderRow[];
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

interface CanvasBand {
  entry: WorkbookRowEntry | null;
  side: 'base' | 'mine';
  tone: 'neutral' | 'add' | 'delete';
  compareCells: ReturnType<typeof buildWorkbookCompareCells>;
  y: number;
  height: number;
  rowHighlightBg?: string | undefined;
}

function trimCellText(value: string) {
  return value.replace(/\u001F/g, ' ').replace(/\r\n/g, ' / ').replace(/\r/g, ' / ').replace(/\n/g, ' / ');
}

const WorkbookStackedCanvasStrip = memo(({
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
}: WorkbookStackedCanvasStripProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hoverKeyRef = useRef('');
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const totalHeight = useMemo(() => rows.reduce((sum, row) => sum + row.height, 0), [rows]);

  const renderBands = useMemo(() => {
    const bands: CanvasBand[] = [];
    let cursorY = 0;

    rows.forEach((renderRow) => {
      const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
      const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
      const compareCells = buildWorkbookCompareCells(
        renderRow.row.left,
        renderRow.row.right,
        renderColumns.map(entry => entry.column),
      );
      const rowHighlightBg = renderRow.isActiveSearch
        ? T.searchActiveBg
        : renderRow.isSearchMatch
        ? `${T.searchHl}28`
        : undefined;

      if (renderRow.renderMode === 'single-base') {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: 'delete',
          compareCells,
          y: cursorY,
          height: ROW_H,
          rowHighlightBg,
        });
      } else if (renderRow.renderMode === 'single-mine') {
        bands.push({
          entry: mineEntry,
          side: 'mine',
          tone: 'add',
          compareCells,
          y: cursorY,
          height: ROW_H,
          rowHighlightBg,
        });
      } else if (renderRow.renderMode === 'single-equal') {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: 'neutral',
          compareCells,
          y: cursorY,
          height: ROW_H,
          rowHighlightBg,
        });
      } else {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: renderRow.row.left?.type === 'delete' ? 'delete' : 'neutral',
          compareCells,
          y: cursorY,
          height: ROW_H,
          rowHighlightBg,
        });
        bands.push({
          entry: mineEntry,
          side: 'mine',
          tone: renderRow.row.right?.type === 'add' ? 'add' : 'neutral',
          compareCells,
          y: cursorY + ROW_H + 1,
          height: ROW_H,
          rowHighlightBg,
        });
      }

      cursorY += renderRow.height;
    });

    return bands;
  }, [baseVersion, fontSize, mineVersion, renderColumns, rows, sheetName, T.searchActiveBg, T.searchHl, visibleColumns]);

  const positionToColumn = useMemo(() => new Map(renderColumns.map(entry => [entry.position, entry.column])), [renderColumns]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.ceil(viewportWidth));
      const height = Math.max(1, Math.ceil(totalHeight));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      canvas.width = Math.max(1, Math.ceil(width * dpr));
      canvas.height = Math.max(1, Math.ceil(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = T.bg0;
      ctx.fillRect(0, 0, width, height);

      const frozenWidth = freezeColumnCount * WORKBOOK_CELL_WIDTH;
      const contentLeft = LN_W + 3;

      renderBands.forEach((band) => {
      const entry = band.entry;
      const y = band.y;
      const h = band.height;
      const rowNumber = entry?.rowNumber ?? 0;
      const rowBg = band.rowHighlightBg ?? T.bg0;
      const bandBorder = band.tone === 'add' ? T.addBrd : band.tone === 'delete' ? T.delBrd : T.border2;
      const cellTextColor = band.side === 'mine' ? T.t0 : T.t1;

      ctx.fillStyle = rowBg;
      ctx.fillRect(0, y, width, h);

      ctx.fillStyle = T.lnBg;
      ctx.fillRect(3, y, LN_W, h);
      ctx.fillStyle = bandBorder;
      ctx.fillRect(0, y, 3, h);
      ctx.strokeStyle = bandBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = T.lnTx;
      ctx.font = `${sizes.line}px ${FONT_CODE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(rowNumber || ''), LN_W - 8, y + (h / 2));

      const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);
      const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);

      const drawCell = (entryMeta: HorizontalVirtualColumnEntry, drawX: number) => {
        if (!entry) return;
        const column = entryMeta.column;
        const cell = entry.cells[column] ?? { value: '', formula: '' };
        const compareCell = band.compareCells.get(column);
        const changed = compareCell?.changed ?? band.tone !== 'neutral';
        const masked = compareCell?.masked ?? false;
        const isSelected = Boolean(
          selectedCell
          && selectedCell.kind === 'cell'
          && selectedCell.sheetName === sheetName
          && selectedCell.side === band.side
          && selectedCell.rowNumber === rowNumber
          && selectedCell.colIndex === column
        );
        const isMirrored = Boolean(
          selectedCell
          && selectedCell.kind === 'cell'
          && selectedCell.sheetName === sheetName
          && selectedCell.side !== band.side
          && selectedCell.rowNumber === rowNumber
          && selectedCell.colIndex === column
        );
        const cellBg = changed
          ? (band.tone === 'add' ? T.addBg : band.tone === 'delete' ? T.delBg : T.bg1)
          : (cell.value.trim() ? T.bg1 : T.bg0);

        ctx.fillStyle = cellBg;
        ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, h);
        if (masked && !isSelected && (cell.value.trim() || cell.formula.trim())) {
          ctx.fillStyle = `${T.bg1}22`;
          ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, h);
        }
        if (isSelected || isMirrored) {
          ctx.fillStyle = isSelected ? `${selectedCell?.side === 'base' ? T.acc2 : T.acc}20` : `${selectedCell?.side === 'base' ? T.acc2 : T.acc}12`;
          ctx.fillRect(drawX, y, WORKBOOK_CELL_WIDTH, h);
        }
        ctx.strokeStyle = bandBorder;
        ctx.strokeRect(drawX + 0.5, y + 0.5, WORKBOOK_CELL_WIDTH - 1, h - 1);

        if (isSelected) {
          ctx.strokeStyle = selectedCell?.side === 'base' ? T.acc2 : T.acc;
          ctx.lineWidth = 2;
          ctx.strokeRect(drawX + 1, y + 1, WORKBOOK_CELL_WIDTH - 2, h - 2);
          ctx.lineWidth = 1;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(drawX + 8, y + 1, WORKBOOK_CELL_WIDTH - 16, h - 2);
        ctx.clip();
        ctx.fillStyle = cellTextColor;
        ctx.font = `${sizes.ui}px ${FONT_UI}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(trimCellText(cell.value || '\u00A0'), drawX + 8, y + (h / 2));
        ctx.restore();
      };

      floatingEntries.forEach((columnEntry) => {
        const x = contentLeft + frozenWidth + ((columnEntry.position - freezeColumnCount) * WORKBOOK_CELL_WIDTH) - currentScrollLeft;
        if (x + WORKBOOK_CELL_WIDTH < contentLeft + frozenWidth || x > width) return;
        drawCell(columnEntry, x);
      });

      frozenEntries.forEach((columnEntry) => {
        const x = contentLeft + (columnEntry.position * WORKBOOK_CELL_WIDTH);
        drawCell(columnEntry, x);
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
  }, [freezeColumnCount, renderBands, renderColumns, scrollRef, selectedCell, sheetName, sizes.line, sizes.ui, T, totalHeight, viewportWidth]);

  const resolveHit = (
    x: number,
    y: number,
    canvasRect: DOMRect,
  ): { selection: WorkbookSelectedCell; hover: WorkbookCanvasHoverCell | null } | null => {
    const frozenWidth = freezeColumnCount * WORKBOOK_CELL_WIDTH;
    const contentLeft = LN_W + 3;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    let cursorY = 0;

    for (const renderRow of rows) {
      const rowTop = cursorY;
      const rowBottom = cursorY + renderRow.height;
      cursorY = rowBottom;
      if (y < rowTop || y > rowBottom) continue;

      const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
      const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
      const localY = y - rowTop;
      let side: 'base' | 'mine';
      let entry: WorkbookRowEntry | null;

      switch (renderRow.renderMode) {
        case 'single-base':
        case 'single-equal':
          side = 'base';
          entry = baseEntry;
          break;
        case 'single-mine':
          side = 'mine';
          entry = mineEntry;
          break;
        default:
          side = localY < ROW_H ? 'base' : 'mine';
          entry = side === 'base' ? baseEntry : mineEntry;
          break;
      }

      if (!entry) return null;

      if (x < contentLeft) {
        return {
          selection: {
            kind: 'row',
            sheetName,
            side,
            versionLabel: entry.versionLabel,
            rowNumber: entry.rowNumber,
            colIndex: selectedCell?.colIndex ?? 0,
            colLabel: selectedCell?.colLabel ?? 'A',
            address: `${entry.rowNumber}`,
            value: '',
            formula: '',
          },
          hover: null,
        };
      }

      const xInContent = x - contentLeft;
      let columnPosition: number;
      if (xInContent < frozenWidth) {
        columnPosition = Math.floor(xInContent / WORKBOOK_CELL_WIDTH);
      } else {
        columnPosition = freezeColumnCount + Math.floor((xInContent - frozenWidth + currentScrollLeft) / WORKBOOK_CELL_WIDTH);
      }
      const column = positionToColumn.get(columnPosition);
      if (column == null) return null;
      const compareCell = buildWorkbookCompareCells(renderRow.row.left, renderRow.row.right, [column]).get(column);
      const columnX = columnPosition < freezeColumnCount
        ? contentLeft + (columnPosition * WORKBOOK_CELL_WIDTH)
        : contentLeft + frozenWidth + ((columnPosition - freezeColumnCount) * WORKBOOK_CELL_WIDTH) - currentScrollLeft;
      const bandY = rowTop + (renderRow.renderMode === 'double' && side === 'mine' ? ROW_H + 1 : 0);
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
              left: canvasRect.left + columnX,
              top: canvasRect.top + bandY,
              width: WORKBOOK_CELL_WIDTH,
              height: ROW_H,
              right: canvasRect.left + columnX + WORKBOOK_CELL_WIDTH,
              bottom: canvasRect.top + bandY + ROW_H,
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
              left: canvasRect.left + columnX,
              top: canvasRect.top + bandY,
              width: WORKBOOK_CELL_WIDTH,
              height: ROW_H,
              right: canvasRect.left + columnX + WORKBOOK_CELL_WIDTH,
              bottom: canvasRect.top + bandY + ROW_H,
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
            left: canvasRect.left + columnX,
            top: canvasRect.top + bandY,
            width: WORKBOOK_CELL_WIDTH,
            height: ROW_H,
            right: canvasRect.left + columnX + WORKBOOK_CELL_WIDTH,
            bottom: canvasRect.top + bandY + ROW_H,
          },
          compareCell,
        } : null,
      };
    }
    return null;
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      canvasRect,
    );
    if (!hit) return;
    onSelectCell(hit.selection);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onHoverChange) return;
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      canvasRect,
    );
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

export default WorkbookStackedCanvasStrip;
