// src/components/MiniMap.tsx
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DiffLine, SearchMatch } from '@/types';
import { useThemeTokens } from '@/context/theme';
import { buildReplacementPairIndex } from '@/engine/text/textChangeAlignment';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

interface MiniMapProps {
  diffLines: DiffLine[];
  scrollRef: RefObject<HTMLDivElement>;
  totalH: number;
  searchMatches: SearchMatch[];
}

export type MiniMapLineTone = 'equal' | 'add' | 'delete' | 'modify';

export function resolveMiniMapLineTone(
  line: DiffLine,
  lineIdx: number,
  replacementPairIndex: ReadonlyMap<number, number>,
): MiniMapLineTone {
  if (line.type === 'equal') return 'equal';
  if (replacementPairIndex.has(lineIdx)) return 'modify';
  return line.type;
}

const MiniMap = memo(({ diffLines, scrollRef, totalH, searchMatches }: MiniMapProps) => {
  const T = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [contHeight, setContHeight] = useState(400);
  const replacementPairIndex = useMemo(() => buildReplacementPairIndex(diffLines), [diffLines]);

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
    const W = 64;
    const H = contHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = T.bg3;
    ctx.fillRect(0, 0, W, H);
    const scale = H / Math.max(totalH, 1);
    for (let i = 0; i < diffLines.length; i += 1) {
      const line = diffLines[i]!;
      const y = Math.floor(i * ROW_H * scale);
      const h = Math.max(1, Math.ceil(ROW_H * scale));
      const tone = resolveMiniMapLineTone(line, i, replacementPairIndex);
      if (tone === 'modify') {
        ctx.fillStyle = T.chgBrd;
      } else if (tone === 'add') {
        ctx.fillStyle = T.miniAdd;
      } else if (tone === 'delete') {
        ctx.fillStyle = T.miniDel;
      } else {
        continue;
      }
      ctx.fillRect(0, y, W, h);
    }
    const matchSet = new Set(searchMatches.map((m) => m.lineIdx));
    const searchMarkerWidth = 8;
    ctx.fillStyle = T.searchHl;
    matchSet.forEach((li) => {
      ctx.fillRect(
        W - searchMarkerWidth,
        Math.floor(li * ROW_H * scale),
        searchMarkerWidth,
        Math.max(2, Math.ceil(ROW_H * scale)),
      );
    });
  }, [contHeight, diffLines, replacementPairIndex, totalH, T, searchMatches]);

  useEffect(() => {
    const el = scrollRef.current;
    const cont = contRef.current;
    if (!el || !cont) return;
    const update = () => {
      const H = Math.max(1, cont.clientHeight || contHeight);
      const ratio = H / Math.max(totalH, 1);
      applyViewport(el.scrollTop * ratio, Math.max(el.clientHeight * ratio, 20));
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
  }, [contHeight, scrollRef, totalH]);

  const handleClick = (e: React.MouseEvent) => {
    const cont = contRef.current;
    const el = scrollRef.current;
    if (!cont || !el) return;
    const rect = cont.getBoundingClientRect();
    el.scrollTop = ((e.clientY - rect.top) / cont.clientHeight) * totalH;
  };

  return (
    <div
      ref={contRef}
      onClick={handleClick}
      className="w-16 relative overflow-hidden cursor-pointer shrink-0 self-stretch border-l border-border-default"
      style={{ background: T.bg1 }}>
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
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

export default MiniMap;
