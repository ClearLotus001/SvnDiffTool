import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { LN_W } from '@/constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '@/constants/typography';
import { hasWorkbookCellContent } from '@/utils/workbook/workbookCellContract';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell, type WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import { resolveWorkbookCanvasSelectionKind } from '@/utils/workbook/workbookCanvasSelection';
import { resolveWorkbookCompareCellVisual } from '@/utils/workbook/workbookCompareVisuals';
import {
  getWorkbookMergeDrawInfo,
  getWorkbookMergedCompareCell,
  getWorkbookColumnSpanBounds,
  getWorkbookCanvasSpanRect,
  findWorkbookMergeRange,
} from '@/utils/workbook/workbookMergeLayout';
import { resolveLineNumberColor } from '@/utils/diff/lineNumberTone';
import {
  drawWorkbookCanvasSelectionFrame,
  getWorkbookSelectionOverlay,
  getWorkbookSelectionVisualState,
} from '@/utils/workbook/workbookSelectionVisual';
import { buildWorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import { useTheme } from '@/context/theme';
import type {
  SplitRow,
  WorkbookCompareMode,
  WorkbookSelectionMode,
  WorkbookSelectedCell,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '@/types';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import type { WorkbookMergeRange } from '@/utils/workbook/workbookMeta';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';

export interface WorkbookPaneCanvasRow {
  row: SplitRow;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  isGuided: boolean;
  isGuidedStart: boolean;
  isGuidedEnd: boolean;
}

interface WorkbookPaneCanvasStripProps {
  rows: WorkbookPaneCanvasRow[];
  side: 'base' | 'mine';
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  versionLabel: string;
  headerRowNumber: number;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange?: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  mergedRanges: WorkbookMergeRange[];
  rowEntryByRowNumber: Map<number, WorkbookRowEntry>;
  compareMode: WorkbookCompareMode;
}

function trimCellText(value: string) {
  return value.replace(/\u001F/g, ' ').replace(/\r\n/g, ' / ').replace(/\r/g, ' / ').replace(/\n/g, ' / ');
}

function getSelectionModeFromMouseEvent(event: Pick<React.MouseEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
}

const WorkbookPaneCanvasStrip = memo(({
  rows,
  side,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  versionLabel,
  headerRowNumber,
  selection,
  onSelectionRequest,
  onHoverChange,
  fontSize,
  visibleColumns,
  renderColumns,
  columnLayoutByColumn,
  mergedRanges,
  rowEntryByRowNumber,
  compareMode,
}: WorkbookPaneCanvasStripProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hoverKeyRef = useRef('');
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const height = rows.length * ROW_H;
  const selectionLookup = useMemo(() => buildWorkbookSelectionLookup(selection), [selection]);
  const primarySelection = selection.primary;

  const renderRows = useMemo(() => rows.map((renderRow) => {
    const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, versionLabel, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, versionLabel, visibleColumns);
    const entry = side === 'base' ? baseEntry : mineEntry;
    const rowDelta = buildWorkbookSplitRowCompareState(
      renderRow.row,
      renderColumns.map(entryMeta => entryMeta.column),
      compareMode,
    );
    return {
      entry,
      rowNumber: baseEntry?.rowNumber ?? mineEntry?.rowNumber ?? 0,
      tone: side === 'base'
        ? (renderRow.row.left?.type === 'delete' ? 'delete' : 'neutral')
        : (renderRow.row.right?.type === 'add' ? 'add' : 'neutral'),
      compareCells: rowDelta.cellDeltas,
      hasBaseRow: Boolean(baseEntry),
      hasMineRow: Boolean(mineEntry),
      isSearchMatch: renderRow.isSearchMatch,
      isActiveSearch: renderRow.isActiveSearch,
      isGuided: renderRow.isGuided,
      isGuidedStart: renderRow.isGuidedStart,
      isGuidedEnd: renderRow.isGuidedEnd,
    };
  }), [compareMode, renderColumns, rows, sheetName, side, versionLabel, visibleColumns]);
  const renderedRowNumbers = useMemo(
    () => renderRows.map(renderRow => renderRow.entry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderRows],
  );
  const renderRowByRowNumber = useMemo(
    () => new Map(renderRows.flatMap((renderRow) => (
      renderRow.entry ? [[renderRow.entry.rowNumber, renderRow] as const] : []
    ))),
    [renderRows],
  );

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

      const frozenWidth = renderColumns
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
        const border = renderRow.tone === 'add' ? T.addBrd : renderRow.tone === 'delete' ? T.delBrd : T.border2;
        const entry = renderRow.entry;
        const rowNumber = renderRow.rowNumber;
        const selectionAccent = side === 'base' ? T.acc2 : T.acc;
        const isSelectedRow = Boolean(
          selectionLookup.rowKeys.has(`${sheetName}:${rowNumber}`),
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

        ctx.fillStyle = isSelectedRow
          ? selectionAccent
          : resolveLineNumberColor(T, side, renderRow.isActiveSearch);
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(entry ? String(entry.rowNumber) : '', LN_W - 8, y + (ROW_H / 2));
        const drawCell = (entryMeta: HorizontalVirtualColumnEntry, drawX: number) => {
          if (drawX >= contentRight || drawX + entryMeta.width <= contentLeft) return;

          const column = entryMeta.column;
          const cellRowNumber = entry?.rowNumber ?? rowNumber;
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
            frozenWidth,
            mode: 'single',
          });
          if (mergeInfo.covered && !mergeInfo.region) return;

          const cell = entry?.cells[column] ?? { value: '', formula: '' };
          const compareCell = mergeInfo.region
            ? getWorkbookMergedCompareCell(renderRow.compareCells, mergeInfo.region.range)
            : renderRow.compareCells.get(column);
          const hasContent = hasWorkbookCellContent(cell, compareMode);
          const selectionRowNumber = mergeInfo.region?.range.startRow ?? cellRowNumber;
          const selectionColumn = mergeInfo.region?.range.startCol ?? column;
          const selectionVisual = getWorkbookSelectionVisualState(T, selectionLookup, sheetName, side, selectionRowNumber, selectionColumn);
          const cellVisual = resolveWorkbookCompareCellVisual({
            theme: T,
            compareCell,
            side,
            hasEntry: Boolean(entry),
            hasContent,
            hasBaseRow: renderRow.hasBaseRow,
            hasMineRow: renderRow.hasMineRow,
            defaultTextColor: side === 'mine' ? T.t0 : T.t1,
          });
          const regionLeft = mergeInfo.region?.left ?? drawX;
          const regionTop = mergeInfo.region?.top ?? y;
          const regionWidth = mergeInfo.region?.width ?? entryMeta.width;
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

        floatingEntries.forEach((entryMeta) => {
          const x = contentLeft + entryMeta.offset - currentScrollLeft;
          if (x + entryMeta.width < contentLeft + frozenWidth || x > contentRight) return;
          drawCell(entryMeta, x);
        });
        frozenEntries.forEach((entryMeta) => {
          const x = contentLeft + entryMeta.offset;
          if (x > contentRight) return;
          drawCell(entryMeta, x);
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
  }, [columnLayoutByColumn, compareMode, contentWidth, freezeColumnCount, height, mergedRanges, renderColumns, renderRows, renderedRowNumbers, scrollRef, selectionLookup, sheetName, side, sizes.line, sizes.ui, T, viewportWidth]);

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
    const entry = renderRow.entry;
    if (!entry) return null;

    const contentLeft = LN_W + 3;
    const selectionKind = resolveWorkbookCanvasSelectionKind({
      hitX: x,
      contentLeft,
      rowNumber: entry.rowNumber,
      headerRowNumber,
    });
    if (selectionKind === 'row') {
      return {
        selection: {
          kind: 'row',
          sheetName,
          side,
          versionLabel,
          rowNumber: entry.rowNumber,
          colIndex: primarySelection?.colIndex ?? 0,
          colLabel: primarySelection?.colLabel ?? 'A',
          address: `${entry.rowNumber}`,
          value: '',
          formula: '',
        },
        hover: null,
      };
    }

    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const frozenWidth = renderColumns
      .filter(entry => entry.position < freezeColumnCount)
      .reduce((sum, entry) => sum + entry.displayWidth, 0);
    const hitEntry = renderColumns.find((entryMeta) => {
      const drawX = entryMeta.position < freezeColumnCount
        ? contentLeft + entryMeta.offset
        : contentLeft + entryMeta.offset - currentScrollLeft;
      return x >= drawX && x < drawX + entryMeta.width;
    });
    if (!hitEntry) return null;

    const column = hitEntry.column;
    const mergeRange = findWorkbookMergeRange(mergedRanges, entry.rowNumber, column);
    const anchorRowNumber = mergeRange?.startRow ?? entry.rowNumber;
    const anchorColumn = mergeRange?.startCol ?? column;
    const anchorEntry = rowEntryByRowNumber.get(anchorRowNumber) ?? entry;
    const anchorRenderRow = renderRowByRowNumber.get(anchorRowNumber) ?? renderRow;
    const bounds = getWorkbookColumnSpanBounds(
      mergeRange?.startCol ?? column,
      mergeRange?.endCol ?? column,
      columnLayoutByColumn,
      'single',
      freezeColumnCount,
    );
    const spanRect = bounds
      ? getWorkbookCanvasSpanRect(bounds, contentLeft, currentScrollLeft, frozenWidth)
      : null;
    const compareCell = mergeRange
      ? getWorkbookMergedCompareCell(anchorRenderRow.compareCells, mergeRange)
      : anchorRenderRow.compareCells.get(column);
    const columnX = spanRect?.left ?? (
      hitEntry.position < freezeColumnCount
        ? contentLeft + hitEntry.offset
        : contentLeft + hitEntry.offset - currentScrollLeft
    );
    const columnWidth = spanRect?.width ?? hitEntry.width;
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
            left: canvasRect.left + columnX,
            top: canvasRect.top + (rowIndex * ROW_H),
            width: columnWidth,
            height: ROW_H,
            right: canvasRect.left + columnX + columnWidth,
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
          left: canvasRect.left + columnX,
          top: canvasRect.top + (rowIndex * ROW_H),
          width: columnWidth,
          height: ROW_H,
          right: canvasRect.left + columnX + columnWidth,
          bottom: canvasRect.top + ((rowIndex + 1) * ROW_H),
        },
        compareCell,
      } : null,
    };
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      canvasRect,
    );
    if (!hit) return;
    hoverKeyRef.current = '';
    onHoverChange?.(null);
    onSelectionRequest({
      target: hit.selection,
      mode: getSelectionModeFromMouseEvent(event),
      reason: 'click',
    });
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

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      canvasRect,
    );
    if (!hit) return;
    event.preventDefault();
    hoverKeyRef.current = '';
    onHoverChange?.(null);
    onSelectionRequest({
      target: hit.selection,
      mode: getSelectionModeFromMouseEvent(event),
      reason: 'contextmenu',
      preserveExistingIfTargetSelected: true,
      clientPoint: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
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

export default WorkbookPaneCanvasStrip;
