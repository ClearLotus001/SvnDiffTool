import { memo, useMemo, type CSSProperties } from 'react';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useTheme } from '@/context/theme';
import type { WorkbookRegionOverlayBox as WorkbookDiffRegionOverlayBox } from '@/utils/workbook/workbookRegionOverlay';
import {
  mergeWorkbookSemanticTone,
  resolveWorkbookOverlayPalette,
  type WorkbookRowSemanticTone,
} from '@/utils/workbook/workbookRowVisuals';

export type { WorkbookDiffRegionOverlayBox };

const MERGE_GAP = 6;
const EDGE_ALIGN_TOLERANCE = 20;
const MIN_HORIZONTAL_OVERLAP_RATIO = 0.72;
const EDGE_WIDTH = 2;
const EDGE_OFFSET = -1;
const CONTINUATION_HEIGHT = 4;
const OUTLINE_MERGE_EPSILON = 0.5;

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha));
}

function parseHexColor(color: string): { red: number; green: number; blue: number } | null {
  const hex = color.trim();
  if (!hex.startsWith('#')) return null;

  const raw = hex.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    const [r = '', g = '', b = ''] = raw.split('');
    return {
      red: Number.parseInt(`${r}${r}`, 16),
      green: Number.parseInt(`${g}${g}`, 16),
      blue: Number.parseInt(`${b}${b}`, 16),
    };
  }

  if (raw.length === 6 || raw.length === 8) {
    return {
      red: Number.parseInt(raw.slice(0, 2), 16),
      green: Number.parseInt(raw.slice(2, 4), 16),
      blue: Number.parseInt(raw.slice(4, 6), 16),
    };
  }

  return null;
}

function parseRgbColor(color: string): { red: number; green: number; blue: number } | null {
  const match = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return null;

  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
  };
}

function applyOverlayAlpha(color: string, alpha: number): string {
  const normalizedAlpha = clampAlpha(alpha);
  const rgb = parseHexColor(color) ?? parseRgbColor(color);
  if (!rgb) return color;
  return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${normalizedAlpha})`;
}

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
        const tone = mergeWorkbookSemanticTone(nextBox.tone, candidate.tone);
        nextBox = {
          key: `${nextBox.key}:${candidate.key}`,
          left,
          top,
          width: right - left,
          height: bottom - top,
          ...(tone ? { tone } : {}),
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

interface WorkbookDiffRegionOverlayBoundarySegment {
  coord: number;
  start: number;
  end: number;
  tone?: WorkbookRowSemanticTone;
}

export interface WorkbookDiffRegionOverlayOutlineSegment {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  tone?: WorkbookRowSemanticTone;
}

function sortUniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function buildBoundaryGrid<T>(rows: number, cols: number, initialValue: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => initialValue));
}

function mergeHorizontalBoundarySegments(
  segments: WorkbookDiffRegionOverlayBoundarySegment[],
): WorkbookDiffRegionOverlayOutlineSegment[] {
  const grouped = new Map<string, WorkbookDiffRegionOverlayBoundarySegment[]>();

  segments.forEach((segment) => {
    const key = `${segment.coord}:${segment.tone ?? ''}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(segment);
      return;
    }
    grouped.set(key, [segment]);
  });

  const merged: WorkbookDiffRegionOverlayOutlineSegment[] = [];
  grouped.forEach((bucket, keyPrefix) => {
    bucket
      .slice()
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .forEach((segment) => {
        const previous = merged[merged.length - 1];
        if (
          previous
          && previous.height === EDGE_WIDTH
          && previous.top === segment.coord + EDGE_OFFSET
          && previous.tone === segment.tone
          && segment.start <= previous.left + previous.width + OUTLINE_MERGE_EPSILON
        ) {
          previous.width = Math.max(previous.width, segment.end - previous.left);
          return;
        }
        merged.push({
          key: `${keyPrefix}:${segment.start}:${segment.end}`,
          left: segment.start,
          top: segment.coord + EDGE_OFFSET,
          width: Math.max(0, segment.end - segment.start),
          height: EDGE_WIDTH,
          ...(segment.tone ? { tone: segment.tone } : {}),
        });
      });
  });

  return merged;
}

function mergeVerticalBoundarySegments(
  segments: WorkbookDiffRegionOverlayBoundarySegment[],
): WorkbookDiffRegionOverlayOutlineSegment[] {
  const grouped = new Map<string, WorkbookDiffRegionOverlayBoundarySegment[]>();

  segments.forEach((segment) => {
    const key = `${segment.coord}:${segment.tone ?? ''}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(segment);
      return;
    }
    grouped.set(key, [segment]);
  });

  const merged: WorkbookDiffRegionOverlayOutlineSegment[] = [];
  grouped.forEach((bucket, keyPrefix) => {
    bucket
      .slice()
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .forEach((segment) => {
        const previous = merged[merged.length - 1];
        if (
          previous
          && previous.width === EDGE_WIDTH
          && previous.left === segment.coord + EDGE_OFFSET
          && previous.tone === segment.tone
          && segment.start <= previous.top + previous.height + OUTLINE_MERGE_EPSILON
        ) {
          previous.height = Math.max(previous.height, segment.end - previous.top);
          return;
        }
        merged.push({
          key: `${keyPrefix}:${segment.start}:${segment.end}`,
          left: segment.coord + EDGE_OFFSET,
          top: segment.start,
          width: EDGE_WIDTH,
          height: Math.max(0, segment.end - segment.start),
          ...(segment.tone ? { tone: segment.tone } : {}),
        });
      });
  });

  return merged;
}

export function buildWorkbookDiffRegionOverlayOutlineSegments(
  boxes: WorkbookDiffRegionOverlayBox[],
): WorkbookDiffRegionOverlayOutlineSegment[] {
  const normalizedBoxes = boxes
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
    }));
  if (normalizedBoxes.length === 0) return [];

  const xs = sortUniqueNumbers(normalizedBoxes.flatMap((box) => [box.left, box.right]));
  const ys = sortUniqueNumbers(normalizedBoxes.flatMap((box) => [box.top, box.bottom]));
  if (xs.length < 2 || ys.length < 2) return [];

  const colCount = xs.length - 1;
  const rowCount = ys.length - 1;
  const occupied = buildBoundaryGrid<boolean>(rowCount, colCount, false);
  const drawTop = buildBoundaryGrid<boolean>(rowCount, colCount, false);
  const drawBottom = buildBoundaryGrid<boolean>(rowCount, colCount, false);
  const cellTone = buildBoundaryGrid<WorkbookRowSemanticTone | undefined>(rowCount, colCount, undefined);
  const xIndex = new Map(xs.map((value, index) => [value, index]));
  const yIndex = new Map(ys.map((value, index) => [value, index]));

  normalizedBoxes.forEach((box) => {
    const xStart = xIndex.get(box.left);
    const xEnd = xIndex.get(box.right);
    const yStart = yIndex.get(box.top);
    const yEnd = yIndex.get(box.bottom);
    if (xStart == null || xEnd == null || yStart == null || yEnd == null) return;

    for (let rowIndex = yStart; rowIndex < yEnd; rowIndex += 1) {
      const isTopRow = ys[rowIndex] === box.top;
      const isBottomRow = ys[rowIndex + 1] === box.bottom;
      for (let colIndex = xStart; colIndex < xEnd; colIndex += 1) {
        occupied[rowIndex]![colIndex] = true;
        cellTone[rowIndex]![colIndex] = mergeWorkbookSemanticTone(
          cellTone[rowIndex]![colIndex],
          box.tone,
        );
        if (isTopRow && !resolveOpenTop(box)) {
          drawTop[rowIndex]![colIndex] = true;
        }
        if (isBottomRow && !resolveOpenBottom(box)) {
          drawBottom[rowIndex]![colIndex] = true;
        }
      }
    }
  });

  const horizontalSegments: WorkbookDiffRegionOverlayBoundarySegment[] = [];
  const verticalSegments: WorkbookDiffRegionOverlayBoundarySegment[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      if (!occupied[rowIndex]![colIndex]) continue;
      const tone = cellTone[rowIndex]![colIndex];

      if ((rowIndex === 0 || !occupied[rowIndex - 1]![colIndex]) && drawTop[rowIndex]![colIndex]) {
        horizontalSegments.push({
          coord: ys[rowIndex]!,
          start: xs[colIndex]!,
          end: xs[colIndex + 1]!,
          ...(tone ? { tone } : {}),
        });
      }

      if ((rowIndex === rowCount - 1 || !occupied[rowIndex + 1]![colIndex]) && drawBottom[rowIndex]![colIndex]) {
        horizontalSegments.push({
          coord: ys[rowIndex + 1]!,
          start: xs[colIndex]!,
          end: xs[colIndex + 1]!,
          ...(tone ? { tone } : {}),
        });
      }

      if (colIndex === 0 || !occupied[rowIndex]![colIndex - 1]) {
        verticalSegments.push({
          coord: xs[colIndex]!,
          start: ys[rowIndex]!,
          end: ys[rowIndex + 1]!,
          ...(tone ? { tone } : {}),
        });
      }

      if (colIndex === colCount - 1 || !occupied[rowIndex]![colIndex + 1]) {
        verticalSegments.push({
          coord: xs[colIndex + 1]!,
          start: ys[rowIndex]!,
          end: ys[rowIndex + 1]!,
          ...(tone ? { tone } : {}),
        });
      }
    }
  }

  return [
    ...mergeHorizontalBoundarySegments(horizontalSegments),
    ...mergeVerticalBoundarySegments(verticalSegments),
  ].sort((left, right) => (
    left.top - right.top
    || left.left - right.left
    || left.width - right.width
    || left.height - right.height
  ));
}

interface WorkbookDiffRegionOverlayProps {
  boxes: WorkbookDiffRegionOverlayBox[];
  pulseNonce?: number;
  label?: string;
}

const WorkbookDiffRegionOverlay = memo(({ boxes, pulseNonce = 0, label }: WorkbookDiffRegionOverlayProps) => {
  const T = useTheme();
  const outlineSegments = useMemo(
    () => buildWorkbookDiffRegionOverlayOutlineSegments(boxes),
    [boxes],
  );
  const pulseAnimation = pulseNonce > 0 ? 'regionGlowPulse 560ms cubic-bezier(0.22, 1, 0.36, 1) 1' : undefined;

  if (boxes.length === 0) return null;

  const labelAnchor = boxes.reduce<WorkbookDiffRegionOverlayBox | null>((best, box) => {
    if (!best) return box;
    if (box.top < best.top) return box;
    if (box.top === best.top && box.left < best.left) return box;
    return best;
  }, null);

  return (
    <div
      aria-hidden="true"
      data-pulse={pulseNonce}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 8,
      }}>
      {boxes.map((box) => {
        const openTop = resolveOpenTop(box);
        const openBottom = resolveOpenBottom(box);
        const palette = resolveWorkbookOverlayPalette(T, box.tone ?? 'mixed');
        const fillStyle: CSSProperties = {
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          background: `linear-gradient(180deg, ${applyOverlayAlpha(palette.mid, 0.07)} 0%, ${applyOverlayAlpha(palette.shine, 0.05)} 100%)`,
          animation: pulseAnimation,
          transformOrigin: 'center',
        };
        const continuationStyle: CSSProperties = {
          position: 'absolute',
          left: EDGE_WIDTH,
          right: EDGE_WIDTH,
          height: CONTINUATION_HEIGHT,
          background: `linear-gradient(90deg, transparent 0%, ${palette.continuation} 20%, ${palette.shine} 50%, ${palette.continuation} 80%, transparent 100%)`,
          opacity: 0.92,
        };

        return (
          <div key={`${pulseNonce}:${box.key}`} style={fillStyle}>
            {openTop && <div style={{ ...continuationStyle, top: EDGE_OFFSET }} />}
            {openBottom && <div style={{ ...continuationStyle, bottom: EDGE_OFFSET }} />}
          </div>
        );
      })}
      {outlineSegments.map((segment) => {
        const palette = resolveWorkbookOverlayPalette(T, segment.tone ?? 'mixed');
        return (
          <div
            key={`${pulseNonce}:${segment.key}`}
            style={{
              position: 'absolute',
              left: segment.left,
              top: segment.top,
              width: segment.width,
              height: segment.height,
              background: palette.mid,
              animation: pulseAnimation,
              transformOrigin: 'center',
            }}
          />
        );
      })}
      {label && labelAnchor && (
        <div
          style={{
            position: 'absolute',
            top: labelAnchor.top >= 26 ? labelAnchor.top - 22 : labelAnchor.top + 4,
            left: labelAnchor.left + 6,
            maxWidth: Math.max(140, Math.min(360, labelAnchor.width - 12 || 240)),
            padding: '2px 8px',
            border: `1px solid ${applyOverlayAlpha(resolveWorkbookOverlayPalette(T, labelAnchor.tone ?? 'mixed').mid, 0.53)}`,
            background: applyOverlayAlpha(T.bg1, 0.95),
            color: resolveWorkbookOverlayPalette(T, labelAnchor.tone ?? 'mixed').mid,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.xs,
            fontWeight: 700,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: `0 2px 8px ${T.t0}14`,
            animation: pulseAnimation,
            transformOrigin: 'left center',
          }}>
          {label}
        </div>
      )}
    </div>
  );
});

export default WorkbookDiffRegionOverlay;
