import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';

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
  accent,
  displayText,
  detailText = '',
  author = '',
  date = '',
  revision = '',
  muted = false,
}: RevisionLogHoverCardProps) => {
  const T = useTheme();
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
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    ));
  }, [hasHoverCard, metaText, normalizedDetailText, open, rect, revision]);

  const layout = useMemo(() => {
    if (!open || !rect || typeof window === 'undefined' || !hasHoverCard) return null;
    return computeHoverCardLayout(
      rect,
      window.innerWidth,
      window.innerHeight,
      bubbleSize.width,
      bubbleSize.height,
    );
  }, [bubbleSize.height, bubbleSize.width, hasHoverCard, open, rect]);

  const hoverCard = open
    && hasHoverCard
    && layout
    && typeof document !== 'undefined'
    ? createPortal(
        <div
          id={id}
          role="dialog"
          aria-label={t('revisionPickerColumnMessage')}
          style={{
            position: 'fixed',
            left: layout.left,
            top: layout.top,
            zIndex: 9999,
            pointerEvents: 'none',
          }}>
          <div
            ref={bubbleRef}
            style={{
              position: 'relative',
              width: `min(${MAX_CARD_WIDTH}px, calc(100vw - 24px))`,
              maxWidth: MAX_CARD_WIDTH,
              padding: '14px 16px 15px',
              borderRadius: 18,
              border: `1px solid ${T.border}`,
              background: T.bg0,
              boxShadow: `0 28px 60px -34px rgba(0, 0, 0, 0.28), 0 12px 28px -20px ${accent}55`,
              color: T.t0,
              textAlign: 'left',
              backdropFilter: 'blur(14px)',
            }}>
            <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  minWidth: 0,
                }}>
                <span
                  style={{
                    color: accent,
                    fontFamily: FONT_UI,
                    fontSize: FONT_SIZE.xs,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>
                  {t('revisionPickerColumnMessage')}
                </span>
                {revision && (
                  <span
                    style={{
                      color: T.t2,
                      fontFamily: FONT_CODE,
                      fontSize: FONT_SIZE.xs,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}>
                    {revision}
                  </span>
                )}
              </div>
              <div
                aria-hidden="true"
                style={{
                  height: 1,
                  width: '100%',
                  background: `linear-gradient(90deg, ${accent}55 0%, ${T.border} 42%, ${T.border} 100%)`,
                }}
              />
              {metaText && (
                <div
                  style={{
                    color: T.t2,
                    fontFamily: FONT_UI,
                    fontSize: FONT_SIZE.xs,
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                  {metaText}
                </div>
              )}
              <div
                style={{
                  color: T.t0,
                  fontFamily: FONT_UI,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: 600,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
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
        style={{
          display: 'block',
          width: '100%',
          minWidth: 0,
          padding: '3px 0',
          borderRadius: 10,
          background: open && hasHoverCard ? `${accent}0f` : 'transparent',
          color: muted ? T.t2 : T.t0,
          fontFamily: FONT_UI,
          fontSize: muted ? FONT_SIZE.xs : FONT_SIZE.sm,
          fontWeight: muted ? 500 : 600,
          lineHeight: 1.45,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          outline: 'none',
          transition: 'background 120ms ease, color 120ms ease',
        }}>
        {normalizedDisplayText}
      </span>
      {hoverCard}
    </>
  );
});

export default RevisionLogHoverCard;
