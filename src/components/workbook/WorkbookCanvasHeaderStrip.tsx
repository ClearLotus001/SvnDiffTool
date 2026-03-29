import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import { LN_W } from '@/constants/layout';
import { FONT_CODE, getWorkbookFontScale } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import type {
  WorkbookContextMenuPoint,
  WorkbookHiddenColumnSegment,
  WorkbookSelectionMode,
  WorkbookSelectionRequestReason,
  WorkbookSelectionState,
} from '@/types';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { getWorkbookColumnLabel } from '@/utils/workbook/workbookSections';
import { buildWorkbookSelectionLookup } from '@/utils/workbook/workbookSelectionState';
import {
  clipWorkbookCanvasToViewport,
  getWorkbookCanvasCellViewportRect,
  getWorkbookCanvasLayerViewports,
} from '@/utils/workbook/workbookMergeLayout';
import WorkbookAnchorTooltip, { type WorkbookAnchorTooltipState } from '@/components/workbook/WorkbookAnchorTooltip';

type WorkbookCanvasHeaderMode = 'single' | 'paired-wide' | 'paired-compact';
const HIDDEN_MARKER_MIN_WIDTH = 24;
const HIDDEN_MARKER_HEIGHT = 18;

interface ColumnSelectionRequestMeta {
  mode?: WorkbookSelectionMode;
  reason?: WorkbookSelectionRequestReason;
  clientPoint?: WorkbookContextMenuPoint;
  preserveExistingIfTargetSelected?: boolean;
}

interface WorkbookCanvasHeaderStripProps {
  mode: WorkbookCanvasHeaderMode;
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  selection: WorkbookSelectionState;
  fontSize: number;
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  fixedSide?: 'base' | 'mine';
  showFixedSideAccent?: boolean;
  hiddenColumnSegments?: WorkbookHiddenColumnSegment[];
  onSelectColumn: (column: number, side: 'base' | 'mine', meta?: ColumnSelectionRequestMeta) => void;
  onRevealHiddenColumns?: ((columns: number[]) => void) | undefined;
  onColumnWidthChange?: ((column: number, width: number) => void) | undefined;
  onAutoFitColumn?: ((column: number) => void) | undefined;
}

interface HeaderHitTarget {
  kind: 'column' | 'resize' | 'hidden-segment';
  column: number;
  side: 'base' | 'mine';
  columns?: number[];
  count?: number;
  anchorRect?: WorkbookAnchorTooltipState['anchorRect'];
}

function getCompactSplit(width: number) {
  const baseWidth = Math.max(28, Math.floor(width / 2));
  return {
    baseWidth,
    mineWidth: Math.max(28, width - baseWidth),
  };
}

function getSelectionModeFromMouseEvent(event: Pick<React.MouseEvent<HTMLCanvasElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>): WorkbookSelectionMode {
  if (event.shiftKey) return 'range';
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'replace';
}

const WorkbookCanvasHeaderStrip = memo(({
  mode,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  selection,
  fontSize,
  renderColumns,
  columnLayoutByColumn,
  fixedSide = 'base',
  showFixedSideAccent = true,
  hiddenColumnSegments = [],
  onSelectColumn,
  onRevealHiddenColumns,
  onColumnWidthChange,
  onAutoFitColumn,
}: WorkbookCanvasHeaderStripProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const suppressClickRef = useRef(false);
  const [cursor, setCursor] = useState<'default' | 'pointer' | 'col-resize'>('default');
  const [hiddenColumnHover, setHiddenColumnHover] = useState<WorkbookAnchorTooltipState | null>(null);
  const selectionLookup = useMemo(() => buildWorkbookSelectionLookup(selection), [selection]);
  const primarySelection = selection.primary;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    const handleScroll = () => setHiddenColumnHover(null);
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef]);

  const resolveHiddenIndicatorLayouts = useCallback((currentScrollLeft: number) => {
    const contentLeft = LN_W + 3;
    const contentRight = Math.min(viewportWidth, contentWidth);

    return hiddenColumnSegments.flatMap((segment) => {
      const afterEntry = segment.afterColumn != null
        ? columnLayoutByColumn.get(segment.afterColumn) ?? null
        : null;
      const beforeEntry = segment.beforeColumn != null
        ? columnLayoutByColumn.get(segment.beforeColumn) ?? null
        : null;

      let boundaryX: number | null = null;
      if (afterEntry) {
        boundaryX = afterEntry.position < freezeColumnCount
          ? contentLeft + afterEntry.offset
          : contentLeft + afterEntry.offset - currentScrollLeft;
      } else if (beforeEntry) {
        const beforeLeft = beforeEntry.position < freezeColumnCount
          ? contentLeft + beforeEntry.offset
          : contentLeft + beforeEntry.offset - currentScrollLeft;
        boundaryX = beforeLeft + beforeEntry.displayWidth;
      }

      if (boundaryX == null) return [];

      const width = Math.max(HIDDEN_MARKER_MIN_WIDTH, 14 + (String(segment.count).length * 7));
      if (boundaryX < contentLeft - width || boundaryX > contentRight + width) return [];

      const left = Math.max(
        contentLeft,
        Math.min(boundaryX - (width / 2), contentRight - width),
      );

      return [{
        segment,
        left,
        top: Math.floor((ROW_H - HIDDEN_MARKER_HEIGHT) / 2),
        width,
        height: HIDDEN_MARKER_HEIGHT,
      }];
    });
  }, [columnLayoutByColumn, contentWidth, freezeColumnCount, hiddenColumnSegments, viewportWidth]);

  const resolveHit = (x: number, canvasRect?: DOMRect): HeaderHitTarget | null => {
    const contentHitRight = Math.min(viewportWidth, contentWidth);
    if (x < LN_W + 3 || x >= contentHitRight) return null;

    const contentLeft = LN_W + 3;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const hiddenIndicator = resolveHiddenIndicatorLayouts(currentScrollLeft).find((indicator) => (
      x >= indicator.left && x <= indicator.left + indicator.width
    ));
    if (hiddenIndicator) {
      const baseHit: HeaderHitTarget = {
        kind: 'hidden-segment',
        column: hiddenIndicator.segment.startCol,
        side: fixedSide,
        columns: hiddenIndicator.segment.columns,
        count: hiddenIndicator.segment.count,
      };
      if (!canvasRect) return baseHit;
      return {
        ...baseHit,
        anchorRect: {
          left: canvasRect.left + hiddenIndicator.left,
          top: canvasRect.top + hiddenIndicator.top,
          width: hiddenIndicator.width,
          height: hiddenIndicator.height,
          right: canvasRect.left + hiddenIndicator.left + hiddenIndicator.width,
          bottom: canvasRect.top + hiddenIndicator.top + hiddenIndicator.height,
        },
      };
    }

    for (const entry of renderColumns) {
      const pairWidth = mode === 'single'
        ? entry.width
        : mode === 'paired-wide'
        ? entry.displayWidth
        : entry.width;
      const drawX = entry.position < freezeColumnCount
        ? contentLeft + entry.offset
        : contentLeft + entry.offset - currentScrollLeft;
      const viewportRect = getWorkbookCanvasCellViewportRect({
        drawLeft: drawX,
        drawWidth: pairWidth,
        contentLeft,
        frozenWidth: renderColumns
          .filter(renderEntry => renderEntry.position < freezeColumnCount)
          .reduce((sum, renderEntry) => sum + renderEntry.displayWidth, 0),
        frozen: entry.position < freezeColumnCount,
      });
      if (!viewportRect || x < viewportRect.left || x >= viewportRect.left + viewportRect.width) continue;

      if (onColumnWidthChange && onAutoFitColumn && x >= (viewportRect.left + viewportRect.width - 6)) {
        return {
          kind: 'resize',
          column: entry.column,
          side: fixedSide,
        };
      }

      if (mode === 'single') {
        return {
          kind: 'column',
          column: entry.column,
          side: fixedSide,
        };
      }

      const split = mode === 'paired-wide'
        ? { baseWidth: entry.width, mineWidth: entry.width }
        : getCompactSplit(entry.width);
      const withinPairX = x - drawX;
      return {
        kind: 'column',
        column: entry.column,
        side: withinPairX < split.baseWidth ? 'base' : 'mine',
      };
    }

    return null;
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.ceil(viewportWidth));
      const height = ROW_H;
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
      ctx.fillStyle = T.bg1;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = T.bg2;
      ctx.fillRect(0, 0, LN_W + 3, height);
      ctx.strokeStyle = T.border;
      ctx.beginPath();
      ctx.moveTo(0, height - 0.5);
      ctx.lineTo(contentRight, height - 0.5);
      ctx.stroke();

      const contentLeft = LN_W + 3;
      const frozenWidth = renderColumns
        .filter(renderEntry => renderEntry.position < freezeColumnCount)
        .reduce((sum, renderEntry) => sum + renderEntry.displayWidth, 0);
      const layerViewports = getWorkbookCanvasLayerViewports({
        contentLeft,
        contentRight,
        frozenWidth,
      });
      const frozenEntries = renderColumns.filter(entry => entry.position < freezeColumnCount);
      const floatingEntries = renderColumns.filter(entry => entry.position >= freezeColumnCount);
      const drawColumn = (entry: HorizontalVirtualColumnEntry) => {
        const pairWidth = mode === 'single'
          ? entry.width
          : mode === 'paired-wide'
          ? entry.displayWidth
          : entry.width;
        const drawX = entry.position < freezeColumnCount
          ? contentLeft + entry.offset
          : contentLeft + entry.offset - currentScrollLeft;
        if (drawX > contentRight || drawX + pairWidth < contentLeft) return;

        const column = entry.column;
        const label = getWorkbookColumnLabel(column);
        const isSelectedColumn = Boolean(
          selectionLookup.columnKeys.has(`${sheetName}:${column}`)
          || selection.items.some(item => (
            item.kind === 'cell'
            && item.sheetName === sheetName
            && item.colIndex === column
          ))
        );
        const isBaseFocused = isSelectedColumn && primarySelection?.side === 'base';
        const isMineFocused = isSelectedColumn && primarySelection?.side === 'mine';
        const shadowBoundary = entry.position === freezeColumnCount - 1;

        if (mode === 'single') {
          const accent = fixedSide === 'base' ? T.acc2 : T.acc;
          ctx.fillStyle = isBaseFocused || isMineFocused
            ? `${accent}28`
            : isSelectedColumn
            ? `${accent}16`
            : T.bg1;
          ctx.fillRect(drawX, 0, entry.width, height);
          if (showFixedSideAccent) {
            ctx.fillStyle = accent;
            ctx.fillRect(drawX, 0, 3, height);
          }
          ctx.strokeStyle = isSelectedColumn ? `${accent}88` : T.border;
          ctx.strokeRect(drawX + 0.5, 0.5, entry.width - 1, height - 1);
          ctx.fillStyle = isBaseFocused || isMineFocused ? T.t0 : T.t1;
          ctx.font = `${sizes.header}px ${FONT_CODE}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, drawX + (entry.width / 2), height / 2);
        } else {
          const split = mode === 'paired-wide'
            ? { baseWidth: entry.width, mineWidth: entry.width }
            : getCompactSplit(entry.width);
          const baseX = drawX;
          const mineX = drawX + split.baseWidth;

          ctx.fillStyle = isBaseFocused
            ? `${T.acc2}32`
            : isSelectedColumn
            ? `${T.acc2}12`
            : `${T.acc2}0e`;
          ctx.fillRect(baseX, 0, split.baseWidth, height);

          ctx.fillStyle = isMineFocused
            ? `${T.acc}32`
            : isSelectedColumn
            ? `${T.acc}12`
            : `${T.acc}0e`;
          ctx.fillRect(mineX, 0, split.mineWidth, height);

          ctx.fillStyle = T.acc2;
          ctx.fillRect(baseX, 0, 3, height);
          ctx.fillStyle = T.acc;
          ctx.fillRect(mineX, 0, 3, height);

          ctx.strokeStyle = T.border;
          ctx.strokeRect(drawX + 0.5, 0.5, pairWidth - 1, height - 1);
          if (isSelectedColumn) {
            const focusAccent = primarySelection?.side === 'base' ? T.acc2 : T.acc;
            ctx.strokeStyle = `${focusAccent}96`;
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX + 1, 1, pairWidth - 2, height - 2);
            ctx.lineWidth = 1;
          }

          ctx.font = `${sizes.header}px ${FONT_CODE}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isBaseFocused ? T.t0 : T.t1;
          ctx.fillText(label, baseX + (split.baseWidth / 2), height / 2);
          ctx.fillStyle = isMineFocused ? T.t0 : T.t1;
          ctx.fillText(label, mineX + (split.mineWidth / 2), height / 2);
        }

        if (shadowBoundary) {
          ctx.fillStyle = `${T.border2}66`;
          ctx.fillRect(drawX + pairWidth - 1, 0, 1, height);
        }

        if (onColumnWidthChange && onAutoFitColumn) {
          ctx.fillStyle = cursor === 'col-resize' ? `${T.acc2}b0` : `${T.border2}aa`;
          ctx.fillRect(drawX + pairWidth - 2, 8, 2, height - 16);
        }
      };

      if (layerViewports.content.width > 0) {
        clipWorkbookCanvasToViewport(ctx, layerViewports.content, 0, height, () => {
          floatingEntries.forEach((entry) => {
            drawColumn(entry);
          });
        });
      }

      if (layerViewports.frozen) {
        ctx.fillStyle = T.bg1;
        ctx.fillRect(layerViewports.frozen.left, 0, layerViewports.frozen.width, height);
        clipWorkbookCanvasToViewport(ctx, layerViewports.frozen, 0, height, () => {
          frozenEntries.forEach((entry) => {
            drawColumn(entry);
          });
        });
      }

      resolveHiddenIndicatorLayouts(currentScrollLeft).forEach((indicator) => {
        ctx.fillStyle = T.bg0;
        ctx.strokeStyle = T.acc2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(indicator.left, indicator.top, indicator.width, indicator.height, 999);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = T.acc2;
        ctx.font = `${Math.max(10, sizes.header - 1)}px ${FONT_CODE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${indicator.segment.count}`, indicator.left + (indicator.width / 2), indicator.top + (indicator.height / 2));
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
  }, [
    contentWidth,
    cursor,
    fixedSide,
    freezeColumnCount,
    hiddenColumnSegments,
    columnLayoutByColumn,
    mode,
    onAutoFitColumn,
    onColumnWidthChange,
    primarySelection?.side,
    renderColumns,
    resolveHiddenIndicatorLayouts,
    scrollRef,
    selection,
    selectionLookup.columnKeys,
    sheetName,
    showFixedSideAccent,
    sizes.header,
    T,
    viewportWidth,
  ]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onColumnWidthChange || !onAutoFitColumn || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left);
    if (!hit || hit.kind !== 'resize') return;

    event.preventDefault();
    suppressClickRef.current = true;
    const entry = renderColumns.find((item) => item.column === hit.column);
    if (!entry) return;

    const startX = event.clientX;
    const startWidth = entry.width;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onColumnWidthChange(hit.column, startWidth + (moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressClickRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left);
    if (!hit) return;
    if (hit.kind === 'hidden-segment') {
      onRevealHiddenColumns?.(hit.columns ?? []);
      setHiddenColumnHover(null);
      return;
    }
    if (hit.kind !== 'column') return;
    onSelectColumn(hit.column, hit.side, {
      mode: getSelectionModeFromMouseEvent(event),
      reason: 'click',
    });
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onColumnWidthChange || !onAutoFitColumn) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left);
    if (!hit || hit.kind !== 'resize') return;
    event.preventDefault();
    onAutoFitColumn(hit.column);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left, rect);
    const nextCursor = hit?.kind === 'resize'
      ? 'col-resize'
      : hit?.kind === 'column' || hit?.kind === 'hidden-segment'
      ? 'pointer'
      : 'default';
    if (cursor !== nextCursor) setCursor(nextCursor);
    if (hit?.kind === 'hidden-segment' && hit.anchorRect && hit.count != null) {
      const anchorRect = hit.anchorRect;
      const count = hit.count;
      const nextHoverKey = `${sheetName}:${hit.column}:${hit.count}`;
      const nextHover: WorkbookAnchorTooltipState = {
        key: nextHoverKey,
        text: t('workbookHiddenColumnsTooltip', { count }),
        anchorRect,
      };
      if (
        !hiddenColumnHover
        || hiddenColumnHover.key !== nextHoverKey
        || hiddenColumnHover.anchorRect.left !== anchorRect.left
        || hiddenColumnHover.anchorRect.top !== anchorRect.top
      ) {
        setHiddenColumnHover(nextHover);
      }
    } else if (hiddenColumnHover) {
      setHiddenColumnHover(null);
    }
  };

  const handleMouseLeave = () => {
    if (cursor !== 'default') setCursor('default');
    setHiddenColumnHover(null);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = resolveHit(event.clientX - rect.left, rect);
    if (!hit || hit.kind !== 'column') return;
    event.preventDefault();
    setHiddenColumnHover(null);
    onSelectColumn(hit.column, hit.side, {
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
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'block',
          cursor,
          backfaceVisibility: 'hidden',
        }}
      />
      <WorkbookAnchorTooltip hover={hiddenColumnHover} />
    </>
  );
});

export default WorkbookCanvasHeaderStrip;
