import { memo, useId, type CSSProperties } from 'react';
import { useTheme } from '@/context/theme';
import type { WorkbookRegionOverlayBox as WorkbookDiffRegionOverlayBox } from '@/utils/workbook/workbookRegionOverlay';

export type { WorkbookDiffRegionOverlayBox };

const MERGE_GAP = 6;
const EDGE_ALIGN_TOLERANCE = 20;
const MIN_HORIZONTAL_OVERLAP_RATIO = 0.72;
const BORDER_RADIUS = 12;
const EDGE_WIDTH = 2;
const EDGE_INSET = 6;
const CORNER_SIZE = 14;

function resolveOpenTop(box: WorkbookDiffRegionOverlayBox) {
  return Boolean(box.openTop);
}

function resolveOpenBottom(box: WorkbookDiffRegionOverlayBox) {
  return Boolean(box.openBottom);
}

export function mergeWorkbookDiffRegionOverlayBoxes(
  boxes: WorkbookDiffRegionOverlayBox[],
): WorkbookDiffRegionOverlayBox[] {
  const pending = boxes
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => ({ ...box }));
  const merged: WorkbookDiffRegionOverlayBox[] = [];

  while (pending.length > 0) {
    const seed = pending.shift()!;
    let nextBox = seed;
    let didMerge = true;

    while (didMerge) {
      didMerge = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const candidate = pending[index]!;
        const seedRight = nextBox.left + nextBox.width;
        const seedBottom = nextBox.top + nextBox.height;
        const candidateRight = candidate.left + candidate.width;
        const candidateBottom = candidate.top + candidate.height;
        const overlapsY = nextBox.top <= candidateBottom + MERGE_GAP
          && seedBottom >= candidate.top - MERGE_GAP;
        const overlapWidth = Math.min(seedRight, candidateRight) - Math.max(nextBox.left, candidate.left);
        const minWidth = Math.max(1, Math.min(nextBox.width, candidate.width));
        const horizontallyAligned = overlapWidth > 0
          && overlapWidth >= (minWidth * MIN_HORIZONTAL_OVERLAP_RATIO)
          && Math.abs(nextBox.left - candidate.left) <= EDGE_ALIGN_TOLERANCE
          && Math.abs(seedRight - candidateRight) <= EDGE_ALIGN_TOLERANCE;
        if (!overlapsY || !horizontallyAligned) continue;

        const left = Math.min(nextBox.left, candidate.left);
        const top = Math.min(nextBox.top, candidate.top);
        const right = Math.max(seedRight, candidateRight);
        const bottom = Math.max(seedBottom, candidateBottom);
        nextBox = {
          key: `${nextBox.key}:${candidate.key}`,
          left,
          top,
          width: right - left,
          height: bottom - top,
          openTop: top === nextBox.top
            ? resolveOpenTop(nextBox)
            : resolveOpenTop(candidate),
          openBottom: bottom === seedBottom
            ? resolveOpenBottom(nextBox)
            : resolveOpenBottom(candidate),
        };
        pending.splice(index, 1);
        didMerge = true;
      }
    }

    merged.push(nextBox);
  }

  return merged.sort((left, right) => (
    left.top - right.top
    || left.left - right.left
    || left.width - right.width
    || left.height - right.height
  ));
}

interface WorkbookDiffRegionOverlayProps {
  boxes: WorkbookDiffRegionOverlayBox[];
}

function buildOverlayPath(
  width: number,
  height: number,
  radius: number,
  openTop: boolean,
  openBottom: boolean,
) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(w, h) / 2)));

  if (w <= 0 || h <= 0) return '';
  if (openTop && openBottom) {
    return `M 0 0 L 0 ${h} M ${w} 0 L ${w} ${h}`;
  }
  if (openTop) {
    return `M 0 0 L 0 ${Math.max(0, h - r)} Q 0 ${h} ${r} ${h} L ${Math.max(r, w - r)} ${h} Q ${w} ${h} ${w} ${Math.max(0, h - r)} L ${w} 0`;
  }
  if (openBottom) {
    return `M 0 ${h} L 0 ${r} Q 0 0 ${r} 0 L ${Math.max(r, w - r)} 0 Q ${w} 0 ${w} ${r} L ${w} ${h}`;
  }
  return `M ${r} 0 L ${Math.max(r, w - r)} 0 Q ${w} 0 ${w} ${r} L ${w} ${Math.max(r, h - r)} Q ${w} ${h} ${Math.max(r, w - r)} ${h} L ${r} ${h} Q 0 ${h} 0 ${Math.max(r, h - r)} L 0 ${r} Q 0 0 ${r} 0`;
}

const WorkbookDiffRegionOverlay = memo(({ boxes }: WorkbookDiffRegionOverlayProps) => {
  const T = useTheme();
  const gradientSeed = useId().replace(/:/g, '');

  if (boxes.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 8,
      }}>
      {boxes.map((box) => {
        const openTop = resolveOpenTop(box);
        const openBottom = resolveOpenBottom(box);
        const radius = Math.max(7, Math.min(BORDER_RADIUS, Math.floor(Math.min(box.width, box.height) / 5)));
        const cornerRadius = `${openTop ? 0 : radius}px ${openTop ? 0 : radius}px ${openBottom ? 0 : radius}px ${openBottom ? 0 : radius}px`;
        const path = buildOverlayPath(box.width, box.height, radius, openTop, openBottom);
        const gradientId = `region-rainbow-${gradientSeed}-${box.key}`;
        const shineId = `region-shine-${gradientSeed}-${box.key}`;

        const outerStyle: CSSProperties = {
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
          overflow: 'visible',
          animation: 'guidedPulse 0.82s cubic-bezier(0.22, 1, 0.36, 1) 1',
        };
        const baseFrameStyle: CSSProperties = {
          position: 'absolute',
          inset: 0,
          borderRadius: cornerRadius,
          boxSizing: 'border-box',
          background: 'transparent',
          boxShadow: `inset 0 0 0 1px ${T.t0}10`,
        };
        const railStyle: CSSProperties = {
          position: 'absolute',
          top: openTop ? 0 : EDGE_INSET,
          bottom: openBottom ? 0 : EDGE_INSET,
          width: EDGE_WIDTH,
          borderRadius: EDGE_WIDTH,
          background: `linear-gradient(180deg, ${T.acc2}d0 0%, ${T.chgTx}a8 45%, ${T.acc}d0 100%)`,
          opacity: 0.68,
        };
        const continuationStyle: CSSProperties = {
          position: 'absolute',
          left: 2,
          right: 2,
          height: 6,
          background: `linear-gradient(90deg, transparent 0%, ${T.acc2}38 18%, ${T.chgTx}44 50%, ${T.acc}38 82%, transparent 100%)`,
          opacity: 0.65,
        };

        return (
          <div key={box.key} style={outerStyle}>
            <div style={baseFrameStyle} />
            <div style={{ ...railStyle, left: 0 }} />
            <div style={{ ...railStyle, right: 0 }} />

            {!openTop && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: EDGE_INSET,
                  right: EDGE_INSET,
                  height: EDGE_WIDTH,
                  borderRadius: EDGE_WIDTH,
                  background: `linear-gradient(90deg, ${T.acc2}c6 0%, ${T.chgTx}a2 52%, ${T.acc}c6 100%)`,
                  opacity: 0.68,
                }}
              />
            )}
            {!openBottom && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: EDGE_INSET,
                  right: EDGE_INSET,
                  height: EDGE_WIDTH,
                  borderRadius: EDGE_WIDTH,
                  background: `linear-gradient(90deg, ${T.acc2}c6 0%, ${T.chgTx}a2 52%, ${T.acc}c6 100%)`,
                  opacity: 0.68,
                }}
              />
            )}

            {openTop && <div style={{ ...continuationStyle, top: -1 }} />}
            {openBottom && <div style={{ ...continuationStyle, bottom: -1 }} />}

            {!openTop && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: CORNER_SIZE,
                    height: CORNER_SIZE,
                    borderTop: `${EDGE_WIDTH}px solid ${T.acc2}`,
                    borderLeft: `${EDGE_WIDTH}px solid ${T.acc2}`,
                    borderTopLeftRadius: radius,
                    opacity: 0.8,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: CORNER_SIZE,
                    height: CORNER_SIZE,
                    borderTop: `${EDGE_WIDTH}px solid ${T.acc}`,
                    borderRight: `${EDGE_WIDTH}px solid ${T.acc}`,
                    borderTopRightRadius: radius,
                    opacity: 0.8,
                  }}
                />
              </>
            )}

            {!openBottom && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: CORNER_SIZE,
                    height: CORNER_SIZE,
                    borderBottom: `${EDGE_WIDTH}px solid ${T.acc}`,
                    borderLeft: `${EDGE_WIDTH}px solid ${T.acc}`,
                    borderBottomLeftRadius: radius,
                    opacity: 0.76,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: CORNER_SIZE,
                    height: CORNER_SIZE,
                    borderBottom: `${EDGE_WIDTH}px solid ${T.acc2}`,
                    borderRight: `${EDGE_WIDTH}px solid ${T.acc2}`,
                    borderBottomRightRadius: radius,
                    opacity: 0.76,
                  }}
                />
              </>
            )}

            <svg
              width={Math.max(0, box.width)}
              height={Math.max(0, box.height)}
              viewBox={`0 0 ${Math.max(0, box.width)} ${Math.max(0, box.height)}`}
              style={{
                position: 'absolute',
                inset: 0,
                overflow: 'visible',
              }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={T.acc2} />
                  <stop offset="18%" stopColor={T.addBrd} />
                  <stop offset="42%" stopColor={T.chgTx} />
                  <stop offset="66%" stopColor={T.acc} />
                  <stop offset="100%" stopColor={T.acc2} />
                </linearGradient>
                <linearGradient id={shineId} x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor={T.t0} stopOpacity="0" />
                  <stop offset="42%" stopColor={T.t0} stopOpacity="0.1" />
                  <stop offset="52%" stopColor={T.t0} stopOpacity="0.92" />
                  <stop offset="66%" stopColor={T.acc2} stopOpacity="0.72" />
                  <stop offset="100%" stopColor={T.t0} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={path}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="1.8"
                opacity="0.82"
                pathLength="100"
                strokeDasharray="18 46"
                strokeLinecap="round"
                style={{
                  animation: 'regionDashTravel 2.4s linear infinite',
                }}
              />
              <path
                d={path}
                fill="none"
                stroke={`url(#${shineId})`}
                strokeWidth="1.05"
                opacity="0.68"
                pathLength="100"
                strokeDasharray="7 74"
                strokeLinecap="round"
                style={{
                  animation: 'regionDashTravelReverse 1.55s linear infinite',
                }}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
});

export default WorkbookDiffRegionOverlay;
