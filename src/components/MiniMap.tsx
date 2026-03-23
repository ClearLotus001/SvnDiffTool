// src/components/MiniMap.tsx
import { memo, useEffect, useRef, useState, RefObject } from 'react';
import type { DiffLine, SearchMatch } from '../types';
import { useTheme } from '../context/theme';
import { ROW_H } from '../hooks/useVirtual';

interface MiniMapProps {
  diffLines: DiffLine[];
  scrollRef: RefObject<HTMLDivElement>;
  totalH: number;
  searchMatches: SearchMatch[];
}

const MiniMap = memo(({ diffLines, scrollRef, totalH, searchMatches }: MiniMapProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ top: 0, h: 40 });
  const [contHeight, setContHeight] = useState(400);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;

    const updateHeight = () => {
      const nextHeight = Math.max(1, cont.clientHeight || 400);
      setContHeight(prev => (prev === nextHeight ? prev : nextHeight));
    };

    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(cont);
    updateHeight();

    return () => ro.disconnect();
  }, []);

  // Redraw canvas on data/theme change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = 64;
    const H = contHeight;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    const scale = H / Math.max(totalH, 1);

    diffLines.forEach((line, i) => {
      const y = Math.floor(i * ROW_H * scale);
      const h = Math.max(1, Math.ceil(ROW_H * scale));
      if      (line.type === 'add')    ctx.fillStyle = T.miniAdd;
      else if (line.type === 'delete') ctx.fillStyle = T.miniDel;
      else { ctx.fillStyle = T.bg3; ctx.fillRect(0, y, W, h); return; }
      ctx.fillRect(0, y, W, h);
    });

    // Search match overlays
    const matchSet = new Set(searchMatches.map(m => m.lineIdx));
    ctx.fillStyle = T.searchHl;
    matchSet.forEach(li => {
      ctx.fillRect(
        0,
        Math.floor(li * ROW_H * scale),
        W,
        Math.max(2, Math.ceil(ROW_H * scale)),
      );
    });
  }, [contHeight, diffLines, totalH, T, searchMatches]);

  // Viewport indicator
  useEffect(() => {
    const el   = scrollRef.current;
    const cont = contRef.current;
    if (!el || !cont) return;

    const update = () => {
      const H = Math.max(1, cont.clientHeight || contHeight);
      const ratio = H / Math.max(totalH, 1);
      setVp({ top: el.scrollTop * ratio, h: Math.max(el.clientHeight * ratio, 20) });
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    const ro = new ResizeObserver(() => update());
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(cont);
    update();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [contHeight, scrollRef, totalH]);

  const handleClick = (e: React.MouseEvent) => {
    const cont = contRef.current;
    const el   = scrollRef.current;
    if (!cont || !el) return;
    const rect = cont.getBoundingClientRect();
    el.scrollTop = ((e.clientY - rect.top) / cont.clientHeight) * totalH;
  };

  return (
    <div
      ref={contRef}
      onClick={handleClick}
      style={{
        width: 64,
        background: T.bg1,
        borderLeft: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
        alignSelf: 'stretch',
      }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          imageRendering: 'pixelated',
        }} />
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: vp.top, height: vp.h,
        background: T.miniVp,
        border: '1px solid rgba(255,255,255,0.18)',
        pointerEvents: 'none',
      }} />
    </div>
  );
});

export default MiniMap;
