import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HorizontalVirtualColumnEntry } from '../hooks/useHorizontalVirtualColumns';
import { LN_W } from '../constants/layout';
import { FONT_CODE, getWorkbookFontScale } from '../constants/typography';
import { useTheme } from '../context/theme';
import type { WorkbookSelectedCell } from '../types';
import { ROW_H } from '../hooks/useVirtual';
import { getWorkbookColumnLabel } from '../utils/workbookSections';

type WorkbookCanvasHeaderMode = 'single' | 'paired-wide' | 'paired-compact';

interface WorkbookCanvasHeaderStripProps {
  mode: WorkbookCanvasHeaderMode;
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  selectedCell: WorkbookSelectedCell | null;
  fontSize: number;
  renderColumns: HorizontalVirtualColumnEntry[];
  fixedSide?: 'base' | 'mine';
  onSelectColumn: (column: number, side: 'base' | 'mine') => void;
  onColumnWidthChange?: ((column: number, width: number) => void) | undefined;
  onAutoFitColumn?: ((column: number) => void) | undefined;
}

interface HeaderHitTarget {
  kind: 'column' | 'resize';
  column: number;
  side: 'base' | 'mine';
}

function getCompactSplit(width: number) {
  const baseWidth = Math.max(28, Math.floor(width / 2));
  return {
    baseWidth,
    mineWidth: Math.max(28, width - baseWidth),
  };
}

const WorkbookCanvasHeaderStrip = memo(({
  mode,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  selectedCell,
  fontSize,
  renderColumns,
  fixedSide = 'base',
  onSelectColumn,
  onColumnWidthChange,
  onAutoFitColumn,
}: WorkbookCanvasHeaderStripProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const suppressClickRef = useRef(false);
  const [cursor, setCursor] = useState<'default' | 'pointer' | 'col-resize'>('default');

  const resolveHit = (x: number): HeaderHitTarget | null => {
    const contentHitRight = Math.min(viewportWidth, contentWidth);
    if (x < LN_W + 3 || x >= contentHitRight) return null;

    const contentLeft = LN_W + 3;
    const currentScrollLeft = scrollRef.current?.scrollLeft ?? 0;

    for (const entry of renderColumns) {
      const pairWidth = mode === 'single'
        ? entry.width
        : mode === 'paired-wide'
        ? entry.displayWidth
        : entry.width;
      const drawX = entry.position < freezeColumnCount
        ? contentLeft + entry.offset
        : contentLeft + entry.offset - currentScrollLeft;
      if (x < drawX || x >= drawX + pairWidth) continue;

      if (onColumnWidthChange && onAutoFitColumn && x >= (drawX + pairWidth - 6)) {
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

      renderColumns.forEach((entry) => {
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
          selectedCell
          && selectedCell.kind !== 'row'
          && selectedCell.sheetName === sheetName
          && selectedCell.colIndex === column,
        );
        const isBaseFocused = isSelectedColumn && selectedCell?.side === 'base';
        const isMineFocused = isSelectedColumn && selectedCell?.side === 'mine';
        const shadowBoundary = entry.position === freezeColumnCount - 1;

        if (mode === 'single') {
          const accent = fixedSide === 'base' ? T.acc2 : T.acc;
          ctx.fillStyle = isBaseFocused || isMineFocused
            ? `${accent}28`
            : isSelectedColumn
            ? `${accent}16`
            : T.bg1;
          ctx.fillRect(drawX, 0, entry.width, height);
          ctx.fillStyle = accent;
          ctx.fillRect(drawX, 0, 3, height);
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
            const focusAccent = selectedCell?.side === 'base' ? T.acc2 : T.acc;
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
    fontSize,
    freezeColumnCount,
    mode,
    onAutoFitColumn,
    onColumnWidthChange,
    renderColumns,
    scrollRef,
    selectedCell,
    sheetName,
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
    if (!hit || hit.kind !== 'column') return;
    onSelectColumn(hit.column, hit.side);
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
    const hit = resolveHit(event.clientX - rect.left);
    const nextCursor = hit?.kind === 'resize'
      ? 'col-resize'
      : hit?.kind === 'column'
      ? 'pointer'
      : 'default';
    if (cursor !== nextCursor) setCursor(nextCursor);
  };

  const handleMouseLeave = () => {
    if (cursor !== 'default') setCursor('default');
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'block',
        cursor,
        backfaceVisibility: 'hidden',
      }}
    />
  );
});

export default WorkbookCanvasHeaderStrip;
