import { memo, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useThemeTokens } from '@/context/theme';
import {
  buildMiniMapOverlayMarkers,
  DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT,
  type MiniMapOverlayMarker,
} from '@/utils/diff/minimapOverlayMarkers';
import { resolveDiffMiniMapPaint } from '@/utils/diff/minimapColors';
import { resolveWorkbookMiniMapPaint } from '@/utils/workbook/workbookRowVisuals';

export type WorkbookMiniMapTone = 'equal' | 'add' | 'delete' | 'modify' | 'strict-only' | 'mixed';
export type WorkbookMiniMapPaintTone = Exclude<WorkbookMiniMapTone, 'equal' | 'mixed'>;

export interface WorkbookMiniMapSegment {
  tone: WorkbookMiniMapTone;
  height: number;
  tones?: readonly WorkbookMiniMapPaintTone[];
  searchHit?: boolean;
  activeSearchHit?: boolean;
}

export type WorkbookMiniMapDiffMarker = MiniMapOverlayMarker<
  WorkbookMiniMapTone,
  { tones: WorkbookMiniMapPaintTone[] }
>;

export interface WorkbookMiniMapDebugStats {
  clickCount: number;
  lastClickMs: number;
}

interface WorkbookMiniMapProps {
  segments: WorkbookMiniMapSegment[];
  scrollRef: RefObject<HTMLDivElement | null>;
  contentHeight: number;
  debugRef?: MutableRefObject<WorkbookMiniMapDebugStats | null>;
}

const WIDTH = 28;
const MIN_DIFF_MARKER_HEIGHT = DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT;
const WORKBOOK_MINIMAP_TONE_ORDER: readonly WorkbookMiniMapPaintTone[] = [
  'delete',
  'modify',
  'add',
  'strict-only',
] as const;

function normalizeWorkbookMiniMapPaintTones(
  tones: readonly WorkbookMiniMapPaintTone[] | undefined,
  tone: WorkbookMiniMapTone,
): WorkbookMiniMapPaintTone[] {
  const rawTones = tones && tones.length > 0
    ? tones
    : tone === 'equal'
      ? []
      : tone === 'mixed'
        ? ['modify']
        : [tone];
  const seen = new Set<WorkbookMiniMapPaintTone>();
  WORKBOOK_MINIMAP_TONE_ORDER.forEach((candidate) => {
    if (rawTones.includes(candidate)) {
      seen.add(candidate);
    }
  });
  return [...seen];
}

function applyWorkbookMiniMapPaint(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  tone: WorkbookMiniMapTone,
  tones: readonly WorkbookMiniMapPaintTone[] | undefined,
  theme: ReturnType<typeof useThemeTokens>,
): CanvasFillStrokeStyles['fillStyle'] {
  const resolvedTones = normalizeWorkbookMiniMapPaintTones(tones, tone);
  if (resolvedTones.length > 1) {
    if (resolvedTones.includes('modify')) {
      const modifyPaint = resolveDiffMiniMapPaint(theme, 'modify');
      ctx.fillStyle = modifyPaint.color ?? theme.chgTx;
      ctx.fillRect(left, top, width, height);

      const accentStripeWidth = Math.max(2, Math.min(5, Math.floor(width * 0.18)));
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
      if (resolvedTones.includes('strict-only')) {
        const strictStripeLeft = left + Math.floor((width - accentStripeWidth) / 2);
        ctx.fillStyle = theme.acc2;
        ctx.fillRect(strictStripeLeft, top, accentStripeWidth, height);
      }
      return ctx.fillStyle;
    }

    const stripeWidth = width / resolvedTones.length;
    resolvedTones.forEach((stripeTone, index) => {
      const stripeLeft = left + (stripeWidth * index);
      const nextLeft = index === resolvedTones.length - 1
        ? left + width
        : left + (stripeWidth * (index + 1));
      const stripePaint = resolveWorkbookMiniMapPaint(theme, stripeTone);
      ctx.fillStyle = stripePaint.color ?? theme.chgTx;
      ctx.fillRect(stripeLeft, top, Math.max(1, nextLeft - stripeLeft), height);
    });
    return ctx.fillStyle;
  }

  const paint = resolveWorkbookMiniMapPaint(theme, tone);
  if (paint.kind === 'solid') {
    return paint.color ?? theme.bg2;
  }

  const gradient = ctx.createLinearGradient(left, top, left + width, top);
  const stops = paint.stops ?? [];
  if (stops.length === 0) return resolveDiffMiniMapPaint(theme, 'modify').color ?? theme.chgTx;
  stops.forEach((stop) => {
    gradient.addColorStop(stop.offset, stop.color);
  });
  return gradient;
}

function resolveWorkbookMiniMapSegments(
  segments: readonly WorkbookMiniMapSegment[],
  contentHeight: number,
): WorkbookMiniMapSegment[] {
  return segments.length > 0
    ? [...segments]
    : [{ tone: 'equal', height: Math.max(1, contentHeight) }];
}

export function computeMiniMapTargetScrollTop(
  ratio: number,
  contentHeight: number,
  viewportHeight: number,
): number {
  const normalizedRatio = Math.max(0, Math.min(1, ratio));
  const maxScrollTop = Math.max(0, contentHeight - viewportHeight);
  const targetCenter = normalizedRatio * contentHeight;
  return Math.max(0, Math.min(maxScrollTop, targetCenter - (viewportHeight / 2)));
}

export function buildWorkbookMiniMapDiffMarkers(
  segments: readonly WorkbookMiniMapSegment[],
  contentHeight: number,
  canvasHeight: number,
  minMarkerHeight = MIN_DIFF_MARKER_HEIGHT,
): WorkbookMiniMapDiffMarker[] {
  return buildMiniMapOverlayMarkers<WorkbookMiniMapTone, WorkbookMiniMapSegment, { tones: WorkbookMiniMapPaintTone[] }>({
    segments,
    contentHeight,
    canvasHeight,
    emptyTone: 'equal',
    minMarkerHeight,
    resolveExtra: (segment) => ({
      tones: normalizeWorkbookMiniMapPaintTones(segment.tones, segment.tone),
    }),
    mergeExtra: (left, right) => ({
      tones: normalizeWorkbookMiniMapPaintTones(
        [...left.tones, ...right.tones],
        'equal',
      ),
    }),
    mergeTone: (left, right) => (left === right ? left : 'mixed'),
  });
}

const WorkbookMiniMap = memo(({
  segments,
  scrollRef,
  contentHeight,
  debugRef,
}: WorkbookMiniMapProps) => {
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [contHeight, setContHeight] = useState(320);

  const applyViewport = (top: number, height: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.transform = `translate3d(0, ${top}px, 0)`;
    viewport.style.height = `${height}px`;
  };

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;

    const updateHeight = () => {
      const nextHeight = Math.max(1, cont.clientHeight || 320);
      setContHeight(prev => (prev === nextHeight ? prev : nextHeight));
    };

    const ro = new ResizeObserver(updateHeight);
    ro.observe(cont);
    updateHeight();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const H = contHeight;
    canvas.width = WIDTH;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resolvedSegments = resolveWorkbookMiniMapSegments(segments, contentHeight);
    const total = Math.max(contentHeight, resolvedSegments.reduce((sum, segment) => sum + segment.height, 0), 1);
    const scale = H / total;

    ctx.clearRect(0, 0, WIDTH, H);

    let offset = 0;
    resolvedSegments.forEach((segment) => {
      const y = Math.floor(offset * scale);
      const h = Math.max(1, Math.ceil(segment.height * scale));

      ctx.fillStyle = applyWorkbookMiniMapPaint(ctx, 0, y, WIDTH, h, segment.tone, segment.tones, T);
      if (normalizeWorkbookMiniMapPaintTones(segment.tones, segment.tone).length <= 1) {
        ctx.fillRect(0, y, WIDTH, h);
      }

      if (segment.searchHit) {
        const markerWidth = segment.activeSearchHit ? 8 : 6;
        ctx.fillStyle = T.searchHl;
        ctx.fillRect(
          WIDTH - markerWidth,
          y,
          markerWidth,
          Math.max(segment.activeSearchHit ? 3 : 2, h),
        );
      }

      offset += segment.height;
    });
  }, [contentHeight, contHeight, segments, T]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const H = contHeight;
    canvas.width = WIDTH;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, H);

    const markers = buildWorkbookMiniMapDiffMarkers(segments, contentHeight, H);
    markers.forEach((marker) => {
      ctx.fillStyle = applyWorkbookMiniMapPaint(ctx, 0, marker.top, WIDTH, marker.height, marker.tone, marker.tones, T);
      if (normalizeWorkbookMiniMapPaintTones(marker.tones, marker.tone).length <= 1) {
        ctx.fillRect(0, marker.top, WIDTH, marker.height);
      }
    });
  }, [contentHeight, contHeight, segments, T]);

  useEffect(() => {
    const el = scrollRef.current;
    const cont = contRef.current;
    if (!el || !cont) return;

    const updateViewport = () => {
      const H = Math.max(1, cont.clientHeight || contHeight);
      const total = Math.max(contentHeight, 1);
      const ratio = H / total;
      const nextTop = el.scrollTop * ratio;
      const nextHeight = Math.max(el.clientHeight * ratio, 20);
      applyViewport(nextTop, nextHeight);
    };

    const onScroll = () => {
      updateViewport();
    };

    const ro = new ResizeObserver(updateViewport);
    ro.observe(cont);
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    updateViewport();

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [contentHeight, contHeight, scrollRef]);

  const handleClick = (event: React.MouseEvent) => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cont = contRef.current;
    const el = scrollRef.current;
    if (!cont || !el) return;

    const rect = cont.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(cont.clientHeight, 1);
    const nextTop = computeMiniMapTargetScrollTop(ratio, contentHeight, el.clientHeight);
    el.scrollTo({ top: nextTop, behavior: 'auto' });
    if (debugRef) {
      const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      const current = debugRef.current ?? { clickCount: 0, lastClickMs: 0 };
      debugRef.current = {
        clickCount: current.clickCount + 1,
        lastClickMs: duration,
      };
    }
  };

  return (
    <div
      ref={contRef}
      onClick={handleClick}
      className="relative overflow-hidden cursor-pointer shrink-0"
      style={{
        width: WIDTH,
        minWidth: WIDTH,
        background: T.bg0,
        borderLeft: `1px solid ${T.border}`,
      }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <div
        ref={viewportRef}
        className="minimap-viewport-frosted absolute pointer-events-none"
        style={{
          top: 0,
          height: 40,
          transform: 'translate3d(0, 0px, 0)',
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
});

export default WorkbookMiniMap;
