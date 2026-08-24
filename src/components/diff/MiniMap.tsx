// src/components/MiniMap.tsx
import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject, type WheelEvent } from 'react';
import type { DiffLine, RenderItem, SplitRenderItem, SplitRow } from '@/types';
import { useThemeTokens } from '@/context/theme';
import { useI18n } from '@/context/i18n';
import { TEXT_DIFF_MINIMAP_WIDTH } from '@/constants/layout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import {
  buildMiniMapOverlayMarkers,
  DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT,
  type MiniMapOverlayMarker,
} from '@/utils/diff/minimapOverlayMarkers';
import { resolveDiffMiniMapPaint } from '@/utils/diff/minimapColors';
import {
  computeMiniMapDragScrollTop,
  computeMiniMapKeyboardScrollTop,
  computeMiniMapViewportMetrics,
  computeMiniMapWheelScrollTop,
  resolveMiniMapContentHeight,
  resolveMiniMapTrackHeight,
} from '@/utils/diff/minimapInteraction';
import {
  resolveTextDiffVisualTone,
  resolveTextSplitRowVisualTone,
} from '@/utils/diff/textDiffVisuals';

interface MiniMapProps {
  segments: MiniMapSegment[];
  scrollRef: RefObject<HTMLDivElement | null>;
  contentHeight: number;
}

export type MiniMapLineTone = 'equal' | 'add' | 'delete' | 'modify';
export type MiniMapPaintTone = Exclude<MiniMapLineTone, 'equal'>;

export interface MiniMapSegment {
  tone: MiniMapLineTone;
  height: number;
  tones?: readonly MiniMapPaintTone[];
  searchHit?: boolean;
}

export type MiniMapDiffMarker = MiniMapOverlayMarker<
  MiniMapLineTone,
  { searchHit: boolean; tones: MiniMapPaintTone[] }
>;

const WIDTH = TEXT_DIFF_MINIMAP_WIDTH;
const SEARCH_MARKER_WIDTH = 8;
const MIN_DIFF_MARKER_HEIGHT = DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT;
const TEXT_MINIMAP_TONE_ORDER: readonly MiniMapPaintTone[] = ['delete', 'modify', 'add'] as const;

interface MiniMapDragState {
  pointerId: number;
  startClientY: number;
  startScrollTop: number;
  maxScrollTop: number;
  trackHeight: number;
}

function resolveMiniMapSegments(
  segments: readonly MiniMapSegment[],
  contentHeight: number,
): MiniMapSegment[] {
  return segments.length > 0
    ? [...segments]
    : [{ tone: 'equal', height: Math.max(1, contentHeight) }];
}

function resolveMiniMapTonePaint(
  tone: MiniMapLineTone,
  theme: ReturnType<typeof useThemeTokens>,
): ReturnType<typeof resolveDiffMiniMapPaint> | { kind: 'solid'; color: string } {
  if (tone !== 'equal') return resolveDiffMiniMapPaint(theme, tone);
  return { kind: 'solid', color: theme.bg3 };
}

function normalizeMiniMapPaintTones(
  tones: readonly MiniMapPaintTone[] | undefined,
  tone: MiniMapLineTone,
): MiniMapPaintTone[] {
  const rawTones = tones && tones.length > 0
    ? tones
    : tone === 'equal'
      ? []
      : [tone];
  const seen = new Set<MiniMapPaintTone>();
  TEXT_MINIMAP_TONE_ORDER.forEach((candidate) => {
    if (rawTones.includes(candidate)) {
      seen.add(candidate);
    }
  });
  return [...seen];
}

function applyMiniMapTonePaint(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  tone: MiniMapLineTone,
  tones: readonly MiniMapPaintTone[] | undefined,
  theme: ReturnType<typeof useThemeTokens>,
): CanvasFillStrokeStyles['fillStyle'] {
  const resolvedTones = normalizeMiniMapPaintTones(tones, tone);
  if (resolvedTones.length > 1) {
    if (resolvedTones.includes('modify')) {
      const modifyPaint = resolveDiffMiniMapPaint(theme, 'modify');
      ctx.fillStyle = modifyPaint.color ?? theme.chgTx;
      ctx.fillRect(left, top, width, height);

      const accentStripeWidth = Math.max(2, Math.min(6, Math.floor(width * 0.14)));
      if (resolvedTones.includes('delete')) {
        const deletePaint = resolveDiffMiniMapPaint(theme, 'delete');
        ctx.fillStyle = deletePaint.color ?? theme.delBrd;
        ctx.fillRect(left, top, accentStripeWidth, height);
      }
      if (resolvedTones.includes('add')) {
        const addPaint = resolveDiffMiniMapPaint(theme, 'add');
        ctx.fillStyle = addPaint.color ?? theme.addBrd;
        ctx.fillRect(left + width - accentStripeWidth, top, accentStripeWidth, height);
      }
      return ctx.fillStyle;
    }

    const stripeWidth = width / resolvedTones.length;
    resolvedTones.forEach((stripeTone, index) => {
      const stripeLeft = left + (stripeWidth * index);
      const nextLeft = index === resolvedTones.length - 1
        ? left + width
        : left + (stripeWidth * (index + 1));
      const stripePaint = resolveDiffMiniMapPaint(theme, stripeTone);
      ctx.fillStyle = stripePaint.color ?? theme.chgTx;
      ctx.fillRect(stripeLeft, top, Math.max(1, nextLeft - stripeLeft), height);
    });
    return ctx.fillStyle;
  }

  const paint = resolveMiniMapTonePaint(tone, theme);
  if (paint.kind === 'solid') return paint.color ?? theme.bg3;

  const gradient = ctx.createLinearGradient(left, top, left + width, top);
  const stops = paint.stops ?? [];
  if (stops.length === 0) return resolveDiffMiniMapPaint(theme, 'modify').color ?? theme.chgTx;
  stops.forEach((stop) => {
    gradient.addColorStop(stop.offset, stop.color);
  });
  return gradient;
}

export function buildMiniMapDiffMarkers(
  segments: readonly MiniMapSegment[],
  contentHeight: number,
  canvasHeight: number,
  minMarkerHeight = MIN_DIFF_MARKER_HEIGHT,
): MiniMapDiffMarker[] {
  return buildMiniMapOverlayMarkers<MiniMapLineTone, MiniMapSegment, { searchHit: boolean; tones: MiniMapPaintTone[] }>({
    segments,
    contentHeight,
    canvasHeight,
    emptyTone: 'equal',
    minMarkerHeight,
    resolveExtra: (segment) => ({
      searchHit: Boolean(segment.searchHit),
      tones: normalizeMiniMapPaintTones(segment.tones, segment.tone),
    }),
    mergeExtra: (left, right) => ({
      searchHit: Boolean(left.searchHit || right.searchHit),
      tones: normalizeMiniMapPaintTones([...left.tones, ...right.tones], 'equal'),
    }),
    mergeTone: (left, right) => (left === right ? left : 'modify'),
  });
}

export function resolveMiniMapLineTone(
  line: DiffLine,
  lineIdx: number,
  replacementPairIndex: ReadonlyMap<number, number>,
): MiniMapLineTone {
  return resolveTextDiffVisualTone(line, replacementPairIndex.has(lineIdx));
}

function resolveMiniMapSplitRowTone(row: SplitRow): MiniMapLineTone {
  return resolveTextSplitRowVisualTone(row);
}

function hasSearchHitInRange(
  fromIdx: number,
  toIdx: number,
  searchMatchSet: ReadonlySet<number>,
): boolean {
  for (let lineIdx = fromIdx; lineIdx <= toIdx; lineIdx += 1) {
    if (searchMatchSet.has(lineIdx)) return true;
  }
  return false;
}

export function buildUnifiedMiniMapSegments(
  items: RenderItem[],
  replacementPairIndex: ReadonlyMap<number, number>,
  searchMatchSet: ReadonlySet<number>,
): MiniMapSegment[] {
  return items.map((item) => {
    if (item.kind === 'collapse') {
      return {
        tone: 'equal',
        height: ROW_H,
        searchHit: hasSearchHitInRange(item.fromIdx, item.toIdx, searchMatchSet),
      };
    }

    const tone = resolveMiniMapLineTone(item.line, item.lineIdx, replacementPairIndex);
    return {
      tone,
      ...(tone === 'equal' ? {} : { tones: [tone] }),
      height: ROW_H,
      searchHit: searchMatchSet.has(item.lineIdx),
    };
  });
}

export function buildSplitMiniMapSegments(
  items: SplitRenderItem[],
  itemHeights: readonly number[],
  searchMatchSet: ReadonlySet<number>,
): MiniMapSegment[] {
  return items.map((item, index) => {
    if (item.kind === 'split-collapse') {
      return {
        tone: 'equal',
        height: itemHeights[index] ?? ROW_H,
        searchHit: hasSearchHitInRange(item.fromIdx, item.toIdx, searchMatchSet),
      };
    }

    const tone = resolveMiniMapSplitRowTone(item.row);
    return {
      tone,
      ...(tone === 'equal' ? {} : { tones: [tone] }),
      height: itemHeights[index] ?? ROW_H,
      searchHit: item.row.lineIdxs.some((lineIdx) => searchMatchSet.has(lineIdx)),
    };
  });
}

const MiniMap = memo(({ segments, scrollRef, contentHeight }: MiniMapProps) => {
  const { t } = useI18n();
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<MiniMapDragState | null>(null);
  const dragScrollFrameRef = useRef(0);
  const pendingDragScrollTopRef = useRef<number | null>(null);
  const [contHeight, setContHeight] = useState(400);
  const [isDragging, setIsDragging] = useState(false);

  const applyViewport = (top: number, height: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.transform = `translate3d(0, ${top}px, 0)`;
    viewport.style.height = `${height}px`;
  };

  const flushPendingDragScroll = () => {
    dragScrollFrameRef.current = 0;
    const nextScrollTop = pendingDragScrollTopRef.current;
    pendingDragScrollTopRef.current = null;
    const el = scrollRef.current;
    if (!el || nextScrollTop == null) return;
    if (Math.abs(el.scrollTop - nextScrollTop) >= 0.5) {
      el.scrollTop = nextScrollTop;
    }
  };

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const updateHeight = () => {
      const nextHeight = Math.max(1, cont.clientHeight || 400);
      setContHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(cont);
    updateHeight();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = WIDTH;
    const H = contHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = T.bg3;
    ctx.fillRect(0, 0, W, H);
    const resolvedSegments = resolveMiniMapSegments(segments, contentHeight);
    const total = Math.max(
      contentHeight,
      resolvedSegments.reduce((sum, segment) => sum + segment.height, 0),
      1,
    );
    const scale = H / total;

    let offset = 0;
    resolvedSegments.forEach((segment) => {
      const y = Math.floor(offset * scale);
      const h = Math.max(1, Math.ceil(segment.height * scale));
      const tone = segment.tone;
      if (tone !== 'equal') {
        ctx.fillStyle = applyMiniMapTonePaint(ctx, 0, y, W, h, tone, segment.tones, T);
        if (normalizeMiniMapPaintTones(segment.tones, tone).length <= 1) {
          ctx.fillRect(0, y, W, h);
        }
      }
      if (segment.searchHit) {
        ctx.fillStyle = T.searchHl;
        ctx.fillRect(W - SEARCH_MARKER_WIDTH, y, SEARCH_MARKER_WIDTH, Math.max(2, h));
      }
      offset += segment.height;
    });
  }, [contentHeight, contHeight, segments, T]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const W = WIDTH;
    const H = contHeight;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    const markers = buildMiniMapDiffMarkers(segments, contentHeight, H);
    markers.forEach((marker) => {
      const diffWidth = marker.searchHit ? W - SEARCH_MARKER_WIDTH : W;
      ctx.fillStyle = applyMiniMapTonePaint(ctx, 0, marker.top, diffWidth, marker.height, marker.tone, marker.tones, T);
      if (normalizeMiniMapPaintTones(marker.tones, marker.tone).length <= 1) {
        ctx.fillRect(0, marker.top, diffWidth, marker.height);
      }

      if (marker.searchHit) {
        ctx.fillStyle = T.searchHl;
        ctx.fillRect(W - SEARCH_MARKER_WIDTH, marker.top, SEARCH_MARKER_WIDTH, Math.max(2, marker.height));
      }
    });
  }, [contentHeight, contHeight, segments, T]);

  useEffect(() => {
    const el = scrollRef.current;
    const cont = contRef.current;
    if (!el || !cont) return;
    const update = () => {
      const H = resolveMiniMapTrackHeight(cont.clientHeight || contHeight, el.clientHeight);
      const metrics = computeMiniMapViewportMetrics({
        scrollTop: el.scrollTop,
        viewportHeight: el.clientHeight,
        contentHeight: resolveMiniMapContentHeight(contentHeight, el.scrollHeight, el.clientHeight),
        minimapHeight: H,
      });
      applyViewport(metrics.top, metrics.height);
    };
    const onScroll = () => update();
    const ro = new ResizeObserver(() => update());
    ro.observe(cont);
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [contentHeight, contHeight, scrollRef]);

  useEffect(() => () => {
    if (dragScrollFrameRef.current) {
      cancelAnimationFrame(dragScrollFrameRef.current);
    }
  }, []);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const cont = contRef.current;
    const el = scrollRef.current;
    if (!cont || !el) return;
    const rect = cont.getBoundingClientRect();
    const H = resolveMiniMapTrackHeight(cont.clientHeight || contHeight, el.clientHeight);
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / H));
    const contentExtent = resolveMiniMapContentHeight(contentHeight, el.scrollHeight, el.clientHeight);
    const maxScrollTop = Math.max(0, contentExtent - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(maxScrollTop, ratio * contentExtent));
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || event.deltaY === 0) return;

    const contentExtent = resolveMiniMapContentHeight(contentHeight, el.scrollHeight, el.clientHeight);
    const maxScrollTop = Math.max(0, contentExtent - el.clientHeight);
    if (maxScrollTop <= 0) return;

    const nextScrollTop = computeMiniMapWheelScrollTop({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      currentScrollTop: el.scrollTop,
      maxScrollTop,
      viewportHeight: el.clientHeight,
    });

    if (Math.abs(el.scrollTop - nextScrollTop) >= 0.5) {
      el.scrollTop = nextScrollTop;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const nextScrollTop = computeMiniMapKeyboardScrollTop({
      key: event.key,
      currentScrollTop: el.scrollTop,
      maxScrollTop: el.scrollHeight - el.clientHeight,
      viewportHeight: el.clientHeight,
    });
    if (nextScrollTop == null) return;
    el.scrollTop = nextScrollTop;
    event.preventDefault();
  };

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const cont = contRef.current;
    const el = scrollRef.current;
    if (!cont || !el) return;

    const H = resolveMiniMapTrackHeight(cont.clientHeight || contHeight, el.clientHeight);
    const metrics = computeMiniMapViewportMetrics({
      scrollTop: el.scrollTop,
      viewportHeight: el.clientHeight,
      contentHeight: resolveMiniMapContentHeight(contentHeight, el.scrollHeight, el.clientHeight),
      minimapHeight: H,
    });

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startScrollTop: el.scrollTop,
      maxScrollTop: metrics.maxScrollTop,
      trackHeight: metrics.trackHeight,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    const el = scrollRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !el) return;

    pendingDragScrollTopRef.current = computeMiniMapDragScrollTop({
      pointerDeltaY: event.clientY - dragState.startClientY,
      startScrollTop: dragState.startScrollTop,
      maxScrollTop: dragState.maxScrollTop,
      trackHeight: dragState.trackHeight,
    });
    if (!dragScrollFrameRef.current) {
      dragScrollFrameRef.current = requestAnimationFrame(flushPendingDragScroll);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const finishViewportDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (dragScrollFrameRef.current) {
      cancelAnimationFrame(dragScrollFrameRef.current);
      flushPendingDragScroll();
    }
    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={contRef}
      onClick={handleClick}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      role="navigation"
      aria-label={t('textMiniMapAriaLabel')}
      tabIndex={0}
      className="relative overflow-hidden cursor-pointer shrink-0 self-stretch border-l border-border-default outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acc2)]"
      style={{ width: WIDTH, background: T.bg1 }}>
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
        style={{ imageRendering: 'pixelated', zIndex: 0 }}
      />
      <div
        ref={viewportRef}
        data-dragging={isDragging ? 'true' : undefined}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={finishViewportDrag}
        onPointerCancel={finishViewportDrag}
        onClick={(event) => event.stopPropagation()}
        className={`minimap-viewport-frosted absolute ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          top: 0,
          height: 40,
          transform: 'translate3d(0, 0px, 0)',
          touchAction: 'none',
          userSelect: 'none',
          contain: 'layout paint style',
          zIndex: 3,
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ imageRendering: 'pixelated', zIndex: 1 }}
      />
    </div>
  );
});

export default MiniMap;
