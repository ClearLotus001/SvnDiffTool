import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import Tooltip from './Tooltip';

interface CollapseJumpButtonProps {
  onPrev: () => void;
  onNext: () => void;
  currentIndex: number;
  totalCount: number;
  storageKey?: string;
}

interface FloatingPosition {
  right: number;
  bottom: number;
}

interface SnapPreview {
  horizontal: 'left' | 'right' | null;
  vertical: 'top' | 'bottom' | null;
}

interface DragState {
  startX: number;
  startY: number;
  startRight: number;
  startBottom: number;
  parentWidth: number;
  parentHeight: number;
}

const STORAGE_PREFIX = 'svn-diff-tool.collapse-jump-position';
const EDGE_PADDING = 8;
const SNAP_THRESHOLD = 24;
const DEFAULT_POSITION: FloatingPosition = { right: 10, bottom: 10 };
const BADGE_SIZE = 24;
const DOCK_HANG_OFFSET = 10;
const PANEL_GAP = 18;
const COLLAPSE_DELAY_MS = 120;

const CollapseJumpButton = memo(({
  onPrev,
  onNext,
  currentIndex,
  totalCount,
  storageKey,
}: CollapseJumpButtonProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<FloatingPosition>(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dockedHorizontal, setDockedHorizontal] = useState<'left' | 'right' | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPreview>({ horizontal: null, vertical: null });
  const [snapPulseNonce, setSnapPulseNonce] = useState(0);

  if (totalCount <= 0) return null;

  const clampPosition = (
    next: FloatingPosition,
    parentWidth: number,
    parentHeight: number,
  ): FloatingPosition => {
    const maxRight = Math.max(EDGE_PADDING, parentWidth - BADGE_SIZE - EDGE_PADDING);
    const maxBottom = Math.max(EDGE_PADDING, parentHeight - BADGE_SIZE - EDGE_PADDING);
    return {
      right: Math.max(EDGE_PADDING, Math.min(next.right, maxRight)),
      bottom: Math.max(EDGE_PADDING, Math.min(next.bottom, maxBottom)),
    };
  };

  const resolveDockedHorizontal = (
    next: FloatingPosition,
    parentWidth: number,
  ): SnapPreview['horizontal'] => {
    const maxRight = Math.max(EDGE_PADDING, parentWidth - BADGE_SIZE - EDGE_PADDING);
    if (Math.abs(next.right - maxRight) <= 1) return 'left';
    if (Math.abs(next.right - EDGE_PADDING) <= 1) return 'right';
    return null;
  };

  const applySnap = (
    next: FloatingPosition,
    parentWidth: number,
    parentHeight: number,
  ) => {
    const maxRight = Math.max(EDGE_PADDING, parentWidth - BADGE_SIZE - EDGE_PADDING);
    const maxBottom = Math.max(EDGE_PADDING, parentHeight - BADGE_SIZE - EDGE_PADDING);
    const clamped = clampPosition(next, parentWidth, parentHeight);
    const leftDistance = Math.abs(maxRight - clamped.right);
    const rightDistance = Math.abs(clamped.right - EDGE_PADDING);
    const topDistance = Math.abs(maxBottom - clamped.bottom);
    const bottomDistance = Math.abs(clamped.bottom - EDGE_PADDING);

    const horizontal: SnapPreview['horizontal'] = leftDistance <= SNAP_THRESHOLD
      ? 'left'
      : rightDistance <= SNAP_THRESHOLD
      ? 'right'
      : null;
    const vertical: SnapPreview['vertical'] = topDistance <= SNAP_THRESHOLD
      ? 'top'
      : bottomDistance <= SNAP_THRESHOLD
      ? 'bottom'
      : null;

    return {
      position: {
        right: horizontal === 'left'
          ? maxRight
          : horizontal === 'right'
          ? EDGE_PADDING
          : clamped.right,
        bottom: vertical === 'top'
          ? maxBottom
          : vertical === 'bottom'
          ? EDGE_PADDING
          : clamped.bottom,
      },
      preview: { horizontal, vertical },
    };
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const anchor = anchorRef.current;
    const parent = anchor?.offsetParent;
    if (!(anchor instanceof HTMLElement) || !(parent instanceof HTMLElement)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button')) return;
    if (target?.dataset.dragReset === 'true' && event.detail > 1) return;

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      parentWidth: parent.clientWidth,
      parentHeight: parent.clientHeight,
    };
    setIsDragging(true);
    setIsHovered(false);
    event.preventDefault();
  };

  useLayoutEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${storageKey}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FloatingPosition> | null;
      if (typeof parsed?.right !== 'number' || typeof parsed?.bottom !== 'number') return;
      setPosition({ right: parsed.right, bottom: parsed.bottom });
    } catch {
      // ignore bad persisted position
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(`${STORAGE_PREFIX}:${storageKey}`, JSON.stringify(position));
  }, [position, storageKey]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const parent = anchor?.offsetParent;
    if (!(anchor instanceof HTMLElement) || !(parent instanceof HTMLElement)) return;

    const updatePosition = () => {
      setPosition((prev) => {
        const clamped = clampPosition(prev, parent.clientWidth, parent.clientHeight);
        if (dockedHorizontal) {
          return {
            ...clamped,
            right: dockedHorizontal === 'left'
              ? Math.max(EDGE_PADDING, parent.clientWidth - BADGE_SIZE - EDGE_PADDING)
              : EDGE_PADDING,
          };
        }
        return clamped;
      });
    };

    updatePosition();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updatePosition)
      : null;
    observer?.observe(parent);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [dockedHorizontal]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const next = applySnap(
        {
          right: state.startRight - deltaX,
          bottom: state.startBottom - deltaY,
        },
        state.parentWidth,
        state.parentHeight,
      );
      setSnapPreview(next.preview);
      setPosition(next.position);
    };

    const handlePointerUp = () => {
      const anchor = anchorRef.current;
      const parent = anchor?.offsetParent;
      if (anchor instanceof HTMLElement && parent instanceof HTMLElement) {
        const nextDock = resolveDockedHorizontal(position, parent.clientWidth);
        setDockedHorizontal(nextDock);
        if (nextDock) setSnapPulseNonce((value) => value + 1);
      }
      dragStateRef.current = null;
      setIsDragging(false);
      setIsHovered(false);
      setSnapPreview({ horizontal: null, vertical: null });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, position]);

  useEffect(() => () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const statusText = currentIndex > 0
    ? t('collapseJumpStatus', { current: currentIndex, total: totalCount })
    : t('collapseJumpStatus', { current: 1, total: totalCount });
  const activeDockSide = snapPreview.horizontal ?? dockedHorizontal;
  const isDockCollapsed = Boolean(dockedHorizontal && !isHovered && !isDragging);
  const badgeText = isDockCollapsed
    ? (currentIndex > 0 ? String(currentIndex) : String(totalCount))
    : currentIndex > 0
    ? `${currentIndex}/${totalCount}`
    : `${totalCount}`;

  const anchorStyle = {
    position: 'absolute',
    zIndex: 34,
    right: position.right,
    bottom: position.bottom,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    transform: activeDockSide === 'left'
      ? `translateX(${-DOCK_HANG_OFFSET}px)`
      : activeDockSide === 'right'
      ? `translateX(${DOCK_HANG_OFFSET}px)`
      : 'translateX(0)',
    transition: isDragging ? 'none' : 'transform 180ms ease',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    overflow: 'visible',
  } as const;

  const badgeStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 999,
    background: isDockCollapsed ? T.acc2 : `${T.acc2}16`,
    color: isDockCollapsed ? T.bg0 : T.acc2,
    border: `1px solid ${activeDockSide ? `${T.acc2}66` : T.border}`,
    boxShadow: activeDockSide
      ? `0 0 0 1px ${T.acc2}22, 0 12px 24px -18px ${T.acc2}66`
      : `0 12px 24px -18px ${T.border2}`,
    fontSize: isDockCollapsed ? 10 : 9,
    fontWeight: 800,
    fontFamily: FONT_UI,
    userSelect: 'none',
    backdropFilter: 'blur(6px)',
    transition: isDragging ? 'none' : 'all 160ms ease',
  } as const;

  const panelStyle: CSSProperties = (() => {
    if (!dockedHorizontal) {
      return {
        position: 'absolute' as const,
        left: '50%',
        bottom: BADGE_SIZE + PANEL_GAP,
        transform: 'translateX(-50%)',
        opacity: 1,
      };
    }

    const base = {
      position: 'absolute',
      bottom: 0,
      opacity: isDockCollapsed ? 0 : 1,
      pointerEvents: isDockCollapsed ? 'none' : 'auto',
      transition: isDragging ? 'none' : 'opacity 160ms ease, transform 180ms ease',
    } as const;

    return dockedHorizontal === 'left'
      ? {
          ...base,
          left: BADGE_SIZE + 8,
          transform: `translateX(${isDockCollapsed ? -10 : 0}px)`,
        }
      : {
          ...base,
          right: BADGE_SIZE + 8,
          transform: `translateX(${isDockCollapsed ? 10 : 0}px)`,
        };
  })();

  const panelShellStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '6px 5px',
    borderRadius: 16,
    border: `1px solid ${activeDockSide ? `${T.acc2}66` : T.border}`,
    background: `${T.bg1}e8`,
    boxShadow: activeDockSide
      ? `0 0 0 1px ${T.acc2}22, 0 18px 36px -24px ${T.acc2}66`
      : `0 18px 32px -24px ${T.border2}`,
    backdropFilter: 'blur(6px)',
  } as const;

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
    color: T.t0,
    fontFamily: FONT_UI,
    fontSize: FONT_SIZE.xs,
    fontWeight: 800,
    boxShadow: `0 10px 20px -18px ${T.border2}`,
    cursor: 'pointer',
    lineHeight: 1,
  } as const;

  return (
    <div
      ref={anchorRef}
      onPointerDown={startDrag}
      onMouseEnter={() => {
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = setTimeout(() => {
          setIsHovered(false);
          collapseTimerRef.current = null;
        }, dockedHorizontal ? COLLAPSE_DELAY_MS : 0);
      }}
      onFocus={() => {
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
        setIsHovered(true);
      }}
      onBlur={() => {
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = setTimeout(() => {
          setIsHovered(false);
          collapseTimerRef.current = null;
        }, dockedHorizontal ? COLLAPSE_DELAY_MS : 0);
      }}
      style={anchorStyle}>
      {activeDockSide && (
        <span
          key={`${activeDockSide}-${snapPulseNonce}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -6,
            bottom: -6,
            width: 3,
            borderRadius: 999,
            background: `linear-gradient(180deg, ${T.acc2}00 0%, ${T.acc2}cc 18%, ${T.acc2}cc 82%, ${T.acc2}00 100%)`,
            boxShadow: `0 0 0 1px ${T.acc2}22, 0 0 16px ${T.acc2}55`,
            left: activeDockSide === 'left' ? -8 : undefined,
            right: activeDockSide === 'right' ? -8 : undefined,
            animation: snapPulseNonce > 0 ? 'collapseDockPulse 420ms ease-out 1' : undefined,
          }}
        />
      )}

      <span
        onDoubleClick={() => {
          dragStateRef.current = null;
          setIsDragging(false);
          setSnapPreview({ horizontal: null, vertical: null });
          setDockedHorizontal(null);
          setPosition(DEFAULT_POSITION);
        }}
        data-drag-reset="true"
        style={badgeStyle}>
        {badgeText}
      </span>

      <div style={panelStyle}>
        <div style={panelShellStyle}>
          <Tooltip content={
            <div style={{ display: 'grid', gap: 2 }}>
              <span>{t('collapseJumpPrevTitle')}</span>
              <span style={{ color: T.t2, fontSize: 11 }}>{statusText}</span>
            </div>
          } placement="top">
            <button type="button" onClick={onPrev} aria-label={t('collapseJumpPrevTitle')} style={buttonStyle}>
              ↑
            </button>
          </Tooltip>
          <Tooltip content={
            <div style={{ display: 'grid', gap: 2 }}>
              <span>{t('collapseJumpNextTitle')}</span>
              <span style={{ color: T.t2, fontSize: 11 }}>{statusText}</span>
            </div>
          } placement="top">
            <button type="button" onClick={onNext} aria-label={t('collapseJumpNextTitle')} style={buttonStyle}>
              ↓
            </button>
          </Tooltip>
        </div>
      </div>

      <style>{`
        @keyframes collapseDockPulse {
          0% { opacity: 0.2; transform: scaleY(0.82); }
          35% { opacity: 1; transform: scaleY(1.18); }
          100% { opacity: 0.92; transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
});

export default CollapseJumpButton;
