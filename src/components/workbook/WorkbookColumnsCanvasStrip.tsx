import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { LN_W } from '@/constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '@/constants/typography';
import { hasWorkbookCellContent } from '@/utils/workbook/workbookCellContract';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell, type WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import { resolveWorkbookCanvasSelectionKind } from '@/utils/workbook/workbookCanvasSelection';
import { resolveWorkbookCompareCellVisual } from '@/utils/workbook/workbookCompareVisuals';
import {
  drawWorkbookCanvasSelectionFrame,
  getWorkbookSelectionOverlay,
  getWorkbookSelectionVisualState,
} from '@/utils/workbook/workbookSelectionVisual';
import { buildWorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import {
  getWorkbookCanvasTextInsetRect,
  getWorkbookCanvasTextBaselineY,
  layoutWorkbookCanvasTextLines,
  normalizeWorkbookCanvasText,
} from '@/utils/workbook/workbookCanvasText';
import {
  createWorkbookCanvasBorderRegistry,
  resolveWorkbookCanvasCellBorderPriority,
} from '@/utils/workbook/workbookCanvasBorders';
import {
  getWorkbookCanvasDevicePixelRatio,
  syncWorkbookCanvasSurface,
} from '@/utils/workbook/workbookCanvasSurface';
import {
  resolveSharedWorkbookLineNumberTone,
} from '@/utils/diff/lineNumberTone';
import {
  resolveWorkbookRowGutterBackground,
  resolveWorkbookRowSelectionAccent,
  resolveWorkbookRowBorderColor,
  resolveWorkbookRowLineNumberColor,
  resolveWorkbookRowSurfaceBackground,
} from '@/utils/workbook/workbookRowVisuals';
import {
  clipWorkbookCanvasToViewport,
  findWorkbookMergeRange,
  getWorkbookCanvasCellViewportRect,
  getWorkbookCanvasHoverRowSegmentBounds,
  getWorkbookCanvasLayerViewports,
  getWorkbookCanvasRowSegmentCenterY,
  getWorkbookCanvasRowSegmentLineCenters,
  getWorkbookMergedCompareCellFromRows,
  getWorkbookCanvasSpanRect,
  getWorkbookColumnSpanBounds,
  getWorkbookMergeDrawInfo,
} from '@/utils/workbook/workbookMergeLayout';
import { useThemeTokens } from '@/context/theme';
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
import type { WorkbookCompactRenderMode } from '@/utils/workbook/workbookRowBehavior';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import useWorkbookCanvasHoverController from '@/components/workbook/useWorkbookCanvasHoverController';
import useWorkbookCanvasSelectionInteractions from '@/components/workbook/useWorkbookCanvasSelectionInteractions';

export interface WorkbookColumnsCanvasRow {
  row: SplitRow;
  renderMode: WorkbookCompactRenderMode;
  isSearchMatch: boolean;
  isActiveSearch: boolean;
  isGuided: boolean;
  isGuidedStart: boolean;
  isGuidedEnd: boolean;
}

interface WorkbookColumnsCanvasStripProps {
  rows: WorkbookColumnsCanvasRow[];
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
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
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  baseRowEntryByRowNumber: Map<number, WorkbookRowEntry>;
  mineRowEntryByRowNumber: Map<number, WorkbookRowEntry>;
  baseCompareCellsByRowNumber: Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>;
  mineCompareCellsByRowNumber: Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>;
  compareMode: WorkbookCompareMode;
}

function getSelectionModeFromMouseEvent(event: Pick<React.MouseEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
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
  baseCompareCellsByRowNumber,
  mineCompareCellsByRowNumber,
  compareMode,
}: WorkbookColumnsCanvasStripProps) => {
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const [dragPreviewActive, setDragPreviewActive] = useState(false);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const height = rows.length * ROW_H;
  const selectionLookup = useMemo(() => buildWorkbookSelectionLookup(selection), [selection]);
  const primarySelection = selection.primary;
  const renderedColumnNumbers = useMemo(() => renderColumns.map(entry => entry.column), [renderColumns]);

  const renderRows = useMemo(() => rows.map((renderRow) => {
    const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
    const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
    const rowDelta = buildWorkbookSplitRowCompareState(
      renderRow.row,
      visibleColumns,
      compareMode,
    );
    return {
      baseEntry,
      mineEntry,
      renderMode: renderRow.renderMode,
      rowTone: rowDelta.tone,
      compareCells: rowDelta.cellDeltas,
      isSearchMatch: renderRow.isSearchMatch,
      isActiveSearch: renderRow.isActiveSearch,
      isGuided: renderRow.isGuided,
      isGuidedStart: renderRow.isGuidedStart,
      isGuidedEnd: renderRow.isGuidedEnd,
    };
  }), [baseVersion, compareMode, mineVersion, rows, sheetName, visibleColumns]);
  const baseRenderedRowNumbers = useMemo(
    () => renderRows.map(renderRow => renderRow.baseEntry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderRows],
  );
  const mineRenderedRowNumbers = useMemo(
    () => renderRows.map(renderRow => renderRow.mineEntry?.rowNumber ?? -1).filter(rowNumber => rowNumber > 0),
    [renderRows],
  );
  const rowLayoutByRowNumber = useMemo(() => ({
    base: new Map(
      renderRows.flatMap((renderRow, rowIndex) => renderRow.baseEntry?.rowNumber != null
        ? [[renderRow.baseEntry.rowNumber, { top: rowIndex * ROW_H, height: ROW_H }]]
        : []),
    ),
    mine: new Map(
      renderRows.flatMap((renderRow, rowIndex) => renderRow.mineEntry?.rowNumber != null
        ? [[renderRow.mineEntry.rowNumber, { top: rowIndex * ROW_H, height: ROW_H }]]
        : []),
    ),
  }), [renderRows]);
  const columnPartition = useMemo(() => {
    const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);
    const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);
    const frozenPairWidth = frozenEntries.reduce((sum, entry) => sum + entry.displayWidth, 0);
    const contentLeft = LN_W + 3;
    return { frozenEntries, floatingEntries, frozenPairWidth, contentLeft };
  }, [renderColumns, freezeColumnCount]);

  const drawRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = getWorkbookCanvasDevicePixelRatio();
      const width = Math.max(1, Math.ceil(viewportWidth));
      const canvasHeight = Math.max(1, Math.ceil(height));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const contentRight = Math.min(width, contentWidth);
      syncWorkbookCanvasSurface(canvas, width, canvasHeight, dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, canvasHeight);
      ctx.fillStyle = T.bg0;
      ctx.fillRect(0, 0, width, canvasHeight);
      const floatingMergedDraws: Array<() => void> = [];
      const frozenMergedDraws: Array<() => void> = [];
      const deferredSelectionDraws = {
        floating: [] as Array<() => void>,
        frozen: [] as Array<() => void>,
      };
      const scrollBorderRegistry = createWorkbookCanvasBorderRegistry();
      const frozenBorderRegistry = createWorkbookCanvasBorderRegistry();

      const frozenPairWidth = columnPartition.frozenPairWidth;
      const contentLeft = columnPartition.contentLeft;
      const layerViewports = getWorkbookCanvasLayerViewports({
        contentLeft,
        contentRight,
        frozenWidth: frozenPairWidth,
      });
      const scrollViewport = layerViewports.scroll ?? layerViewports.content;
      const floatingEntries = columnPartition.floatingEntries;
      const frozenEntries = columnPartition.frozenEntries;
      const getRowBg = (renderRow: typeof renderRows[number]) => resolveWorkbookRowSurfaceBackground({
        theme: T,
        isGuided: renderRow.isGuided,
        isActiveSearch: renderRow.isActiveSearch,
        isSearchMatch: renderRow.isSearchMatch,
      });
      const drawRowChrome = (renderRow: typeof renderRows[number], rowIndex: number) => {
        const y = rowIndex * ROW_H;
        const rowBg = getRowBg(renderRow);
        const border = resolveWorkbookRowBorderColor(T, renderRow.rowTone);
        const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;

        const selectionAccent = resolveWorkbookRowSelectionAccent(
          T,
          primarySelection?.side === 'base' ? 'base' : 'mine',
        );
        const isSelectedRow = Boolean(
          selectionLookup.rowKeys.has(`${sheetName}:${rowNumber}`),
        );
        const lineNumberColor = resolveWorkbookRowLineNumberColor({
          theme: T,
          tone: renderRow.rowTone,
          fallbackTone: resolveSharedWorkbookLineNumberTone(
            Boolean(renderRow.baseEntry),
            Boolean(renderRow.mineEntry),
          ),
          active: renderRow.isActiveSearch,
        });

        ctx.fillStyle = rowBg;
        ctx.fillRect(0, y, contentRight, ROW_H);
        ctx.fillStyle = resolveWorkbookRowGutterBackground({
          theme: T,
          selectionAccent,
          isSelected: isSelectedRow,
        });
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
          : lineNumberColor;
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowNumber ? String(rowNumber) : '', LN_W - 8, y + (ROW_H / 2));
      };
      const drawCellsForLayer = (
        renderRow: typeof renderRows[number],
        rowIndex: number,
        entries: HorizontalVirtualColumnEntry[],
        layer: 'floating' | 'frozen',
      ) => {
        const y = rowIndex * ROW_H;
        const rowNumber = renderRow.baseEntry?.rowNumber ?? renderRow.mineEntry?.rowNumber ?? 0;
        const compactSide: 'base' | 'mine' = renderRow.renderMode === 'single-mine' ? 'mine' : 'base';
        const deferredMergedDraws = layer === 'floating' ? floatingMergedDraws : frozenMergedDraws;
        const deferredSelectionDrawBucket = layer === 'floating'
          ? deferredSelectionDraws.floating
          : deferredSelectionDraws.frozen;
        const borderRegistry = layer === 'floating' ? scrollBorderRegistry : frozenBorderRegistry;
        const drawCell = (
          side: 'base' | 'mine',
          columnEntry: HorizontalVirtualColumnEntry,
          drawX: number,
          options?: {
            spanMode?: 'paired-base' | 'paired-mine' | 'paired-shared';
            cellWidth?: number;
            defaultTextColor?: string;
          },
        ) => {
          const cellWidth = options?.cellWidth ?? columnEntry.width;
          if (drawX >= contentRight || drawX + cellWidth <= contentLeft) return;

          const column = columnEntry.column;
          const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
          if (!entry) {
            const compareCell = renderRow.compareCells.get(column);
            const placeholderCell = side === 'base'
              ? compareCell?.baseCell
              : compareCell?.mineCell;
            const cell = placeholderCell ?? { value: '', formula: '' };
            const hasContent = hasWorkbookCellContent(cell, compareMode);
            const cellVisual = resolveWorkbookCompareCellVisual({
              theme: T,
              compareCell,
              side,
              hasEntry: false,
              hasContent,
              hasBaseRow: Boolean(renderRow.baseEntry),
              hasMineRow: Boolean(renderRow.mineEntry),
              defaultTextColor: options?.defaultTextColor ?? (side === 'mine' ? T.t0 : T.t1),
            });

            ctx.fillStyle = cellVisual.background;
            ctx.fillRect(drawX, y, cellWidth, ROW_H);
            if (cellVisual.maskOverlay) {
              ctx.fillStyle = cellVisual.maskOverlay;
              ctx.fillRect(drawX, y, cellWidth, ROW_H);
            }
            borderRegistry.addRect({
              x: drawX,
              y,
              width: cellWidth,
              height: ROW_H,
              color: cellVisual.border,
              priority: resolveWorkbookCanvasCellBorderPriority(compareCell, false),
            });

            if (hasContent) {
              const textRect = getWorkbookCanvasTextInsetRect(drawX, y, cellWidth, ROW_H);
              ctx.save();
              ctx.beginPath();
              ctx.rect(textRect.left, textRect.top, textRect.width, textRect.height);
              ctx.clip();
              ctx.fillStyle = cellVisual.textColor;
              ctx.font = `${sizes.ui}px ${FONT_UI}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';
              ctx.fillText(
                normalizeWorkbookCanvasText(cell.value || '\u00A0').replace(/\n/g, ' / '),
                textRect.left,
                getWorkbookCanvasTextBaselineY(ctx, y + (ROW_H / 2), sizes.ui),
              );
              ctx.restore();
            }
            return;
          }
          const cellRowNumber = entry?.rowNumber ?? rowNumber;
          const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
          const renderedRowNumbers = side === 'base' ? baseRenderedRowNumbers : mineRenderedRowNumbers;
          const mergeInfo = getWorkbookMergeDrawInfo({
            rowNumber: cellRowNumber,
            column,
            rowTop: y,
            rowHeight: ROW_H,
            renderedRowNumbers,
            rowLayoutByRowNumber: rowLayoutByRowNumber[side],
            renderedColumns: renderedColumnNumbers,
            mergedRanges,
            columnLayoutByColumn,
            contentLeft,
            currentScrollLeft,
            freezeColumnCount,
            frozenWidth: frozenPairWidth,
            mode: options?.spanMode ?? (side === 'base' ? 'paired-base' : 'paired-mine'),
            layer: layer === 'frozen' ? 'frozen' : 'scroll',
          });
          if (mergeInfo.covered && !mergeInfo.region) return;

          const anchorRowNumber = mergeInfo.region?.range.startRow ?? cellRowNumber;
          const anchorColumn = mergeInfo.region?.range.startCol ?? column;
          const anchorEntry = (side === 'base' ? baseRowEntryByRowNumber : mineRowEntryByRowNumber).get(anchorRowNumber) ?? entry;
          const compareCellsByRowNumber = side === 'base' ? baseCompareCellsByRowNumber : mineCompareCellsByRowNumber;
          const cell = anchorEntry?.cells[anchorColumn] ?? { value: '', formula: '' };
          const compareCell = mergeInfo.region
            ? getWorkbookMergedCompareCellFromRows(compareCellsByRowNumber, mergeInfo.region.range)
            : renderRow.compareCells.get(column);
          const hasContent = hasWorkbookCellContent(cell, compareMode);
          const selectionRowNumber = anchorRowNumber;
          const selectionColumn = anchorColumn;
          const selectionVisual = getWorkbookSelectionVisualState(
            T,
            selectionLookup,
            sheetName,
            side,
            selectionRowNumber,
            selectionColumn,
            renderRow.isActiveSearch,
            dragPreviewActive,
            {
              startRow: mergeInfo.region?.range.startRow ?? selectionRowNumber,
              endRow: mergeInfo.region?.range.endRow ?? selectionRowNumber,
              startColumn: mergeInfo.region?.range.startCol ?? selectionColumn,
              endColumn: mergeInfo.region?.range.endCol ?? selectionColumn,
            },
          );
          const cellVisual = resolveWorkbookCompareCellVisual({
            theme: T,
            compareCell,
            side,
            hasEntry: Boolean(entry),
            hasContent,
            hasBaseRow: Boolean(renderRow.baseEntry),
            hasMineRow: Boolean(renderRow.mineEntry),
            defaultTextColor: options?.defaultTextColor ?? (side === 'mine' ? T.t0 : T.t1),
          });
          const regionLeft = mergeInfo.region?.left ?? drawX;
          const regionTop = mergeInfo.region?.top ?? y;
          const regionWidth = mergeInfo.region?.width ?? cellWidth;
          const regionHeight = mergeInfo.region?.height ?? ROW_H;
          const regionSegments = mergeInfo.region?.segments ?? [{ left: regionLeft, width: regionWidth }];
          const rowSegments = mergeInfo.region?.rowSegments ?? [{ top: regionTop, height: regionHeight }];
          const selectionSegments = regionSegments;
          const selectionTop = regionTop;
          const selectionHeight = regionHeight;
          const textCenterY = getWorkbookCanvasRowSegmentCenterY(rowSegments) ?? (regionTop + (regionHeight / 2));
          const textRect = getWorkbookCanvasTextInsetRect(regionLeft, regionTop, regionWidth, regionHeight);
          const textX = textRect.left;
          const centerMergedText = Boolean(mergeInfo.region && regionSegments.length === 1);
          const withRowSegmentClip = (callback: () => void) => {
            ctx.save();
            ctx.beginPath();
            rowSegments.forEach((rowSegment) => {
              regionSegments.forEach((segment) => {
                ctx.rect(segment.left, rowSegment.top, segment.width, rowSegment.height);
              });
            });
            ctx.clip();
            callback();
            ctx.restore();
          };

          const paintRegion = () => {
            ctx.fillStyle = cellVisual.background;
            withRowSegmentClip(() => {
              regionSegments.forEach((segment) => {
                ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
              });
            });
            if (cellVisual.maskOverlay && !selectionVisual.hasSelectionHighlight) {
              ctx.fillStyle = cellVisual.maskOverlay;
              withRowSegmentClip(() => {
                regionSegments.forEach((segment) => {
                  ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
                });
              });
            }
            const selectionOverlay = getWorkbookSelectionOverlay(selectionVisual);
            if (selectionOverlay) {
              ctx.fillStyle = selectionOverlay;
              withRowSegmentClip(() => {
                selectionSegments.forEach((segment) => {
                  ctx.fillRect(segment.left, selectionTop, segment.width, selectionHeight);
                });
              });
            }
            withRowSegmentClip(() => {
              regionSegments.forEach((segment) => {
                borderRegistry.addRect({
                  x: segment.left,
                  y: regionTop,
                  width: segment.width,
                  height: regionHeight,
                  color: cellVisual.border,
                  priority: resolveWorkbookCanvasCellBorderPriority(compareCell, Boolean(entry)),
                });
              });
            });
            deferredSelectionDrawBucket.push(() => {
              withRowSegmentClip(() => {
                selectionSegments.forEach((segment) => {
                  drawWorkbookCanvasSelectionFrame(ctx, segment.left, selectionTop, segment.width, selectionHeight, selectionVisual);
                });
              });
            });

            ctx.save();
            ctx.beginPath();
            rowSegments.forEach((rowSegment) => {
              regionSegments.forEach((segment) => {
                const insetRect = getWorkbookCanvasTextInsetRect(
                  segment.left,
                  rowSegment.top,
                  segment.width,
                  rowSegment.height,
                );
                ctx.rect(insetRect.left, insetRect.top, insetRect.width, insetRect.height);
              });
            });
            ctx.clip();
            ctx.fillStyle = cellVisual.textColor;
            ctx.font = `${sizes.ui}px ${FONT_UI}`;
            ctx.textBaseline = 'alphabetic';
            if (centerMergedText) {
              const lineHeight = Math.max(sizes.ui + 4, 16);
              const maxLines = Math.max(1, rowSegments.reduce((sum, rowSegment) => (
                sum + Math.max(1, Math.floor(Math.max(0, rowSegment.height - 4) / lineHeight))
              ), 0));
              const lines = layoutWorkbookCanvasTextLines({
                value: cell.value || '',
                maxWidth: textRect.width,
                maxLines,
                measureText: (value) => ctx.measureText(value).width,
              });
              ctx.textAlign = 'center';
              const lineCenters = getWorkbookCanvasRowSegmentLineCenters(rowSegments, lines.length, lineHeight);
              lines.forEach((line, index) => {
                ctx.fillText(
                  line,
                  regionLeft + (regionWidth / 2),
                  getWorkbookCanvasTextBaselineY(ctx, lineCenters[index] ?? textCenterY, sizes.ui),
                );
              });
            } else {
              ctx.textAlign = 'left';
              ctx.fillText(
                normalizeWorkbookCanvasText(cell.value || '\u00A0').replace(/\n/g, ' / '),
                textX,
                getWorkbookCanvasTextBaselineY(ctx, textCenterY, sizes.ui),
              );
            }
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
        const drawCompact = (columnEntry: HorizontalVirtualColumnEntry, drawX: number) => {
          drawCell(compactSide, columnEntry, drawX, {
            spanMode: 'paired-shared',
            cellWidth: columnEntry.displayWidth,
            defaultTextColor: compactSide === 'mine' ? T.t0 : T.t1,
          });
        };

        entries.forEach((columnEntry) => {
          if (layer === 'frozen') {
            const frozenX = contentLeft + columnEntry.offset;
            if (frozenX > contentRight) return;
            if (renderRow.renderMode === 'double') {
              drawPair(columnEntry, frozenX);
              return;
            }
            drawCompact(columnEntry, frozenX);
            return;
          }

          const x = contentLeft + columnEntry.offset - currentScrollLeft;
          if (x > contentRight || x + columnEntry.displayWidth <= contentLeft) return;
          if (renderRow.renderMode === 'double') {
            drawPair(columnEntry, x);
            return;
          }
          drawCompact(columnEntry, x);
        });
      };
      const drawFrozenBackdrops = () => {
        const frozenViewport = layerViewports.frozen;
        if (!frozenViewport) return;
        renderRows.forEach((renderRow, rowIndex) => {
          const y = rowIndex * ROW_H;
          ctx.fillStyle = getRowBg(renderRow);
          ctx.fillRect(frozenViewport.left, y, frozenViewport.width, ROW_H);
        });
      };

      renderRows.forEach(drawRowChrome);

      if (scrollViewport.width > 0) {
        renderRows.forEach((renderRow, rowIndex) => {
          clipWorkbookCanvasToViewport(ctx, scrollViewport, rowIndex * ROW_H, ROW_H, () => {
            drawCellsForLayer(renderRow, rowIndex, floatingEntries, 'floating');
          });
        });
      }

      if (floatingMergedDraws.length > 0 && scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, canvasHeight, () => {
          floatingMergedDraws.forEach((paintRegion) => paintRegion());
        });
      }

      drawFrozenBackdrops();

      const frozenViewport = layerViewports.frozen;

      if (frozenViewport) {
        renderRows.forEach((renderRow, rowIndex) => {
          clipWorkbookCanvasToViewport(ctx, frozenViewport, rowIndex * ROW_H, ROW_H, () => {
            drawCellsForLayer(renderRow, rowIndex, frozenEntries, 'frozen');
          });
        });
      }

      if (frozenMergedDraws.length > 0 && frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, canvasHeight, () => {
          frozenMergedDraws.forEach((paintRegion) => paintRegion());
        });
      }

      if (scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, canvasHeight, () => {
          scrollBorderRegistry.flush(ctx);
        });
      }
      if (frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, canvasHeight, () => {
          frozenBorderRegistry.flush(ctx);
        });
      }
      if (scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, canvasHeight, () => {
          deferredSelectionDraws.floating.forEach((drawSelection) => drawSelection());
        });
      }
      if (frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, canvasHeight, () => {
          deferredSelectionDraws.frozen.forEach((drawSelection) => drawSelection());
        });
      }

      if (frozenViewport) {
        ctx.fillStyle = `${T.border2}55`;
        ctx.fillRect(frozenViewport.left + frozenViewport.width - 1, 0, 1, canvasHeight);
      }

      ctx.restore();
    };

    drawRef.current = draw;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [baseCompareCellsByRowNumber, baseMergedRanges, baseRenderedRowNumbers, baseRowEntryByRowNumber, columnLayoutByColumn, columnPartition, compareMode, contentWidth, dragPreviewActive, freezeColumnCount, height, mineCompareCellsByRowNumber, mineMergedRanges, mineRenderedRowNumbers, mineRowEntryByRowNumber, primarySelection?.side, renderedColumnNumbers, renderColumns, renderRows, rowLayoutByRowNumber, scrollRef, selectionLookup, sheetName, sizes.line, sizes.ui, T, viewportWidth]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let lastScrollLeft = scroller.scrollLeft ?? 0;
    const onScroll = () => {
      const nextScrollLeft = scroller.scrollLeft ?? 0;
      if (nextScrollLeft === lastScrollLeft) return;
      lastScrollLeft = nextScrollLeft;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        drawRef.current();
      });
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef]);

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

    const contentLeft = columnPartition.contentLeft;
    const selectionKind = resolveWorkbookCanvasSelectionKind({
      hitX: x,
      contentLeft,
      rowNumber,
      headerRowNumber,
    });
    if (selectionKind === 'row') {
      const rowSide: 'base' | 'mine' = renderRow.renderMode === 'single-mine'
        ? 'mine'
        : renderRow.renderMode === 'single-base'
        ? 'base'
        : (primarySelection?.side ?? 'base');
      return {
        selection: {
          kind: 'row',
          sheetName,
          side: rowSide,
          versionLabel: rowSide === 'mine'
            ? (primarySelection?.side === 'mine' ? (primarySelection.versionLabel ?? mineVersion) : mineVersion)
            : (primarySelection?.side === 'base' ? (primarySelection.versionLabel ?? baseVersion) : baseVersion),
          rowNumber,
          colIndex: primarySelection?.colIndex ?? 0,
          colLabel: primarySelection?.colLabel ?? 'A',
          address: `${rowNumber}`,
          value: '',
          formula: '',
        },
        hover: null,
      };
    }

    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const frozenPairWidth = columnPartition.frozenPairWidth;
    const hitEntry = renderColumns.find((entryMeta) => {
      const drawX = entryMeta.position < freezeColumnCount
        ? contentLeft + entryMeta.offset
        : contentLeft + entryMeta.offset - currentScrollLeft;
      const viewportRect = getWorkbookCanvasCellViewportRect({
        drawLeft: drawX,
        drawWidth: entryMeta.displayWidth,
        contentLeft,
        frozenWidth: frozenPairWidth,
        frozen: entryMeta.position < freezeColumnCount,
      });
      return viewportRect != null && x >= viewportRect.left && x < viewportRect.left + viewportRect.width;
    });
    if (!hitEntry) return null;

    const pairX = hitEntry.position < freezeColumnCount
      ? contentLeft + hitEntry.offset
      : contentLeft + hitEntry.offset - currentScrollLeft;
    const withinPairX = x - pairX;
    const side: 'base' | 'mine' = renderRow.renderMode === 'single-mine'
      ? 'mine'
      : renderRow.renderMode === 'double'
      ? (withinPairX < hitEntry.width ? 'base' : 'mine')
      : 'base';
    const column = hitEntry.column;
    const entry = side === 'base' ? renderRow.baseEntry : renderRow.mineEntry;
    if (!entry) return null;
    const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
    const rowEntryByRowNumber = side === 'base' ? baseRowEntryByRowNumber : mineRowEntryByRowNumber;
    const mergeRange = findWorkbookMergeRange(mergedRanges, entry.rowNumber, column);
    const anchorRowNumber = mergeRange?.startRow ?? entry.rowNumber;
    const anchorColumn = mergeRange?.startCol ?? column;
    const anchorEntry = rowEntryByRowNumber.get(anchorRowNumber) ?? entry;
    const compareCellsByRowNumber = side === 'base' ? baseCompareCellsByRowNumber : mineCompareCellsByRowNumber;
    const bounds = getWorkbookColumnSpanBounds(
      mergeRange?.startCol ?? column,
      mergeRange?.endCol ?? column,
      columnLayoutByColumn,
      renderRow.renderMode === 'double'
        ? (side === 'base' ? 'paired-base' : 'paired-mine')
        : 'paired-shared',
      freezeColumnCount,
    );
    const spanRect = bounds
      ? getWorkbookCanvasSpanRect(bounds, contentLeft, currentScrollLeft, frozenPairWidth)
      : null;
    const rawCellX = renderRow.renderMode === 'double'
      ? (side === 'base' ? pairX : pairX + hitEntry.width)
      : pairX;
    const rawCellWidth = renderRow.renderMode === 'double' ? hitEntry.width : hitEntry.displayWidth;
    const viewportRect = getWorkbookCanvasCellViewportRect({
      drawLeft: rawCellX,
      drawWidth: rawCellWidth,
      contentLeft,
      frozenWidth: frozenPairWidth,
      frozen: hitEntry.position < freezeColumnCount,
    });
    const compareCell = mergeRange
      ? getWorkbookMergedCompareCellFromRows(compareCellsByRowNumber, mergeRange)
      : compareCellsByRowNumber.get(anchorRowNumber)?.get(column) ?? renderRow.compareCells.get(column);
    const cellX = spanRect?.left ?? viewportRect?.left ?? rawCellX;
    const cellWidth = spanRect?.width ?? viewportRect?.width ?? rawCellWidth;
    const mergeDrawInfo = getWorkbookMergeDrawInfo({
      rowNumber: entry.rowNumber,
      column,
      rowTop: rowIndex * ROW_H,
      rowHeight: ROW_H,
      renderedRowNumbers: side === 'base' ? baseRenderedRowNumbers : mineRenderedRowNumbers,
      rowLayoutByRowNumber: rowLayoutByRowNumber[side],
      renderedColumns: renderedColumnNumbers,
      mergedRanges,
      columnLayoutByColumn,
      contentLeft,
      currentScrollLeft,
      freezeColumnCount,
      frozenWidth: frozenPairWidth,
      mode: renderRow.renderMode === 'double'
        ? (side === 'base' ? 'paired-base' : 'paired-mine')
        : 'paired-shared',
      layer: 'content',
    });
    const hoverRowSegments = mergeDrawInfo.region?.rowSegments ?? [{ top: rowIndex * ROW_H, height: ROW_H }];
    const hoverBounds = getWorkbookCanvasHoverRowSegmentBounds(hoverRowSegments, y)
      ?? { top: rowIndex * ROW_H, height: ROW_H };
    const hoverTop = hoverRowSegments.length > 1
      ? hoverBounds.top
      : (mergeDrawInfo.region?.top ?? hoverBounds.top);
    const hoverHeight = hoverRowSegments.length > 1
      ? hoverBounds.height
      : (mergeDrawInfo.region?.height ?? hoverBounds.height);
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
            top: canvasRect.top + hoverTop,
            width: cellWidth,
            height: hoverHeight,
            right: canvasRect.left + cellX + cellWidth,
            bottom: canvasRect.top + hoverTop + hoverHeight,
          },
          address: selected.address,
          displayValue: selected.value,
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
          top: canvasRect.top + hoverTop,
          width: cellWidth,
          height: hoverHeight,
          right: canvasRect.left + cellX + cellWidth,
          bottom: canvasRect.top + hoverTop + hoverHeight,
        },
        address: selected.address,
        displayValue: selected.value,
        compareCell,
      } : null,
    };
  };

  const resolveHoverAtPointer = (
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): WorkbookCanvasHoverCell | null => {
    const rect = canvas.getBoundingClientRect();
    const hit = resolveHit(clientX - rect.left, clientY - rect.top, rect);
    return hit?.hover ?? null;
  };

  const { handleMouseMove, clearHover } = useWorkbookCanvasHoverController(resolveHoverAtPointer, onHoverChange);
  const selectionInteractions = useWorkbookCanvasSelectionInteractions({
    canvasRef,
    resolveHit,
    onSelectionRequest,
    clearHover,
    scrollRef,
    onDragSelectingChange: setDragPreviewActive,
  });

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectionInteractions.isPointerSelectingRef.current) return;
    handleMouseMove(event);
  }, [handleMouseMove, selectionInteractions]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (selectionInteractions.isPointerSelectingRef.current) return;
    clearHover();
  }, [clearHover, selectionInteractions]);

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left, event.clientY - rect.top, rect);
    if (!hit) return;
    event.preventDefault();
    clearHover();
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
      onPointerDown={selectionInteractions.handlePointerDown}
      onPointerMove={selectionInteractions.handlePointerMove}
      onPointerUp={selectionInteractions.handlePointerUp}
      onPointerCancel={selectionInteractions.handlePointerCancel}
      onLostPointerCapture={selectionInteractions.handleLostPointerCapture}
      onContextMenu={handleContextMenu}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={handleCanvasMouseLeave}
      style={{
        display: 'block',
        cursor: 'pointer',
        backfaceVisibility: 'hidden',
        touchAction: 'none',
      }}
    />
  );
});

export default WorkbookColumnsCanvasStrip;
