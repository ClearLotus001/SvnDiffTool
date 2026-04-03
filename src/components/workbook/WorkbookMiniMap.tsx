import { memo, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useThemeTokens } from '@/context/theme';
import { resolveWorkbookMiniMapColor } from '@/utils/workbook/workbookRowVisuals';

export type WorkbookMiniMapTone = 'equal' | 'add' | 'delete' | 'mixed';

export interface WorkbookMiniMapSegment {
  tone: WorkbookMiniMapTone;
  height: number;
  searchHit?: boolean;
}

export interface WorkbookMiniMapDebugStats {
  clickCount: number;
  lastClickMs: number;
}

interface WorkbookMiniMapProps {
  segments: WorkbookMiniMapSegment[];
  scrollRef: RefObject<HTMLDivElement>;
  contentHeight: number;
  debugRef?: MutableRefObject<WorkbookMiniMapDebugStats | null>;
}

const WIDTH = 28;

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

const WorkbookMiniMap = memo(({
  segments,
  scrollRef,
  contentHeight,
  debugRef,
}: WorkbookMiniMapProps) => {
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

    const resolvedSegments = segments.length > 0
      ? segments
      : [{ tone: 'equal' as const, height: Math.max(1, contentHeight) }];
    const total = Math.max(contentHeight, resolvedSegments.reduce((sum, segment) => sum + segment.height, 0), 1);
    const scale = H / total;

    ctx.clearRect(0, 0, WIDTH, H);

    let offset = 0;
    resolvedSegments.forEach((segment) => {
      const y = Math.floor(offset * scale);
      const h = Math.max(1, Math.ceil(segment.height * scale));

      ctx.fillStyle = resolveWorkbookMiniMapColor(T, segment.tone);

      ctx.fillRect(0, y, WIDTH, h);

      if (segment.searchHit) {
        ctx.fillStyle = T.searchHl;
        ctx.fillRect(0, y, WIDTH, Math.max(2, h));
      }

      offset += segment.height;
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
    </div>
  );
});

export default WorkbookMiniMap;
