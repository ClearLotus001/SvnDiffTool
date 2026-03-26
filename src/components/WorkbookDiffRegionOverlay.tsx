import { memo, useId, type CSSProperties } from 'react';
import { useTheme } from '../context/theme';
import type { WorkbookRegionOverlayBox as WorkbookDiffRegionOverlayBox } from '../utils/workbookRegionOverlay';

export type { WorkbookDiffRegionOverlayBox };

const MERGE_GAP = 6;

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
        const overlapsX = nextBox.left <= candidateRight + MERGE_GAP
          && seedRight >= candidate.left - MERGE_GAP;
        const overlapsY = nextBox.top <= candidateBottom + MERGE_GAP
          && seedBottom >= candidate.top - MERGE_GAP;
        if (!overlapsX || !overlapsY) continue;

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

const BORDER_RADIUS = 12;
const PADDING = 18;

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
        const outerStyle: CSSProperties = {
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          borderRadius: BORDER_RADIUS,
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.015)',
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.16), 0 0 0 1px ${T.acc2}18, 0 18px 36px -24px rgba(255,255,255,0.28)`,
          overflow: 'visible',
        };
        const baseFrameStyle: CSSProperties = {
          position: 'absolute',
          inset: 0,
          borderRadius: BORDER_RADIUS,
          border: '2px solid rgba(255, 112, 136, 0.82)',
          boxSizing: 'border-box',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset, 0 0 18px rgba(255, 143, 177, 0.22)',
        };
        const svgWidth = box.width + (PADDING * 2);
        const svgHeight = box.height + (PADDING * 2);
        const rectX = PADDING;
        const rectY = PADDING;
        const gradientId = `region-rainbow-${gradientSeed}-${box.key}`;
        const shineId = `region-shine-${gradientSeed}-${box.key}`;
        const glowId = `region-glow-${gradientSeed}-${box.key}`;

        return (
          <div key={box.key} style={outerStyle}>
            <div style={baseFrameStyle} />
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{
                position: 'absolute',
                top: -PADDING,
                left: -PADDING,
                overflow: 'visible',
              }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d8d" />
                  <stop offset="18%" stopColor="#ff8a4d" />
                  <stop offset="34%" stopColor="#ffd75e" />
                  <stop offset="52%" stopColor="#4ee0b0" />
                  <stop offset="70%" stopColor="#58b8ff" />
                  <stop offset="86%" stopColor="#9b7dff" />
                  <stop offset="100%" stopColor="#ff4d8d" />
                </linearGradient>
                <linearGradient id={shineId} x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="45%" stopColor="rgba(255,255,255,0.15)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,1)" />
                  <stop offset="55%" stopColor="rgba(255,255,255,0.15)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
                <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feColorMatrix
                    in="blur"
                    type="matrix"
                    values="1 0 0 0 0
                            0 1 0 0 0
                            0 0 1 0 0
                            0 0 0 1.4 0"
                  />
                </filter>
              </defs>

              <rect
                x={rectX}
                y={rectY}
                width={box.width}
                height={box.height}
                rx={BORDER_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.52)"
                strokeWidth="1.2"
              />

              <rect
                x={rectX}
                y={rectY}
                width={box.width}
                height={box.height}
                rx={BORDER_RADIUS}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="6"
                filter={`url(#${glowId})`}
                opacity="0.92"
                pathLength="100"
                strokeDasharray="24 76"
                strokeLinecap="round"
                style={{
                  animation: 'regionDashTravel 2.05s linear infinite',
                }}
              />

              <rect
                x={rectX}
                y={rectY}
                width={box.width}
                height={box.height}
                rx={BORDER_RADIUS}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="3.2"
                opacity="1"
                pathLength="100"
                strokeDasharray="24 76"
                strokeLinecap="round"
                style={{
                  animation: 'regionDashTravel 2.05s linear infinite',
                }}
              />

              <rect
                x={rectX}
                y={rectY}
                width={box.width}
                height={box.height}
                rx={BORDER_RADIUS}
                fill="none"
                stroke={`url(#${shineId})`}
                strokeWidth="2"
                opacity="0.95"
                pathLength="100"
                strokeDasharray="10 90"
                strokeLinecap="round"
                style={{
                  animation: 'regionDashTravel 1.35s linear infinite',
                }}
              />

              <rect
                x={rectX + 2}
                y={rectY + 2}
                width={Math.max(0, box.width - 4)}
                height={Math.max(0, box.height - 4)}
                rx={Math.max(0, BORDER_RADIUS - 2)}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
});

export default WorkbookDiffRegionOverlay;
