import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { hasWorkbookCellContent } from '../utils/workbookCellContract';
import { buildWorkbookSplitRowCompareState } from '../utils/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell, type WorkbookRowEntry } from '../utils/workbookNavigation';
import { resolveWorkbookCanvasSelectionKind } from '../utils/workbookCanvasSelection';
import { resolveWorkbookCompareCellVisual } from '../utils/workbookCompareVisuals';
import {
  drawWorkbookCanvasSelectionFrame,
  getWorkbookSelectionOverlay,
  getWorkbookSelectionVisualState,
} from '../utils/workbookSelectionVisual';
import {
  findWorkbookMergeRange,
  getWorkbookCanvasSpanRect,
  getWorkbookColumnSpanBounds,
  getWorkbookMergeDrawInfo,
  getWorkbookMergedCompareCell,
} from '../utils/workbookMergeLayout';
import { useTheme } from '../context/theme';
import type { SplitRow, WorkbookCompareMode, WorkbookSelectedCell } from '../types';
import { ROW_H } from '../hooks/useVirtual';
import type { WorkbookMergeRange } from '../utils/workbookMeta';
import type { WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';

export interface WorkbookColumnsCanvasRow {
  row: SplitRow;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  isGuided: boolean;
  isGuidedStart: boolean;
  isGuidedEnd: boolean;
}

interface WorkbookColumnsCanvasStripProps {
  rows: WorkbookColumnsCanvasRow[];
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  selectedCell: WorkbookSelectedCell | null;
  onSelectCell: (cell: WorkbookSelectedCell | null) => void;
  onHoverChange?: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  baseMergedRanges: WorkbookMergeRange[];
  mineMergedRanges: WorkbookMergeRange[];
  baseRowEntryByRowNumber: Map<number, WorkbookRowEntry>;
  mineRowEntryByRowNumber: Map<number, WorkbookRowEntry>;
  compareMode: WorkbookCompareMode;
}

function trimCellText(value: string) {
  return value.replace(/\u001F/g, ' ').replace(/\r\n/g, ' / ').replace(/\r/g, ' / ').replace(/\n/g, ' / ');
}

const WorkbookColumnsCanvasStrip = memo(({
  rows,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  baseVersion,
  mineVersion,
  headerRowNumber,
  selectedCell,
  onSelectCell,
  onHoverChange,
  fontSize,
  visibleColumns,
  renderColumns,
  columnLayoutByColumn,
  baseMergedRanges,
  mineMergedRanges,
  baseRowEntryByRowNumber,
  mineRowEntryByRowNumber,
  compareMode,
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
    const rowDelta = buildWorkbookSplitRowCompareState(
      renderRow.row,
      renderColumns.map(entry => entry.column),
      compareMode,
    );
    return {
      baseEntry,
      mineEntry,
      compareCells: rowDelta.cellDeltas,
      isSearchMatch: renderRow.isSearchMatch,
      isActiveSearch: renderRow.isActiveSearch,
      isGuided: renderRow.isGuided,
      isGuidedStart: renderRow.isGuidedStart,
      isGuidedEnd: renderRow.isGuidedEnd,
    };
  }), [baseVersion, compareMode, mineVersion, renderColumns, rows, sheetName, visibleColumns]);
  const baseRenderedRowNumbers = useMemo(
    () => renderRows.map(renderRow => renderRow.baseEntry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderRows],
  );
  const mineRenderedRowNumbers = useMemo(
    () => renderRows.map(renderRow => renderRow.mineEntry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderRows],
  );
  const renderRowBySideRowNumber = useMemo(() => {
    const next = {
      base: new Map<number, (typeof renderRows)[number]>(),
      mine: new Map<number, (typeof renderRows)[number]>(),
    };

    renderRows.forEach((renderRow) => {
      if (renderRow.baseEntry) next.base.set(renderRow.baseEntry.rowNumber, renderRow);
      if (renderRow.mineEntry) next.mine.set(renderRow.mineEntry.rowNumber, renderRow);
    });

    return next;
  }, [renderRows]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.ceil(viewportWidth));
      const canvasHeight = Math.max(1, Math.ceil(height));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const contentRight = Math.min(width, contentWidth);
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
      const deferredMergedDraws: Array<() => void> = [];

      const frozenPairWidth = renderColumns
        .filter(entry => entry.position < freezeColumnCount)
        .reduce((sum, entry) => sum + entry.displayWidth, 0);
      const contentLeft = LN_W + 3;
      const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);
      const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);

      renderRows.forEach((renderRow, rowIndex) => {
        const y = rowIndex * ROW_H;
        const rowBg = renderRow.isGuided
          ? `${T.acc2}08`
          : renderRow.isActiveSearch
          ? T.searchActiveBg
          : renderRow.isSearchMatch
          ? `${T.searchHl}28`
          : T.bg0;
        const border = renderRow.baseEntry?.rowNumber || renderRow.mineEntry?.rowNumber
          ? T.border2
          : T.border;
        const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;

        const selectionAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
        const isSelectedRow = Boolean(
          selectedCell
          && selectedCell.kind === 'row'
          && selectedCell.sheetName === sheetName
          && selectedCell.rowNumber === rowNumber,
        );

        ctx.fillStyle = rowBg;
        ctx.fillRect(0, y, contentRight, ROW_H);
        ctx.fillStyle = isSelectedRow ? `${selectionAccent}26` : T.lnBg;
        ctx.fillRect(3, y, LN_W, ROW_H);
        ctx.fillStyle = border;
        ctx.fillRect(0, y, 3, ROW_H);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(contentRight, y + 0.5);
        ctx.stroke();

        if (isSelectedRow) {
          ctx.strokeStyle = `${selectionAccent}a6`;
          ctx.lineWidth = 2;
          ctx.strokeRect(4, y + 1, LN_W - 2, ROW_H - 2);
          ctx.lineWidth = 1;
        }

        ctx.fillStyle = isSelectedRow ? selectionAccent : T.lnTx;
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowNumber ? String(rowNumber) : '', LN_W - 8, y + (ROW_H / 2));
        const drawCell = (
          side: 'base' | 'mine',
          columnEntry: HorizontalVirtualColumnEntry,
          drawX: number,
        ) => {
          if (drawX >= contentRight || drawX + columnEntry.width <= contentLeft) return;

          const column = columnEntry.column;
          const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
          const cellRowNumber = entry?.rowNumber ?? rowNumber;
          const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
          const renderedRowNumbers = side === 'base' ? baseRenderedRowNumbers : mineRenderedRowNumbers;
          const mergeInfo = getWorkbookMergeDrawInfo({
            rowNumber: cellRowNumber,
            column,
            rowTop: y,
            rowHeight: ROW_H,
            renderedRowNumbers,
            mergedRanges,
            columnLayoutByColumn,
            contentLeft,
            currentScrollLeft,
            freezeColumnCount,
            frozenWidth: frozenPairWidth,
            mode: side === 'base' ? 'paired-base' : 'paired-mine',
          });
          if (mergeInfo.covered && !mergeInfo.region) return;

          const cell = entry?.cells[column] ?? { value: '', formula: '' };
          const compareCell = mergeInfo.region
            ? getWorkbookMergedCompareCell(renderRow.compareCells, mergeInfo.region.range)
            : renderRow.compareCells.get(column);
          const hasContent = hasWorkbookCellContent(cell, compareMode);
          const selectionRowNumber = mergeInfo.region?.range.startRow ?? cellRowNumber;
          const selectionColumn = mergeInfo.region?.range.startCol ?? column;
          const selectionVisual = getWorkbookSelectionVisualState(T, selectedCell, sheetName, side, selectionRowNumber, selectionColumn);
          const cellVisual = resolveWorkbookCompareCellVisual({
            theme: T,
            compareCell,
            side,
            hasEntry: Boolean(entry),
            hasContent,
            hasBaseRow: Boolean(renderRow.baseEntry),
            hasMineRow: Boolean(renderRow.mineEntry),
            defaultTextColor: side === 'mine' ? T.t0 : T.t1,
          });
          const regionLeft = mergeInfo.region?.left ?? drawX;
          const regionTop = mergeInfo.region?.top ?? y;
          const regionWidth = mergeInfo.region?.width ?? columnEntry.width;
          const regionHeight = mergeInfo.region?.height ?? ROW_H;
          const regionSegments = mergeInfo.region?.segments ?? [{ left: regionLeft, width: regionWidth }];
          const selectionSegments = regionSegments;
          const selectionTop = regionTop;
          const selectionHeight = regionHeight;
          const textCenterY = regionTop + (regionHeight / 2);
          const textX = regionLeft + 8;

          const paintRegion = () => {
            ctx.fillStyle = cellVisual.background;
            regionSegments.forEach((segment) => {
              ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
            });
            if (cellVisual.maskOverlay && !selectionVisual.hasSelectionHighlight) {
              ctx.fillStyle = cellVisual.maskOverlay;
              regionSegments.forEach((segment) => {
                ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
              });
            }
            const selectionOverlay = getWorkbookSelectionOverlay(selectionVisual);
            if (selectionOverlay) {
              ctx.fillStyle = selectionOverlay;
              selectionSegments.forEach((segment) => {
                ctx.fillRect(segment.left, selectionTop, segment.width, selectionHeight);
              });
            }
            ctx.strokeStyle = cellVisual.border;
            regionSegments.forEach((segment) => {
              ctx.strokeRect(segment.left + 0.5, regionTop + 0.5, segment.width - 1, regionHeight - 1);
            });
            selectionSegments.forEach((segment) => {
              drawWorkbookCanvasSelectionFrame(ctx, segment.left, selectionTop, segment.width, selectionHeight, selectionVisual);
            });

            ctx.save();
            ctx.beginPath();
            regionSegments.forEach((segment) => {
              ctx.rect(segment.left + 8, regionTop + 1, Math.max(0, segment.width - 16), Math.max(0, regionHeight - 2));
            });
            ctx.clip();
            ctx.fillStyle = cellVisual.textColor;
            ctx.font = `${sizes.ui}px ${FONT_UI}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(trimCellText(cell.value || '\u00A0'), textX, textCenterY);
            ctx.restore();
          };

          if (mergeInfo.region) {
            deferredMergedDraws.push(paintRegion);
            return;
          }

          paintRegion();
        };

        const drawPair = (columnEntry: HorizontalVirtualColumnEntry, drawX: number) => {
          drawCell('base', columnEntry, drawX);
          drawCell('mine', columnEntry, drawX + columnEntry.width);
        };

        floatingEntries.forEach((columnEntry) => {
          const x = contentLeft + columnEntry.offset - currentScrollLeft;
          if (x + columnEntry.displayWidth < contentLeft + frozenPairWidth || x > contentRight) return;
          drawPair(columnEntry, x);
        });

        frozenEntries.forEach((columnEntry) => {
          const x = contentLeft + columnEntry.offset;
          if (x > contentRight) return;
          drawPair(columnEntry, x);
        });
      });

      deferredMergedDraws.forEach((paintRegion) => paintRegion());

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
  }, [baseMergedRanges, baseRenderedRowNumbers, columnLayoutByColumn, contentWidth, freezeColumnCount, height, mineMergedRanges, mineRenderedRowNumbers, renderColumns, renderRows, scrollRef, selectedCell, sheetName, sizes.line, sizes.ui, T, viewportWidth]);

  const resolveHit = (
    x: number,
    y: number,
    canvasRect: DOMRect,
  ): { selection: WorkbookSelectedCell; hover: WorkbookCanvasHoverCell | null } | null => {
    const contentHitRight = Math.min(viewportWidth, contentWidth);
    if (x >= contentHitRight) return null;

    const rowIndex = Math.floor(y / ROW_H);
    const renderRow = renderRows[rowIndex];
    if (!renderRow) return null;
    const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;

    const contentLeft = LN_W + 3;
    const selectionKind = resolveWorkbookCanvasSelectionKind({
      hitX: x,
      contentLeft,
      rowNumber,
      headerRowNumber,
    });
    if (selectionKind === 'row') {
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

    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const frozenPairWidth = renderColumns
      .filter(entry => entry.position < freezeColumnCount)
      .reduce((sum, entry) => sum + entry.displayWidth, 0);
    const hitEntry = renderColumns.find((entryMeta) => {
      const drawX = entryMeta.position < freezeColumnCount
        ? contentLeft + entryMeta.offset
        : contentLeft + entryMeta.offset - currentScrollLeft;
      return x >= drawX && x < drawX + entryMeta.displayWidth;
    });
    if (!hitEntry) return null;

    const pairX = hitEntry.position < freezeColumnCount
      ? contentLeft + hitEntry.offset
      : contentLeft + hitEntry.offset - currentScrollLeft;
    const withinPairX = x - pairX;
    const side: 'base' | 'mine' = withinPairX < hitEntry.width ? 'base' : 'mine';
    const column = hitEntry.column;
    const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
    if (!entry) return null;
    const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
    const rowEntryByRowNumber = side === 'base' ? baseRowEntryByRowNumber : mineRowEntryByRowNumber;
    const mergeRange = findWorkbookMergeRange(mergedRanges, entry.rowNumber, column);
    const anchorRowNumber = mergeRange?.startRow ?? entry.rowNumber;
    const anchorColumn = mergeRange?.startCol ?? column;
    const anchorEntry = rowEntryByRowNumber.get(anchorRowNumber) ?? entry;
    const anchorRenderRow = renderRowBySideRowNumber[side].get(anchorRowNumber) ?? renderRow;
    const bounds = getWorkbookColumnSpanBounds(
      mergeRange?.startCol ?? column,
      mergeRange?.endCol ?? column,
      columnLayoutByColumn,
      side === 'base' ? 'paired-base' : 'paired-mine',
      freezeColumnCount,
    );
    const spanRect = bounds
      ? getWorkbookCanvasSpanRect(bounds, contentLeft, currentScrollLeft, frozenPairWidth)
      : null;
    const compareCell = mergeRange
      ? getWorkbookMergedCompareCell(anchorRenderRow.compareCells, mergeRange)
      : anchorRenderRow.compareCells.get(column);
    const cellX = spanRect?.left ?? (side === 'base' ? pairX : pairX + hitEntry.width);
    const cellWidth = spanRect?.width ?? hitEntry.width;
    const selected = buildWorkbookSelectedCell(anchorEntry, anchorColumn, mergedRanges);

    if (selectionKind === 'column') {
      return {
        selection: {
          kind: 'column',
          sheetName,
          side,
          versionLabel: entry.versionLabel,
          rowNumber: anchorEntry.rowNumber,
          colIndex: anchorColumn,
          colLabel: selected.colLabel,
          address: selected.colLabel,
          value: selected.value,
          formula: selected.formula,
        },
        hover: compareCell ? {
          key: `${side}-${anchorEntry.rowNumber}-${anchorColumn}`,
          anchorRect: {
            left: canvasRect.left + cellX,
            top: canvasRect.top + (rowIndex * ROW_H),
            width: cellWidth,
            height: ROW_H,
            right: canvasRect.left + cellX + cellWidth,
            bottom: canvasRect.top + ((rowIndex + 1) * ROW_H),
          },
          compareCell,
        } : null,
      };
    }

    return {
      selection: selected,
      hover: compareCell ? {
        key: `${side}-${anchorEntry.rowNumber}-${anchorColumn}`,
        anchorRect: {
          left: canvasRect.left + cellX,
          top: canvasRect.top + (rowIndex * ROW_H),
          width: cellWidth,
          height: ROW_H,
          right: canvasRect.left + cellX + cellWidth,
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
    hoverKeyRef.current = '';
    onHoverChange?.(null);
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
        backfaceVisibility: 'hidden',
      }}
    />
  );
});

export default WorkbookColumnsCanvasStrip;
