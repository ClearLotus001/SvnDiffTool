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
  findWorkbookMergeRange,
  getWorkbookCanvasSpanRect,
  getWorkbookColumnSpanBounds,
  getWorkbookMergeDrawInfo,
  getWorkbookMergedCompareCell,
} from '../utils/workbookMergeLayout';
import {
  drawWorkbookCanvasSelectionFrame,
  getWorkbookSelectionOverlay,
  getWorkbookSelectionVisualState,
} from '../utils/workbookSelectionVisual';
import { buildWorkbookSelectionLookup } from '../utils/workbookSelectionState';
import {
  resolveLineNumberColor,
  resolveSharedWorkbookLineNumberTone,
} from '../utils/lineNumberTone';
import { useTheme } from '../context/theme';
import type {
  SplitRow,
  WorkbookCompareMode,
  WorkbookSelectionMode,
  WorkbookSelectedCell,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '../types';
import { ROW_H } from '../hooks/useVirtual';
import type { WorkbookMergeRange } from '../utils/workbookMeta';
import type { WorkbookCanvasHoverCell } from './WorkbookCanvasHoverTooltip';

type CanvasRenderMode = 'single-base' | 'single-mine' | 'single-equal' | 'double';

export interface WorkbookCanvasRenderRow {
  row: SplitRow;
  renderMode: CanvasRenderMode;
  height: number;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  isGuided: boolean;
  isGuidedStart: boolean;
  isGuidedEnd: boolean;
}

interface WorkbookStackedCanvasStripProps {
  rows: WorkbookCanvasRenderRow[];
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
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

interface CanvasBand {
  entry: WorkbookRowEntry | null;
  side: 'base' | 'mine';
  tone: 'neutral' | 'add' | 'delete';
  useSideAccentForChanges: boolean;
  compareCells: ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas'];
  hasBaseRow: boolean;
  hasMineRow: boolean;
  y: number;
  height: number;
  isGuided: boolean;
  isActiveSearch: boolean;
  rowHighlightBg?: string | undefined;
}

function trimCellText(value: string) {
  return value.replace(/\u001F/g, ' ').replace(/\r\n/g, ' / ').replace(/\r/g, ' / ').replace(/\n/g, ' / ');
}

function getSelectionModeFromMouseEvent(event: Pick<React.MouseEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
}

const WorkbookStackedCanvasStrip = memo(({
  rows,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  baseVersion,
  mineVersion,
  headerRowNumber,
  selection,
  onSelectionRequest,
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
}: WorkbookStackedCanvasStripProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hoverKeyRef = useRef('');
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const totalHeight = useMemo(() => rows.reduce((sum, row) => sum + row.height, 0), [rows]);
  const selectionLookup = useMemo(() => buildWorkbookSelectionLookup(selection), [selection]);
  const primarySelection = selection.primary;

  const renderBands = useMemo(() => {
    const bands: CanvasBand[] = [];
    let cursorY = 0;

    rows.forEach((renderRow) => {
      const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
      const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
      const rowDelta = buildWorkbookSplitRowCompareState(
        renderRow.row,
        renderColumns.map(entry => entry.column),
        compareMode,
      );
      const hasBaseRow = Boolean(baseEntry);
      const hasMineRow = Boolean(mineEntry);
      const rowHighlightBg = renderRow.isGuided
        ? `${T.acc2}08`
        : renderRow.isActiveSearch
        ? T.searchActiveBg
        : renderRow.isSearchMatch
        ? `${T.searchHl}28`
        : undefined;

      if (renderRow.renderMode === 'single-base') {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: 'delete',
          useSideAccentForChanges: false,
          compareCells: rowDelta.cellDeltas,
          hasBaseRow,
          hasMineRow,
          y: cursorY,
          height: ROW_H,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          rowHighlightBg,
        });
      } else if (renderRow.renderMode === 'single-mine') {
        bands.push({
          entry: mineEntry,
          side: 'mine',
          tone: 'add',
          useSideAccentForChanges: false,
          compareCells: rowDelta.cellDeltas,
          hasBaseRow,
          hasMineRow,
          y: cursorY,
          height: ROW_H,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          rowHighlightBg,
        });
      } else if (renderRow.renderMode === 'single-equal') {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: 'neutral',
          useSideAccentForChanges: false,
          compareCells: rowDelta.cellDeltas,
          hasBaseRow,
          hasMineRow,
          y: cursorY,
          height: ROW_H,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          rowHighlightBg,
        });
      } else {
        bands.push({
          entry: baseEntry,
          side: 'base',
          tone: renderRow.row.left?.type === 'delete' ? 'delete' : 'neutral',
          useSideAccentForChanges: true,
          compareCells: rowDelta.cellDeltas,
          hasBaseRow,
          hasMineRow,
          y: cursorY,
          height: ROW_H,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          rowHighlightBg,
        });
        bands.push({
          entry: mineEntry,
          side: 'mine',
          tone: renderRow.row.right?.type === 'add' ? 'add' : 'neutral',
          useSideAccentForChanges: true,
          compareCells: rowDelta.cellDeltas,
          hasBaseRow,
          hasMineRow,
          y: cursorY + ROW_H,
          height: ROW_H,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          rowHighlightBg,
        });
      }

      cursorY += renderRow.height;
    });

    return bands;
  }, [baseVersion, compareMode, mineVersion, renderColumns, rows, sheetName, T.acc2, T.searchActiveBg, T.searchHl, visibleColumns]);
  const baseRenderedRowNumbers = useMemo(
    () => renderBands.filter(band => band.side === 'base').map(band => band.entry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderBands],
  );
  const mineRenderedRowNumbers = useMemo(
    () => renderBands.filter(band => band.side === 'mine').map(band => band.entry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderBands],
  );
  const bandPositionBySideRowNumber = useMemo(() => {
    const next = {
      base: new Map<number, { top: number; height: number }>(),
      mine: new Map<number, { top: number; height: number }>(),
    };

    renderBands.forEach((band) => {
      if (!band.entry) return;
      next[band.side].set(band.entry.rowNumber, { top: band.y, height: band.height });
    });

    return next;
  }, [renderBands]);
  const compareCellsBySideRowNumber = useMemo(() => {
    const next = {
      base: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
      mine: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
    };

    renderBands.forEach((band) => {
      if (!band.entry) return;
      next[band.side].set(band.entry.rowNumber, band.compareCells);
    });

    return next;
  }, [renderBands]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.ceil(viewportWidth));
      const height = Math.max(1, Math.ceil(totalHeight));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const contentRight = Math.min(width, contentWidth);
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
      const deferredMergedDraws: Array<() => void> = [];

      const frozenWidth = renderColumns
        .filter(entry => entry.position < freezeColumnCount)
        .reduce((sum, entry) => sum + entry.displayWidth, 0);
      const contentLeft = LN_W + 3;

      renderBands.forEach((band) => {
        const entry = band.entry;
        const y = band.y;
        const h = band.height;
        const rowNumber = entry?.rowNumber ?? 0;
        const rowBg = band.rowHighlightBg ?? T.bg0;
        const selectionAccent = band.side === 'base' ? T.acc2 : T.acc;
        const semanticBorder = band.tone === 'add' ? T.addBrd : band.tone === 'delete' ? T.delBrd : T.border2;
        const bandBorder = band.useSideAccentForChanges ? selectionAccent : semanticBorder;
        const bandRule = band.useSideAccentForChanges ? `${selectionAccent}66` : bandBorder;
        const cellTextColor = band.side === 'mine' ? T.t0 : T.t1;
        const isSelectedRow = Boolean(
          selectionLookup.rowKeys.has(`${sheetName}:${rowNumber}`),
        );
        const lineNumberTone = band.useSideAccentForChanges
          ? band.side
          : (
            band.tone === 'delete'
              ? 'base'
              : band.tone === 'add'
              ? 'mine'
              : resolveSharedWorkbookLineNumberTone(band.hasBaseRow, band.hasMineRow)
          );

        ctx.fillStyle = rowBg;
        ctx.fillRect(0, y, contentRight, h);

        ctx.fillStyle = isSelectedRow ? `${selectionAccent}26` : T.lnBg;
        ctx.fillRect(3, y, LN_W, h);
        ctx.fillStyle = bandBorder;
        ctx.fillRect(0, y, 3, h);
        ctx.strokeStyle = bandRule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(contentRight, y + 0.5);
        ctx.stroke();

        if (isSelectedRow) {
          ctx.strokeStyle = `${selectionAccent}a6`;
          ctx.lineWidth = 2;
          ctx.strokeRect(4, y + 1, LN_W - 2, h - 2);
          ctx.lineWidth = 1;
        }

        ctx.fillStyle = isSelectedRow
          ? selectionAccent
          : resolveLineNumberColor(T, lineNumberTone, band.isActiveSearch);
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rowNumber || ''), LN_W - 8, y + (h / 2));
        const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);
        const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);

        const drawCell = (entryMeta: HorizontalVirtualColumnEntry, drawX: number) => {
          if (!entry || drawX >= contentRight || drawX + entryMeta.width <= contentLeft) return;

          const column = entryMeta.column;
          const mergedRanges = band.side === 'base' ? baseMergedRanges : mineMergedRanges;
          const renderedRowNumbers = band.side === 'base' ? baseRenderedRowNumbers : mineRenderedRowNumbers;
          const mergeInfo = getWorkbookMergeDrawInfo({
            rowNumber,
            column,
            rowTop: y,
            rowHeight: h,
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

          const cell = entry.cells[column] ?? { value: '', formula: '' };
          const compareCell = mergeInfo.region
            ? getWorkbookMergedCompareCell(band.compareCells, mergeInfo.region.range)
            : band.compareCells.get(column);
          const hasContent = hasWorkbookCellContent(cell, compareMode);
          const selectionRowNumber = mergeInfo.region?.range.startRow ?? rowNumber;
          const selectionColumn = mergeInfo.region?.range.startCol ?? column;
          const selectionVisual = getWorkbookSelectionVisualState(T, selectionLookup, sheetName, band.side, selectionRowNumber, selectionColumn);
          const cellVisual = resolveWorkbookCompareCellVisual({
            theme: T,
            compareCell,
            side: band.side,
            hasEntry: true,
            hasContent,
            hasBaseRow: band.hasBaseRow,
            hasMineRow: band.hasMineRow,
            defaultTextColor: cellTextColor,
          });
          const mergedRegion = mergeInfo.region;
          const lastVisibleMergedRow = mergedRegion
            ? renderedRowNumbers.filter((visibleRowNumber) => (
              visibleRowNumber >= mergedRegion.range.startRow
              && visibleRowNumber <= mergedRegion.range.endRow
            )).at(-1)
            : null;
          const lastVisibleMergedBand = mergedRegion && lastVisibleMergedRow != null
            ? bandPositionBySideRowNumber[band.side].get(lastVisibleMergedRow)
            : null;
          const regionLeft = mergeInfo.region?.left ?? drawX;
          const regionTop = mergeInfo.region?.top ?? y;
          const regionWidth = mergeInfo.region?.width ?? entryMeta.width;
          const regionHeight = mergeInfo.region && lastVisibleMergedBand
            ? Math.max(h, (lastVisibleMergedBand.top + lastVisibleMergedBand.height) - regionTop)
            : mergeInfo.region?.height ?? h;
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

      floatingEntries.forEach((columnEntry) => {
        const x = contentLeft + columnEntry.offset - currentScrollLeft;
        if (x + columnEntry.width < contentLeft + frozenWidth || x > contentRight) return;
        drawCell(columnEntry, x);
      });

      frozenEntries.forEach((columnEntry) => {
        const x = contentLeft + columnEntry.offset;
        if (x > contentRight) return;
        drawCell(columnEntry, x);
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
  }, [bandPositionBySideRowNumber, baseMergedRanges, baseRenderedRowNumbers, columnLayoutByColumn, contentWidth, freezeColumnCount, mineMergedRanges, mineRenderedRowNumbers, renderBands, renderColumns, scrollRef, selectionLookup, sheetName, sizes.line, sizes.ui, T, totalHeight, viewportWidth]);

  const resolveHit = (
    x: number,
    y: number,
    canvasRect: DOMRect,
  ): { selection: WorkbookSelectedCell; hover: WorkbookCanvasHoverCell | null } | null => {
    const contentHitRight = Math.min(viewportWidth, contentWidth);
    if (x >= contentHitRight) return null;

    const contentLeft = LN_W + 3;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const frozenWidth = renderColumns
      .filter(entry => entry.position < freezeColumnCount)
      .reduce((sum, entry) => sum + entry.displayWidth, 0);
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
            versionLabel: entry.versionLabel,
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

      const hitEntry = renderColumns.find((entryMeta) => {
        const drawX = entryMeta.position < freezeColumnCount
          ? contentLeft + entryMeta.offset
          : contentLeft + entryMeta.offset - currentScrollLeft;
        return x >= drawX && x < drawX + entryMeta.width;
      });
      if (!hitEntry) return null;

      const column = hitEntry.column;
      const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
      const rowEntryByRowNumber = side === 'base' ? baseRowEntryByRowNumber : mineRowEntryByRowNumber;
      const mergeRange = findWorkbookMergeRange(mergedRanges, entry.rowNumber, column);
      const anchorRowNumber = mergeRange?.startRow ?? entry.rowNumber;
      const anchorColumn = mergeRange?.startCol ?? column;
      const anchorEntry = rowEntryByRowNumber.get(anchorRowNumber) ?? entry;
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
      const anchorCompareCells = compareCellsBySideRowNumber[side].get(anchorRowNumber)
        ?? buildWorkbookSplitRowCompareState(
          renderRow.row,
          renderColumns.map(entryMeta => entryMeta.column),
          compareMode,
        ).cellDeltas;
      const compareCell = mergeRange
        ? getWorkbookMergedCompareCell(anchorCompareCells, mergeRange)
        : anchorCompareCells.get(column);
      const columnX = spanRect?.left ?? (
        hitEntry.position < freezeColumnCount
          ? contentLeft + hitEntry.offset
          : contentLeft + hitEntry.offset - currentScrollLeft
      );
      const bandY = rowTop + (renderRow.renderMode === 'double' && side === 'mine' ? ROW_H : 0);
      const renderedRowNumbers = side === 'base' ? baseRenderedRowNumbers : mineRenderedRowNumbers;
      const visibleStartRow = mergeRange
        ? renderedRowNumbers.find((visibleRowNumber) => (
          visibleRowNumber >= mergeRange.startRow
          && visibleRowNumber <= mergeRange.endRow
        )) ?? anchorRowNumber
        : anchorRowNumber;
      const visibleEndRow = mergeRange
        ? [...renderedRowNumbers].reverse().find((visibleRowNumber) => (
          visibleRowNumber >= mergeRange.startRow
          && visibleRowNumber <= mergeRange.endRow
        )) ?? visibleStartRow
        : visibleStartRow;
      const visibleStartBand = bandPositionBySideRowNumber[side].get(visibleStartRow);
      const visibleEndBand = bandPositionBySideRowNumber[side].get(visibleEndRow);
      const columnWidth = spanRect?.width ?? hitEntry.width;
      const hoverTop = visibleStartBand?.top ?? bandY;
      const hoverHeight = visibleStartBand && visibleEndBand
        ? Math.max(ROW_H, (visibleEndBand.top + visibleEndBand.height) - hoverTop)
        : ROW_H;
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
              top: canvasRect.top + hoverTop,
              width: columnWidth,
              height: hoverHeight,
              right: canvasRect.left + columnX + columnWidth,
              bottom: canvasRect.top + hoverTop + hoverHeight,
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
            top: canvasRect.top + hoverTop,
            width: columnWidth,
            height: hoverHeight,
            right: canvasRect.left + columnX + columnWidth,
            bottom: canvasRect.top + hoverTop + hoverHeight,
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

export default WorkbookStackedCanvasStrip;
