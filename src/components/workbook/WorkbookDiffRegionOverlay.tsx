import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useTheme } from '@/context/theme';
import { isWorkbookDebugEnabled, workbookDebugLog } from '@/utils/workbook/workbookDebug';
import {
  getWorkbookCanvasDevicePixelRatio,
  syncWorkbookCanvasSurface,
} from '@/utils/workbook/workbookCanvasSurface';
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
const PULSE_DURATION_MS = 560;
const OVERLAY_DRAW_DEBUG_THROTTLE_MS = 120;

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
  scrollRef: RefObject<HTMLDivElement>;
  resolveBoxes: (scrollLeft: number) => WorkbookDiffRegionOverlayBox[];
  viewportWidth: number;
  viewportHeight: number;
  stickyHeaderHeight: number;
  debugRegionId?: string;
  pulseNonce?: number;
  label?: string;
  /**
   * When provided, the canvas is positioned in content-space at this Y offset
   * (non-sticky). Boxes are mapped to canvas coordinates by subtracting this
   * anchor instead of scrollTop, so the compositor scrolls the canvas together
   * with the workbook content, eliminating the 1-frame desync that sticky
   * positioning causes during compositor-driven scroll.
   */
  canvasAnchorTop?: number;
  canvasHeight?: number;
  /**
   * Called when the current scrollTop falls outside the canvas buffer range.
   * The parent should update canvasAnchorTop accordingly.
   */
  onRepositionNeeded?: (scrollTop: number) => void;
}

function ellipsizeCanvasText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;

  const ellipsis = '…';
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth >= maxWidth) return ellipsis;

  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${value.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${value.slice(0, low)}${ellipsis}`;
}

const WorkbookDiffRegionOverlay = memo(({
  scrollRef,
  resolveBoxes,
  viewportWidth,
  viewportHeight,
  stickyHeaderHeight,
  debugRegionId,
  pulseNonce = 0,
  label,
  canvasAnchorTop,
  canvasHeight: canvasHeightProp,
  onRepositionNeeded,
}: WorkbookDiffRegionOverlayProps) => {
  const T = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<((reason?: string) => void) | null>(null);
  const lastDebugLogAtRef = useRef(0);
  const lastScrollLeftRef = useRef(0);
  const scrollRafRef = useRef(0);
  const [pulseProgress, setPulseProgress] = useState(1);
  const isContentSpaceMode = canvasAnchorTop != null;
  const effectiveCanvasHeight = isContentSpaceMode
    ? (canvasHeightProp ?? viewportHeight)
    : viewportHeight;

  useEffect(() => {
    if (pulseNonce <= 0) {
      setPulseProgress(1);
      return;
    }

    let frame = 0;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const nextProgress = Math.min(1, (now - start) / PULSE_DURATION_MS);
      setPulseProgress(nextProgress);
      if (nextProgress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    setPulseProgress(0);
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pulseNonce]);

  useLayoutEffect(() => {
    drawRef.current = (reason = 'layout') => {
      const canvas = canvasRef.current;
      const scroller = scrollRef.current;
      if (!canvas || !scroller || viewportWidth <= 0 || effectiveCanvasHeight <= 0) return;

      const scrollLeft = Math.max(0, scroller.scrollLeft);
      const scrollTop = Math.max(0, scroller.scrollTop);
      const anchorTop = isContentSpaceMode ? (canvasAnchorTop ?? 0) : 0;

      // In content-space mode the canvas lives inside the scrollable content
      // (not sticky), so the compositor scrolls it together with the workbook
      // rows. We map box coordinates from content-space to canvas-space by
      // subtracting the canvas anchor instead of scrollTop. This eliminates
      // the 1-frame visual lag caused by compositor-driven scroll.
      const boxes = resolveBoxes(scrollLeft)
        .map((box) => {
          if (isContentSpaceMode) {
            // Frozen rows have viewport-relative top (< stickyHeaderHeight).
            // Convert them to content-space first (add scrollTop), then to
            // canvas-space (subtract anchorTop) so they remain visible.
            if (box.top < stickyHeaderHeight) {
              return { ...box, top: box.top + scrollTop - anchorTop };
            }
            return {
              ...box,
              top: box.top - anchorTop,
            };
          }
          return {
            ...box,
            top: box.top < stickyHeaderHeight
              ? box.top
              : box.top - scrollTop,
          };
        })
        .filter((box) => (
          box.width > 0
          && box.height > 0
          && box.top < effectiveCanvasHeight
          && box.top + box.height > 0
        ));

      const dpr = getWorkbookCanvasDevicePixelRatio();
      syncWorkbookCanvasSurface(canvas, viewportWidth, effectiveCanvasHeight, dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, viewportWidth, effectiveCanvasHeight);
      if (boxes.length === 0) {
        ctx.restore();
        return;
      }

      const outlineSegments = buildWorkbookDiffRegionOverlayOutlineSegments(boxes);
      const pulseStrength = pulseNonce > 0 && pulseProgress < 1
        ? Math.sin(pulseProgress * Math.PI)
        : 0;

      if (isWorkbookDebugEnabled()) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (reason !== 'scroll' || now - lastDebugLogAtRef.current >= OVERLAY_DRAW_DEBUG_THROTTLE_MS) {
          lastDebugLogAtRef.current = now;
          workbookDebugLog('WorkbookDiffRegionOverlay/draw', {
            reason,
            regionId: debugRegionId ?? null,
            scroll: {
              top: scrollTop,
              left: scrollLeft,
            },
            viewport: {
              width: viewportWidth,
              height: viewportHeight,
              stickyHeaderHeight,
            },
            pulse: {
              nonce: pulseNonce,
              progress: pulseProgress,
              strength: pulseStrength,
            },
            boxCount: boxes.length,
            boxes: boxes.slice(0, 8).map((box) => ({
              key: box.key,
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              tone: box.tone ?? null,
              openTop: Boolean(box.openTop),
              openBottom: Boolean(box.openBottom),
            })),
            outlineSegmentCount: outlineSegments.length,
            outlineSegments: outlineSegments.slice(0, 12).map((segment) => ({
              key: segment.key,
              left: segment.left,
              top: segment.top,
              width: segment.width,
              height: segment.height,
              tone: segment.tone ?? null,
            })),
            label: label ?? null,
          });
        }
      }

      boxes.forEach((box) => {
        const palette = resolveWorkbookOverlayPalette(T, box.tone ?? 'mixed');
        const fillGradient = ctx.createLinearGradient(0, box.top, 0, box.top + box.height);
        fillGradient.addColorStop(0, applyOverlayAlpha(palette.mid, 0.07 + (pulseStrength * 0.06)));
        fillGradient.addColorStop(1, applyOverlayAlpha(palette.shine, 0.05 + (pulseStrength * 0.045)));
        ctx.fillStyle = fillGradient;
        ctx.fillRect(box.left, box.top, box.width, box.height);

        const continuationGradient = ctx.createLinearGradient(box.left, 0, box.left + box.width, 0);
        continuationGradient.addColorStop(0, 'transparent');
        continuationGradient.addColorStop(0.2, palette.continuation);
        continuationGradient.addColorStop(0.5, palette.shine);
        continuationGradient.addColorStop(0.8, palette.continuation);
        continuationGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = continuationGradient;
        if (resolveOpenTop(box)) {
          ctx.fillRect(
            box.left + EDGE_WIDTH,
            box.top + EDGE_OFFSET,
            Math.max(0, box.width - (EDGE_WIDTH * 2)),
            CONTINUATION_HEIGHT,
          );
        }
        if (resolveOpenBottom(box)) {
          ctx.fillRect(
            box.left + EDGE_WIDTH,
            box.top + box.height - CONTINUATION_HEIGHT - EDGE_OFFSET,
            Math.max(0, box.width - (EDGE_WIDTH * 2)),
            CONTINUATION_HEIGHT,
          );
        }
      });

      outlineSegments.forEach((segment) => {
        const palette = resolveWorkbookOverlayPalette(T, segment.tone ?? 'mixed');
        ctx.save();
        if (pulseStrength > 0) {
          ctx.shadowColor = applyOverlayAlpha(palette.mid, 0.28 + (pulseStrength * 0.26));
          ctx.shadowBlur = 6 + (pulseStrength * 8);
        }
        ctx.fillStyle = palette.mid;
        ctx.fillRect(segment.left, segment.top, segment.width, segment.height);
        ctx.restore();
      });

      if (label) {
        const labelAnchor = boxes.reduce<WorkbookDiffRegionOverlayBox | null>((best, box) => {
          if (!best) return box;
          if (box.top < best.top) return box;
          if (box.top === best.top && box.left < best.left) return box;
          return best;
        }, null);
        if (labelAnchor) {
          const palette = resolveWorkbookOverlayPalette(T, labelAnchor.tone ?? 'mixed');
          const labelPaddingX = 8;
          const labelHeight = 20;
          const labelTop = Math.max(
            2,
            Math.min(
              effectiveCanvasHeight - labelHeight - 2,
              labelAnchor.top >= 26 ? labelAnchor.top - 22 : labelAnchor.top + 4,
            ),
          );
          const labelLeft = Math.max(2, labelAnchor.left + 6);
          const labelMaxWidth = Math.max(140, Math.min(360, labelAnchor.width - 12 || 240));
          const labelWidth = Math.max(0, Math.min(labelMaxWidth, viewportWidth - labelLeft - 2));

          if (labelWidth > 0) {
            ctx.save();
            ctx.font = `700 ${FONT_SIZE.xs}px ${FONT_UI}`;
            const text = ellipsizeCanvasText(ctx, label, Math.max(0, labelWidth - (labelPaddingX * 2)));
            ctx.shadowColor = `${T.t0}14`;
            ctx.shadowBlur = 8 + (pulseStrength * 3);
            ctx.fillStyle = applyOverlayAlpha(T.bg1, 0.95);
            ctx.strokeStyle = applyOverlayAlpha(palette.mid, 0.53);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(labelLeft, labelTop, labelWidth, labelHeight);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = palette.mid;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, labelLeft + labelPaddingX, labelTop + (labelHeight / 2));
            ctx.restore();
          }
        }
      }

      ctx.restore();
    };
    drawRef.current('layout');
  }, [T, canvasAnchorTop, debugRegionId, effectiveCanvasHeight, isContentSpaceMode, label, pulseNonce, pulseProgress, resolveBoxes, scrollRef, stickyHeaderHeight, viewportHeight, viewportWidth]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const scheduleDraw = (reason: string) => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        drawRef.current?.(reason);
      });
    };

    const handleScroll = () => {
      if (isContentSpaceMode) {
        // In content-space mode the compositor scrolls the canvas with the
        // workbook content, so we only need to redraw when:
        // 1. The horizontal scroll position changed (column visibility)
        // 2. The viewport has scrolled outside the canvas buffer range
        const scrollLeft = Math.max(0, scroller.scrollLeft);
        const scrollTop = Math.max(0, scroller.scrollTop);
        const anchor = canvasAnchorTop ?? 0;
        const canvasH = canvasHeightProp ?? viewportHeight;
        const outOfBounds = scrollTop < anchor || scrollTop + viewportHeight > anchor + canvasH;

        // Keep the canvas container horizontally aligned with the viewport.
        // The parent uses `position: sticky; left: 0` so the browser
        // compositor handles horizontal alignment natively — no JS update
        // needed here.

        if (outOfBounds) {
          onRepositionNeeded?.(scrollTop);
          return;
        }

        if (scrollLeft !== lastScrollLeftRef.current) {
          lastScrollLeftRef.current = scrollLeft;
          scheduleDraw('scroll');
        }
        return;
      }

      // Legacy sticky mode: redraw synchronously every scroll event so the
      // overlay stays attached to the workbook canvas during vertical
      // scrolling.
      scheduleDraw('scroll');
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [canvasAnchorTop, canvasHeightProp, isContentSpaceMode, onRepositionNeeded, scrollRef, viewportHeight]);

  if (viewportWidth <= 0 || viewportHeight <= 0) return null;

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
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: viewportWidth,
          height: effectiveCanvasHeight,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export default WorkbookDiffRegionOverlay;
