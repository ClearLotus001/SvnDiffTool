import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { LN_W } from '@/constants/layout';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '@/constants/typography';
import { hasWorkbookCellContent } from '@/utils/workbook/workbookCellContract';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { buildWorkbookRowEntry, buildWorkbookSelectedCell, type WorkbookRowEntry } from '@/utils/workbook/workbookNavigation';
import { resolveWorkbookCanvasSelectionKind } from '@/utils/workbook/workbookCanvasSelection';
import {
  getWorkbookMergeContinuationVisual,
  resolveWorkbookCompareCellVisual,
} from '@/utils/workbook/workbookCompareVisuals';
import {
  clipWorkbookCanvasToViewport,
  getWorkbookCanvasCellViewportRect,
  getWorkbookCanvasHoverRowSegmentBounds,
  getWorkbookCanvasLayerViewports,
  getWorkbookCanvasRowSegmentBounds,
  getWorkbookCanvasRowSegmentCenterY,
  getWorkbookCanvasRowSegmentLineCenters,
  findWorkbookMergeRange,
  getWorkbookMergedCompareCellFromRows,
  getWorkbookCanvasSpanRect,
  getWorkbookColumnSpanBounds,
  getWorkbookMergeDrawInfo,
  getWorkbookMergedCompareCell,
} from '@/utils/workbook/workbookMergeLayout';
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
  resolveWorkbookStackedLineNumberTone,
} from '@/utils/diff/lineNumberTone';
import {
  resolveWorkbookRowGutterBackground,
  resolveWorkbookRowSelectionAccent,
  resolveWorkbookRowBorderColor,
  resolveWorkbookRowLineNumberColor,
  resolveWorkbookRowRuleColor,
  resolveWorkbookRowSurfaceBackground,
} from '@/utils/workbook/workbookRowVisuals';
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
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import useWorkbookCanvasHoverController from '@/components/workbook/useWorkbookCanvasHoverController';
import useWorkbookCanvasSelectionInteractions from '@/components/workbook/useWorkbookCanvasSelectionInteractions';
import {
  getWorkbookStackedBandDisplayRowNumber,
  getWorkbookStackedVisibleBands,
} from '@/utils/workbook/workbookRowBehavior';

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

export interface WorkbookCanvasRenderGroup {
  key: string;
  rows: WorkbookCanvasRenderRow[];
  height: number;
  hasVerticalMerge: boolean;
  baseTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
  mineTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
}

interface WorkbookStackedCanvasStripProps {
  groups: WorkbookCanvasRenderGroup[];
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
  compareMode: WorkbookCompareMode;
}

interface CanvasBand {
  groupKey: string;
  entry: WorkbookRowEntry | null;
  displayRowNumber: number | null;
  side: 'base' | 'mine';
  tone: 'neutral' | 'add' | 'delete';
  hasCompanionBand: boolean;
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

interface CanvasGroupFrame {
  key: string;
  top: number;
  height: number;
  rows: WorkbookCanvasRenderRow[];
  baseTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
  mineTrack: Array<{ sourceRowIndex: number; rowNumber: number }>;
}

interface CanvasRowFrame {
  sourceRowIndex: number;
  top: number;
  renderRow: WorkbookCanvasRenderRow;
  baseEntry: WorkbookRowEntry | null;
  mineEntry: WorkbookRowEntry | null;
  rowDelta: ReturnType<typeof buildWorkbookSplitRowCompareState>;
  hasBaseRow: boolean;
  hasMineRow: boolean;
  rowHighlightBg?: string | undefined;
}

interface CanvasGroupRuntime {
  frame: CanvasGroupFrame;
  rowFrames: CanvasRowFrame[];
  rowFrameBySourceIndex: Map<number, CanvasRowFrame>;
  visibleBandsBySourceRowIndex: Map<number, {
    base?: { top: number; height: number };
    mine?: { top: number; height: number };
  }>;
  renderedRowNumbers: {
    base: number[];
    mine: number[];
  };
  bandPositionBySideRowNumber: {
    base: Map<number, { top: number; height: number }>;
    mine: Map<number, { top: number; height: number }>;
  };
  entryBySideRowNumber: {
    base: Map<number, WorkbookRowEntry>;
    mine: Map<number, WorkbookRowEntry>;
  };
  compareCellsBySideRowNumber: {
    base: Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>;
    mine: Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>;
  };
}

function getSelectionModeFromMouseEvent(event: Pick<React.MouseEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
}

const WorkbookStackedCanvasStrip = memo(({
  groups,
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
  compareMode,
}: WorkbookStackedCanvasStripProps) => {
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const [dragPreviewActive, setDragPreviewActive] = useState(false);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const renderedColumnNumbers = useMemo(() => renderColumns.map(entry => entry.column), [renderColumns]);
  const groupFrames = useMemo<CanvasGroupFrame[]>(
    () => {
      let cursorTop = 0;
      return groups.map((group) => {
        const frame = {
          key: group.key,
          top: cursorTop,
          height: group.height,
          rows: group.rows,
          baseTrack: group.baseTrack,
          mineTrack: group.mineTrack,
        };
        cursorTop += group.height;
        return frame;
      });
    },
    [groups],
  );
  const totalHeight = useMemo(() => groupFrames.reduce((sum, group) => sum + group.height, 0), [groupFrames]);
  const selectionLookup = useMemo(() => buildWorkbookSelectionLookup(selection), [selection]);
  const primarySelection = selection.primary;

  const groupRuntimes = useMemo<CanvasGroupRuntime[]>(() => {
    return groupFrames.map((groupFrame) => {
      let cursorY = groupFrame.top;
      const rowFrames = groupFrame.rows.map((renderRow, sourceRowIndex) => {
        const baseEntry = buildWorkbookRowEntry(renderRow.row, 'base', sheetName, baseVersion, visibleColumns);
        const mineEntry = buildWorkbookRowEntry(renderRow.row, 'mine', sheetName, mineVersion, visibleColumns);
        const rowDelta = buildWorkbookSplitRowCompareState(
          renderRow.row,
          visibleColumns,
          compareMode,
        );
        const hasBaseRow = Boolean(baseEntry);
        const hasMineRow = Boolean(mineEntry);
        const rowHighlightBg = resolveWorkbookRowSurfaceBackground({
          theme: T,
          isGuided: renderRow.isGuided,
          isActiveSearch: renderRow.isActiveSearch,
          isSearchMatch: renderRow.isSearchMatch,
        });
        const frame = {
          sourceRowIndex,
          top: cursorY,
          renderRow,
          baseEntry,
          mineEntry,
          rowDelta,
          hasBaseRow,
          hasMineRow,
          rowHighlightBg,
        };
        cursorY += renderRow.height;
        return frame;
      });

      const rowFrameBySourceIndex = new Map(rowFrames.map((rowFrame) => [rowFrame.sourceRowIndex, rowFrame]));
      const rowOffsetTops = rowFrames.map((rowFrame) => rowFrame.top);
      const runtime: CanvasGroupRuntime = {
        frame: groupFrame,
        rowFrames,
        rowFrameBySourceIndex,
        visibleBandsBySourceRowIndex: new Map<number, {
          base?: { top: number; height: number };
          mine?: { top: number; height: number };
        }>(),
        renderedRowNumbers: {
          base: groupFrame.baseTrack.map((track) => track.rowNumber),
          mine: groupFrame.mineTrack.map((track) => track.rowNumber),
        },
        bandPositionBySideRowNumber: {
          base: new Map<number, { top: number; height: number }>(),
          mine: new Map<number, { top: number; height: number }>(),
        },
        entryBySideRowNumber: {
          base: new Map<number, WorkbookRowEntry>(),
          mine: new Map<number, WorkbookRowEntry>(),
        },
        compareCellsBySideRowNumber: {
          base: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
          mine: new Map<number, ReturnType<typeof buildWorkbookSplitRowCompareState>['cellDeltas']>(),
        },
      };

      groupFrame.baseTrack.forEach((track) => {
        const rowFrame = rowFrameBySourceIndex.get(track.sourceRowIndex);
        const top = rowOffsetTops[track.sourceRowIndex] ?? groupFrame.top;
        runtime.bandPositionBySideRowNumber.base.set(track.rowNumber, {
          top,
          height: ROW_H,
        });
        const visibleBands = runtime.visibleBandsBySourceRowIndex.get(track.sourceRowIndex) ?? {};
        visibleBands.base = { top, height: ROW_H };
        runtime.visibleBandsBySourceRowIndex.set(track.sourceRowIndex, visibleBands);
        if (rowFrame) {
          if (rowFrame.baseEntry) {
            runtime.entryBySideRowNumber.base.set(track.rowNumber, rowFrame.baseEntry);
          }
          runtime.compareCellsBySideRowNumber.base.set(track.rowNumber, rowFrame.rowDelta.cellDeltas);
        }
      });

      groupFrame.mineTrack.forEach((track) => {
        const rowFrame = rowFrameBySourceIndex.get(track.sourceRowIndex);
        const baseTop = rowOffsetTops[track.sourceRowIndex] ?? groupFrame.top;
        const top = rowFrame && rowFrame.renderRow.height > ROW_H ? baseTop + ROW_H : baseTop;
        runtime.bandPositionBySideRowNumber.mine.set(track.rowNumber, {
          top,
          height: ROW_H,
        });
        const visibleBands = runtime.visibleBandsBySourceRowIndex.get(track.sourceRowIndex) ?? {};
        if (rowFrame && getWorkbookStackedVisibleBands(
          Boolean(rowFrame.baseEntry),
          Boolean(rowFrame.mineEntry),
          rowFrame.renderRow.height,
        ).mine) {
          visibleBands.mine = { top, height: ROW_H };
          runtime.visibleBandsBySourceRowIndex.set(track.sourceRowIndex, visibleBands);
        }
        if (rowFrame) {
          if (rowFrame.mineEntry) {
            runtime.entryBySideRowNumber.mine.set(track.rowNumber, rowFrame.mineEntry);
          }
          runtime.compareCellsBySideRowNumber.mine.set(track.rowNumber, rowFrame.rowDelta.cellDeltas);
        }
      });

      rowFrames.forEach((rowFrame) => {
        const visibleBandPlan = getWorkbookStackedVisibleBands(
          Boolean(rowFrame.baseEntry),
          Boolean(rowFrame.mineEntry),
          rowFrame.renderRow.height,
        );
        const visibleBands = runtime.visibleBandsBySourceRowIndex.get(rowFrame.sourceRowIndex) ?? {};
        if (visibleBandPlan.base) {
          visibleBands.base ??= { top: rowFrame.top, height: ROW_H };
        }
        if (visibleBandPlan.mine) {
          visibleBands.mine ??= {
            top: rowFrame.renderRow.height > ROW_H ? rowFrame.top + ROW_H : rowFrame.top,
            height: ROW_H,
          };
        }
        runtime.visibleBandsBySourceRowIndex.set(rowFrame.sourceRowIndex, visibleBands);
      });

      return runtime;
    });
  }, [T, baseVersion, compareMode, groupFrames, mineVersion, sheetName, visibleColumns]);
  const groupRuntimeByKey = useMemo(
    () => new Map(groupRuntimes.map((runtime) => [runtime.frame.key, runtime])),
    [groupRuntimes],
  );
  const renderBands = useMemo(() => {
    const bands: CanvasBand[] = [];

    groupRuntimes.forEach((runtime) => {
      const groupBands: CanvasBand[] = [];

      runtime.rowFrames.forEach((rowFrame) => {
        const visibleBands = runtime.visibleBandsBySourceRowIndex.get(rowFrame.sourceRowIndex) ?? {};
        const hasCompanionBand = Boolean(visibleBands.base && visibleBands.mine);
        const useSideAccentForChanges = hasCompanionBand;

        if (visibleBands.base) {
          const tone: CanvasBand['tone'] = rowFrame.renderRow.row.left?.type === 'delete'
            ? 'delete'
            : (!rowFrame.baseEntry && rowFrame.renderRow.row.right?.type === 'add')
            ? 'add'
            : 'neutral';

          groupBands.push({
            groupKey: runtime.frame.key,
            entry: rowFrame.baseEntry,
            displayRowNumber: getWorkbookStackedBandDisplayRowNumber(
              'base',
              rowFrame.baseEntry?.rowNumber ?? null,
              rowFrame.mineEntry?.rowNumber ?? null,
            ),
            side: 'base',
            tone,
            hasCompanionBand,
            useSideAccentForChanges,
            compareCells: rowFrame.rowDelta.cellDeltas,
            hasBaseRow: rowFrame.hasBaseRow,
            hasMineRow: rowFrame.hasMineRow,
            y: visibleBands.base.top,
            height: ROW_H,
            isGuided: rowFrame.renderRow.isGuided,
            isActiveSearch: rowFrame.renderRow.isActiveSearch,
            rowHighlightBg: rowFrame.rowHighlightBg,
          });
        }

        if (visibleBands.mine) {
          const tone: CanvasBand['tone'] = rowFrame.renderRow.row.right?.type === 'add'
            ? 'add'
            : (!rowFrame.mineEntry && rowFrame.renderRow.row.left?.type === 'delete')
            ? 'delete'
            : 'neutral';

          groupBands.push({
            groupKey: runtime.frame.key,
            entry: rowFrame.mineEntry,
            displayRowNumber: getWorkbookStackedBandDisplayRowNumber(
              'mine',
              rowFrame.baseEntry?.rowNumber ?? null,
              rowFrame.mineEntry?.rowNumber ?? null,
            ),
            side: 'mine',
            tone,
            hasCompanionBand,
            useSideAccentForChanges,
            compareCells: rowFrame.rowDelta.cellDeltas,
            hasBaseRow: rowFrame.hasBaseRow,
            hasMineRow: rowFrame.hasMineRow,
            y: visibleBands.mine.top,
            height: ROW_H,
            isGuided: rowFrame.renderRow.isGuided,
            isActiveSearch: rowFrame.renderRow.isActiveSearch,
            rowHighlightBg: rowFrame.rowHighlightBg,
          });
        }
      });

      groupBands.sort((left, right) => (
        left.y - right.y
        || (left.side === right.side ? 0 : left.side === 'base' ? -1 : 1)
      ));
      bands.push(...groupBands);
    });

    return bands;
  }, [groupRuntimes]);

  const columnPartition = useMemo(() => {
    const frozenEntries = renderColumns.filter(column => column.position < freezeColumnCount);
    const floatingEntries = renderColumns.filter(column => column.position >= freezeColumnCount);
    const frozenWidth = frozenEntries.reduce((sum, entry) => sum + entry.displayWidth, 0);
    const contentLeft = LN_W + 3;
    return { frozenEntries, floatingEntries, frozenWidth, contentLeft };
  }, [renderColumns, freezeColumnCount]);

  const drawRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = getWorkbookCanvasDevicePixelRatio();
      const width = Math.max(1, Math.ceil(viewportWidth));
      const height = Math.max(1, Math.ceil(totalHeight));
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const contentRight = Math.min(width, contentWidth);
      syncWorkbookCanvasSurface(canvas, width, height, dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = T.bg0;
      ctx.fillRect(0, 0, width, height);
      const floatingMergedDraws: Array<() => void> = [];
      const frozenMergedDraws: Array<() => void> = [];
      const deferredSelectionDraws = {
        floating: [] as Array<() => void>,
        frozen: [] as Array<() => void>,
      };
      const scrollBorderRegistry = createWorkbookCanvasBorderRegistry();
      const frozenBorderRegistry = createWorkbookCanvasBorderRegistry();

      const { frozenWidth, contentLeft, frozenEntries, floatingEntries } = columnPartition;
      const layerViewports = getWorkbookCanvasLayerViewports({
        contentLeft,
        contentRight,
        frozenWidth,
      });
      const scrollViewport = layerViewports.scroll ?? layerViewports.content;
      const drawBandChrome = (band: CanvasBand) => {
        const entry = band.entry;
        const y = band.y;
        const h = band.height;
        const rowNumber = band.displayRowNumber ?? entry?.rowNumber ?? 0;
        const rowBg = band.rowHighlightBg ?? T.bg0;
        const selectionAccent = resolveWorkbookRowSelectionAccent(T, band.side);
        const sideAccent = band.useSideAccentForChanges ? band.side : null;
        const bandBorder = resolveWorkbookRowBorderColor(T, band.tone, sideAccent);
        const bandRule = resolveWorkbookRowRuleColor(T, band.tone, sideAccent);
        const isSelectedRow = Boolean(
          selectionLookup.rowKeys.has(`${sheetName}:${rowNumber}`),
        );
        const lineNumberTone = resolveWorkbookStackedLineNumberTone({
          side: band.side,
          hasCompanionBand: band.hasCompanionBand,
          tone: band.tone,
          hasBaseRow: band.hasBaseRow,
          hasMineRow: band.hasMineRow,
        });

        ctx.fillStyle = rowBg;
        ctx.fillRect(0, y, contentRight, h);

        ctx.fillStyle = resolveWorkbookRowGutterBackground({
          theme: T,
          selectionAccent,
          isSelected: isSelectedRow,
        });
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
          : resolveWorkbookRowLineNumberColor({
            theme: T,
            tone: band.useSideAccentForChanges ? 'equal' : band.tone,
            fallbackTone: lineNumberTone,
            active: band.isActiveSearch,
          });
        ctx.font = `${sizes.line}px ${FONT_CODE}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rowNumber || ''), LN_W - 8, y + (h / 2));
      };
      const drawBandCells = (
        band: CanvasBand,
        entries: HorizontalVirtualColumnEntry[],
        layer: 'floating' | 'frozen',
      ) => {
        const entry = band.entry;
        const y = band.y;
        const h = band.height;
        const groupRuntime = groupRuntimeByKey.get(band.groupKey);
        if (!groupRuntime) return;
        const rowNumber = entry?.rowNumber ?? 0;
        const cellTextColor = band.side === 'mine' ? T.t0 : T.t1;
        const deferredMergedDraws = layer === 'floating' ? floatingMergedDraws : frozenMergedDraws;
        const deferredSelectionDrawBucket = layer === 'floating'
          ? deferredSelectionDraws.floating
          : deferredSelectionDraws.frozen;
        const borderRegistry = layer === 'floating' ? scrollBorderRegistry : frozenBorderRegistry;
        const drawCell = (entryMeta: HorizontalVirtualColumnEntry, drawX: number) => {
          if (drawX >= contentRight || drawX + entryMeta.width <= contentLeft) return;

          if (!entry) {
            const compareCell = band.compareCells.get(entryMeta.column);
            const placeholderCell = band.side === 'base'
              ? compareCell?.baseCell
              : compareCell?.mineCell;
            const cell = placeholderCell ?? { value: '', formula: '' };
            const hasContent = hasWorkbookCellContent(cell, compareMode);
            const cellVisual = resolveWorkbookCompareCellVisual({
              theme: T,
              compareCell,
              side: band.side,
              hasEntry: false,
              hasContent,
              hasBaseRow: band.hasBaseRow,
              hasMineRow: band.hasMineRow,
              defaultTextColor: cellTextColor,
            });

            ctx.fillStyle = cellVisual.background;
            ctx.fillRect(drawX, y, entryMeta.width, h);
            if (cellVisual.maskOverlay) {
              ctx.fillStyle = cellVisual.maskOverlay;
              ctx.fillRect(drawX, y, entryMeta.width, h);
            }
            borderRegistry.addRect({
              x: drawX,
              y,
              width: entryMeta.width,
              height: h,
              color: cellVisual.border,
              priority: resolveWorkbookCanvasCellBorderPriority(compareCell, false),
            });

            if (hasContent) {
              const textRect = getWorkbookCanvasTextInsetRect(drawX, y, entryMeta.width, h);
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
                getWorkbookCanvasTextBaselineY(ctx, y + (h / 2), sizes.ui),
              );
              ctx.restore();
            }
            return;
          }

          const column = entryMeta.column;
          const mergedRanges = band.side === 'base' ? baseMergedRanges : mineMergedRanges;
          const renderedRowNumbers = groupRuntime?.renderedRowNumbers[band.side] ?? [];
          const bandPositions = groupRuntime?.bandPositionBySideRowNumber[band.side]
            ?? new Map<number, { top: number; height: number }>();
          const mergeInfo = getWorkbookMergeDrawInfo({
            rowNumber,
            column,
            rowTop: y,
            rowHeight: h,
            renderedRowNumbers,
            rowLayoutByRowNumber: bandPositions,
            renderedColumns: renderedColumnNumbers,
            mergedRanges,
            columnLayoutByColumn,
            contentLeft,
            currentScrollLeft,
            freezeColumnCount,
            frozenWidth,
            mode: 'single',
            layer: layer === 'frozen' ? 'frozen' : 'scroll',
          });
          if (mergeInfo.covered && !mergeInfo.region) return;

          const anchorRowNumber = mergeInfo.region?.range.startRow ?? rowNumber;
          const anchorColumn = mergeInfo.region?.range.startCol ?? column;
          const rowEntryByRowNumber = groupRuntime.entryBySideRowNumber[band.side];
          const compareCellsByRowNumber = groupRuntime.compareCellsBySideRowNumber[band.side];
          const anchorEntry = rowEntryByRowNumber.get(anchorRowNumber) ?? entry;
          const cell = anchorEntry?.cells[anchorColumn] ?? { value: '', formula: '' };
          const compareCell = mergeInfo.region
            ? getWorkbookMergedCompareCellFromRows(compareCellsByRowNumber, mergeInfo.region.range)
            : compareCellsByRowNumber.get(anchorRowNumber)?.get(column) ?? band.compareCells.get(column);
          const hasContent = hasWorkbookCellContent(cell, compareMode);
          const selectionRowNumber = anchorRowNumber;
          const selectionColumn = anchorColumn;
          const selectionVisual = getWorkbookSelectionVisualState(
            T,
            selectionLookup,
            sheetName,
            band.side,
            selectionRowNumber,
            selectionColumn,
            band.isActiveSearch,
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
            side: band.side,
            hasEntry: true,
            hasContent,
            hasBaseRow: band.hasBaseRow,
            hasMineRow: band.hasMineRow,
            defaultTextColor: cellTextColor,
          });
          const mergedRegion = mergeInfo.region;
          const rowSegments = mergedRegion?.rowSegments ?? [{ top: y, height: h }];
          const regionLeft = mergeInfo.region?.left ?? drawX;
          const regionWidth = mergeInfo.region?.width ?? entryMeta.width;
          const regionBounds = getWorkbookCanvasRowSegmentBounds(rowSegments);
          const regionTop = regionBounds?.top ?? (mergeInfo.region?.top ?? y);
          const regionHeight = regionBounds?.height ?? (mergeInfo.region?.height ?? h);
          const regionSegments = mergeInfo.region?.segments ?? [{ left: regionLeft, width: regionWidth }];
          const textRowSegments = mergedRegion
            ? rowSegments.slice(0, 1)
            : rowSegments;
          const anchorRowSegment = rowSegments[0] ?? { top: regionTop, height: regionHeight };
          const continuationRowSegments = rowSegments.slice(1);
          const textCenterY = getWorkbookCanvasRowSegmentCenterY(textRowSegments) ?? (regionTop + (regionHeight / 2));
          const textRect = getWorkbookCanvasTextInsetRect(regionLeft, regionTop, regionWidth, regionHeight);
          const textX = textRect.left;
          const centerMergedText = Boolean(mergeInfo.region && regionSegments.length === 1);
          const withRowSegmentClip = (targetRowSegments: typeof rowSegments, callback: () => void) => {
            ctx.save();
            ctx.beginPath();
            targetRowSegments.forEach((rowSegment) => {
              regionSegments.forEach((segment) => {
                ctx.rect(segment.left, rowSegment.top, segment.width, rowSegment.height);
              });
            });
            ctx.clip();
            callback();
            ctx.restore();
          };
          const withRegionClip = (callback: () => void) => withRowSegmentClip(rowSegments, callback);

          const paintRegion = () => {
            ctx.fillStyle = cellVisual.background;
            withRegionClip(() => {
              regionSegments.forEach((segment) => {
                ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
              });
            });
            if (cellVisual.maskOverlay && !selectionVisual.hasSelectionHighlight) {
              ctx.fillStyle = cellVisual.maskOverlay;
              withRegionClip(() => {
                regionSegments.forEach((segment) => {
                  ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
                });
              });
            }
            const selectionOverlay = getWorkbookSelectionOverlay(selectionVisual);
            if (selectionOverlay) {
              ctx.fillStyle = selectionOverlay;
              withRegionClip(() => {
                regionSegments.forEach((segment) => {
                  ctx.fillRect(segment.left, regionTop, segment.width, regionHeight);
                });
              });
            }
            if (continuationRowSegments.length > 0) {
              const continuationVisual = getWorkbookMergeContinuationVisual(T, cellVisual.border);
              withRowSegmentClip([anchorRowSegment], () => {
                regionSegments.forEach((segment) => {
                  borderRegistry.addRect({
                    x: segment.left,
                    y: anchorRowSegment.top,
                    width: segment.width,
                    height: anchorRowSegment.height,
                    color: cellVisual.border,
                    priority: resolveWorkbookCanvasCellBorderPriority(compareCell, true),
                  });
                });
              });
              ctx.fillStyle = continuationVisual.background;
              continuationRowSegments.forEach((rowSegment) => {
                regionSegments.forEach((segment) => {
                  ctx.fillRect(segment.left, rowSegment.top, segment.width, rowSegment.height);
                });
              });
              ctx.strokeStyle = continuationVisual.guideStroke;
              ctx.lineWidth = 1;
              continuationRowSegments.forEach((rowSegment) => {
                regionSegments.forEach((segment) => {
                  ctx.beginPath();
                  ctx.moveTo(segment.left + 1.5, rowSegment.top + 1.5);
                  ctx.lineTo(segment.left + 1.5, rowSegment.top + rowSegment.height - 1.5);
                  ctx.stroke();
                });
              });
            } else {
              withRegionClip(() => {
                regionSegments.forEach((segment) => {
                  borderRegistry.addRect({
                    x: segment.left,
                    y: regionTop,
                    width: segment.width,
                    height: regionHeight,
                    color: cellVisual.border,
                    priority: resolveWorkbookCanvasCellBorderPriority(compareCell, true),
                  });
                });
              });
            }
            deferredSelectionDrawBucket.push(() => {
              withRowSegmentClip([anchorRowSegment], () => {
                regionSegments.forEach((segment) => {
                  drawWorkbookCanvasSelectionFrame(
                    ctx,
                    segment.left,
                    anchorRowSegment.top,
                    segment.width,
                    anchorRowSegment.height,
                    selectionVisual,
                  );
                });
              });
              if (continuationRowSegments.length > 0 && selectionVisual.hasSelectionHighlight) {
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = `${selectionVisual.accent}55`;
                ctx.lineWidth = 1;
                continuationRowSegments.forEach((rowSegment) => {
                  regionSegments.forEach((segment) => {
                    ctx.strokeRect(
                      segment.left + 1.5,
                      rowSegment.top + 1.5,
                      Math.max(0, segment.width - 3),
                      Math.max(0, rowSegment.height - 3),
                    );
                  });
                });
                ctx.restore();
              }
            });

            ctx.save();
            ctx.beginPath();
            textRowSegments.forEach((rowSegment) => {
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
              const maxLines = Math.max(1, textRowSegments.reduce((sum, rowSegment) => (
                sum + Math.max(1, Math.floor(Math.max(0, rowSegment.height - 4) / lineHeight))
              ), 0));
              const lines = layoutWorkbookCanvasTextLines({
                value: cell.value || '',
                maxWidth: textRect.width,
                maxLines,
                measureText: (value) => ctx.measureText(value).width,
              });
              ctx.textAlign = 'center';
              const lineCenters = getWorkbookCanvasRowSegmentLineCenters(textRowSegments, lines.length, lineHeight);
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

        entries.forEach((columnEntry) => {
          if (layer === 'frozen') {
            const frozenX = contentLeft + columnEntry.offset;
            if (frozenX > contentRight) return;
            drawCell(columnEntry, frozenX);
            return;
          }

          const x = contentLeft + columnEntry.offset - currentScrollLeft;
          if (x > contentRight || x + columnEntry.width <= contentLeft) return;
          drawCell(columnEntry, x);
        });
      };
      const drawFrozenBandBackdrops = () => {
        const frozenViewport = layerViewports.frozen;
        if (!frozenViewport) return;
        renderBands.forEach((band) => {
          ctx.fillStyle = band.rowHighlightBg ?? T.bg0;
          ctx.fillRect(frozenViewport.left, band.y, frozenViewport.width, band.height);
        });
      };

      renderBands.forEach(drawBandChrome);

      if (scrollViewport.width > 0) {
        renderBands.forEach((band) => {
          clipWorkbookCanvasToViewport(ctx, scrollViewport, band.y, band.height, () => {
            drawBandCells(band, floatingEntries, 'floating');
          });
        });
      }

      if (floatingMergedDraws.length > 0 && scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, height, () => {
          floatingMergedDraws.forEach((paintRegion) => paintRegion());
        });
      }

      drawFrozenBandBackdrops();

      const frozenViewport = layerViewports.frozen;

      if (frozenViewport) {
        renderBands.forEach((band) => {
          clipWorkbookCanvasToViewport(ctx, frozenViewport, band.y, band.height, () => {
            drawBandCells(band, frozenEntries, 'frozen');
          });
        });
      }

      if (frozenMergedDraws.length > 0 && frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, height, () => {
          frozenMergedDraws.forEach((paintRegion) => paintRegion());
        });
      }

      if (scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, height, () => {
          scrollBorderRegistry.flush(ctx);
        });
      }
      if (frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, height, () => {
          frozenBorderRegistry.flush(ctx);
        });
      }
      if (scrollViewport.width > 0) {
        clipWorkbookCanvasToViewport(ctx, scrollViewport, 0, height, () => {
          deferredSelectionDraws.floating.forEach((drawSelection) => drawSelection());
        });
      }
      if (frozenViewport) {
        clipWorkbookCanvasToViewport(ctx, frozenViewport, 0, height, () => {
          deferredSelectionDraws.frozen.forEach((drawSelection) => drawSelection());
        });
      }

      if (frozenViewport) {
        ctx.fillStyle = `${T.border2}55`;
        ctx.fillRect(frozenViewport.left + frozenViewport.width - 1, 0, 1, height);
      }

      ctx.restore();
    };

    drawRef.current = draw;
    // Cancel any pending scroll-driven rAF — this layout-triggered draw
    // already reflects the latest state. Without this, the scroll handler's
    // rAF could fire in the same frame and cause a redundant full canvas
    // repaint, which is the primary cause of horizontal scroll jank.
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [baseMergedRanges, columnLayoutByColumn, columnPartition, compareMode, contentWidth, dragPreviewActive, freezeColumnCount, groupRuntimeByKey, mineMergedRanges, renderBands, renderedColumnNumbers, renderColumns, scrollRef, selectionLookup, sheetName, sizes.line, sizes.ui, T, totalHeight, viewportWidth]);

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

    const { contentLeft, frozenWidth } = columnPartition;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    for (const groupRuntime of groupRuntimes) {
      const groupFrame = groupRuntime.frame;
      if (y < groupFrame.top || y > (groupFrame.top + groupFrame.height)) continue;

      for (const rowFrame of groupRuntime.rowFrames) {
        const renderRow = rowFrame.renderRow;
        const rowTop = rowFrame.top;
        const rowBottom = rowFrame.top + renderRow.height;
        if (y < rowTop || y > rowBottom) continue;

        const baseEntry = rowFrame.baseEntry;
        const mineEntry = rowFrame.mineEntry;
        const localY = y - rowTop;
        const visibleBands = groupRuntime.visibleBandsBySourceRowIndex.get(rowFrame.sourceRowIndex) ?? {};
        let side: 'base' | 'mine';
        let entry: WorkbookRowEntry | null;

        if (visibleBands.base && visibleBands.mine) {
          side = localY < ROW_H ? 'base' : 'mine';
          entry = side === 'base' ? baseEntry : mineEntry;
        } else if (visibleBands.mine) {
          side = 'mine';
          entry = mineEntry;
        } else {
          side = 'base';
          entry = baseEntry;
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
          const viewportRect = getWorkbookCanvasCellViewportRect({
            drawLeft: drawX,
            drawWidth: entryMeta.width,
            contentLeft,
            frozenWidth,
            frozen: entryMeta.position < freezeColumnCount,
          });
          return viewportRect != null && x >= viewportRect.left && x < viewportRect.left + viewportRect.width;
        });
        if (!hitEntry) return null;

        const column = hitEntry.column;
        const mergedRanges = side === 'base' ? baseMergedRanges : mineMergedRanges;
        const rowEntryByRowNumber = groupRuntime.entryBySideRowNumber[side];
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
        const rawColumnX = hitEntry.position < freezeColumnCount
          ? contentLeft + hitEntry.offset
          : contentLeft + hitEntry.offset - currentScrollLeft;
        const viewportRect = getWorkbookCanvasCellViewportRect({
          drawLeft: rawColumnX,
          drawWidth: hitEntry.width,
          contentLeft,
          frozenWidth,
          frozen: hitEntry.position < freezeColumnCount,
        });
        const compareCellsByRowNumber = groupRuntime.compareCellsBySideRowNumber[side];
        const anchorCompareCells = compareCellsByRowNumber.get(anchorRowNumber)
          ?? rowFrame.rowDelta.cellDeltas;
        const compareCell = mergeRange
          ? getWorkbookMergedCompareCellFromRows(compareCellsByRowNumber, mergeRange) ?? getWorkbookMergedCompareCell(anchorCompareCells, mergeRange)
          : anchorCompareCells.get(column);
        const columnX = spanRect?.left ?? viewportRect?.left ?? rawColumnX;
        const bandY = visibleBands[side]?.top ?? rowTop;
        const renderedRowNumbers = groupRuntime.renderedRowNumbers[side] ?? [];
        const bandPositions = groupRuntime.bandPositionBySideRowNumber[side]
          ?? new Map<number, { top: number; height: number }>();
        const mergeDrawInfo = getWorkbookMergeDrawInfo({
          rowNumber: entry.rowNumber,
          column,
          rowTop: bandY,
          rowHeight: ROW_H,
          renderedRowNumbers,
          rowLayoutByRowNumber: bandPositions,
          renderedColumns: renderedColumnNumbers,
          mergedRanges,
          columnLayoutByColumn,
          contentLeft,
          currentScrollLeft,
          freezeColumnCount,
          frozenWidth,
          mode: 'single',
          layer: 'content',
        });
        const hoverRowSegments = mergeDrawInfo.region?.rowSegments ?? [{ top: bandY, height: ROW_H }];
        const columnWidth = spanRect?.width ?? viewportRect?.width ?? hitEntry.width;
        const hoverBounds = getWorkbookCanvasHoverRowSegmentBounds(hoverRowSegments, y)
          ?? { top: bandY, height: ROW_H };
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
                left: canvasRect.left + columnX,
                top: canvasRect.top + hoverTop,
                width: columnWidth,
                height: hoverHeight,
                right: canvasRect.left + columnX + columnWidth,
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
              left: canvasRect.left + columnX,
              top: canvasRect.top + hoverTop,
              width: columnWidth,
              height: hoverHeight,
              right: canvasRect.left + columnX + columnWidth,
              bottom: canvasRect.top + hoverTop + hoverHeight,
            },
            address: selected.address,
            displayValue: selected.value,
            compareCell,
          } : null,
        };
      }
    }
    return null;
  };

  const resolveHoverAtPointer = (
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): WorkbookCanvasHoverCell | null => {
    const canvasRect = canvas.getBoundingClientRect();
    const hit = resolveHit(
      clientX - canvasRect.left,
      clientY - canvasRect.top,
      canvasRect,
    );
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
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      canvasRect,
    );
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

export default WorkbookStackedCanvasStrip;

