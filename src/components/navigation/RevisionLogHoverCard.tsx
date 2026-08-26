import {
  memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/context/i18n';
import { cssAlphaRaw } from '@/theme/cssUtils';

interface RevisionLogHoverCardProps {
  accent: string;
  displayText: string;
  detailText?: string;
  author?: string;
  date?: string;
  revision?: string;
  muted?: boolean;
}

const MAX_CARD_WIDTH = 520;
const VIEWPORT_PADDING = 12;
const PANEL_GAP = 10;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function computeHoverCardLayout(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  bubbleWidth: number,
  bubbleHeight: number,
) {
  const canPlaceBottom = viewportHeight - rect.bottom >= bubbleHeight + PANEL_GAP + VIEWPORT_PADDING;
  const canPlaceTop = rect.top >= bubbleHeight + PANEL_GAP + VIEWPORT_PADDING;
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_PADDING),
    Math.max(VIEWPORT_PADDING, viewportWidth - bubbleWidth - VIEWPORT_PADDING),
  );
  return {
    left,
    top: canPlaceBottom || !canPlaceTop
      ? rect.bottom + PANEL_GAP
      : rect.top - bubbleHeight - PANEL_GAP,
  };
}

const RevisionLogHoverCard = memo(({
  accent, displayText, detailText = '',
  author = '', date = '', revision = '', muted = false,
}: RevisionLogHoverCardProps) => {
  const { t } = useI18n();
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 420, height: 120 });

  const normalizedDisplayText = displayText.trim();
  const normalizedDetailText = detailText.trim();
  const metaText = [author.trim(), date.trim()].filter(Boolean).join(' · ');
  const hasHoverCard = Boolean(normalizedDetailText);

  const updateRect = () => {
    const nextRect = anchorRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
  };

  useEffect(() => {
    if (!open || !hasHoverCard) return;
    updateRect();
    const onFrame = () => updateRect();
    window.addEventListener('resize', onFrame);
    window.addEventListener('scroll', onFrame, true);
    return () => {
      window.removeEventListener('resize', onFrame);
      window.removeEventListener('scroll', onFrame, true);
    };
  }, [hasHoverCard, open]);

  useIsomorphicLayoutEffect(() => {
    if (!open || !hasHoverCard) return;
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const nextWidth = Math.ceil(bubble.offsetWidth);
    const nextHeight = Math.ceil(bubble.offsetHeight);
    setBubbleSize((prev) => (
      prev.width === nextWidth && prev.height === nextHeight ? prev : { width: nextWidth, height: nextHeight }
    ));
  }, [hasHoverCard, metaText, normalizedDetailText, open, rect, revision]);

  const layout = useMemo(() => {
    if (!open || !rect || typeof window === 'undefined' || !hasHoverCard) return null;
    return computeHoverCardLayout(rect, window.innerWidth, window.innerHeight, bubbleSize.width, bubbleSize.height);
  }, [bubbleSize.height, bubbleSize.width, hasHoverCard, open, rect]);

  const hoverCard = open && hasHoverCard && layout && typeof document !== 'undefined'
    ? createPortal(
        <div
          id={id}
          role="dialog"
          aria-label={t('revisionPickerColumnMessage')}
          className="fixed z-[9999] pointer-events-none"
          style={{ left: layout.left, top: layout.top }}>
          <div
            ref={bubbleRef}
            className="motion-hover-card relative p-[14px_16px_15px] rounded-[18px] border border-border-default bg-bg-base text-text-title text-left"
            style={{
              width: `min(${MAX_CARD_WIDTH}px, calc(100vw - 24px))`,
              maxWidth: MAX_CARD_WIDTH,
              boxShadow: `0 28px 60px -34px var(--liquid-glass-shadow), 0 12px 28px -20px ${cssAlphaRaw(accent, '55')}`,
              backdropFilter: 'blur(14px)',
            }}>
            <div className="grid gap-2.5 min-w-0">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 min-w-0">
                <span
                  className="font-ui text-[11px] font-extrabold tracking-wider uppercase leading-none whitespace-nowrap"
                  style={{ color: `var(${accent})` }}>
                  {t('revisionPickerColumnMessage')}
                </span>
                {(metaText || revision) && (
                  <div className="flex items-baseline justify-end gap-3 min-w-0">
                    {metaText && (
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-text-secondary font-ui text-[11px] leading-none tabular-nums">
                        {metaText}
                      </span>
                    )}
                    {revision && (
                      <span className="shrink-0 text-text-secondary font-code text-[11px] leading-none font-bold whitespace-nowrap tabular-nums">
                        {revision}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${cssAlphaRaw(accent, '55')} 0%, var(--border-color) 42%, var(--border-color) 100%)` }} />
              <div className="text-text-title font-ui text-[13px] font-semibold leading-relaxed whitespace-pre-wrap break-words">
                {normalizedDetailText}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        ref={anchorRef}
        aria-describedby={open && hasHoverCard ? id : undefined}
        tabIndex={hasHoverCard ? 0 : -1}
        onMouseEnter={hasHoverCard ? () => setOpen(true) : undefined}
        onMouseLeave={hasHoverCard ? () => setOpen(false) : undefined}
        onFocus={hasHoverCard ? () => setOpen(true) : undefined}
        onBlur={hasHoverCard ? () => setOpen(false) : undefined}
        className={`
          block w-full min-w-0 py-0.5 rounded-[10px]
          font-ui overflow-hidden text-ellipsis whitespace-nowrap
          outline-none transition-[background,color] duration-150
          ${muted ? 'text-text-secondary text-[11px] font-medium' : 'text-text-title text-[13px] font-semibold'}
        `}
        style={{
          background: open && hasHoverCard ? cssAlphaRaw(accent, '0f') : 'transparent',
          lineHeight: 1.45,
        }}>
        {normalizedDisplayText}
      </span>
      {hoverCard}
    </>
  );
});

export default RevisionLogHoverCard;
