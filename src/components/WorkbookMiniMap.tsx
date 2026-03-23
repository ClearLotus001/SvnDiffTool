import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { useTheme } from '../context/theme';

export type WorkbookMiniMapTone = 'equal' | 'add' | 'delete' | 'mixed';

export interface WorkbookMiniMapSegment {
  tone: WorkbookMiniMapTone;
  height: number;
  searchHit?: boolean;
}

interface WorkbookMiniMapProps {
  segments: WorkbookMiniMapSegment[];
  scrollRef: RefObject<HTMLDivElement>;
  contentHeight: number;
}

const WIDTH = 28;

const WorkbookMiniMap = memo(({
  segments,
  scrollRef,
  contentHeight,
}: WorkbookMiniMapProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [contHeight, setContHeight] = useState(320);
  const [vp, setVp] = useState({ top: 0, h: 40 });

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

      if (segment.tone === 'add') ctx.fillStyle = T.miniAdd;
      else if (segment.tone === 'delete') ctx.fillStyle = T.miniDel;
      else if (segment.tone === 'mixed') ctx.fillStyle = T.acc;
      else ctx.fillStyle = T.bg3;

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
      setVp({
        top: el.scrollTop * ratio,
        h: Math.max(el.clientHeight * ratio, 20),
      });
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateViewport);
    };

    const ro = new ResizeObserver(updateViewport);
    ro.observe(cont);
    el.addEventListener('scroll', onScroll, { passive: true });
    updateViewport();

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [contentHeight, contHeight, scrollRef]);

  const handleClick = (event: React.MouseEvent) => {
    const cont = contRef.current;
    const el = scrollRef.current;
    if (!cont || !el) return;

    const rect = cont.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(cont.clientHeight, 1);
    el.scrollTop = Math.max(0, ratio * contentHeight);
  };

  return (
    <div
      ref={contRef}
      onClick={handleClick}
      style={{
        width: WIDTH,
        minWidth: WIDTH,
        background: T.bg0,
        borderLeft: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
      }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: vp.top,
          height: vp.h,
          background: T.miniVp,
          border: `1px solid ${T.border}`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export default WorkbookMiniMap;
