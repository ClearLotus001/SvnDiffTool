type EmptyMarkerExtra = Record<never, never>;

export interface MiniMapOverlaySegment<TTone extends string> {
  tone: TTone;
  height: number;
}

export type MiniMapOverlayMarker<
  TTone extends string,
  TExtra extends object = EmptyMarkerExtra,
> = {
  tone: TTone;
  top: number;
  height: number;
} & TExtra;

interface BuildMiniMapOverlayMarkersOptions<
  TTone extends string,
  TSegment extends MiniMapOverlaySegment<TTone>,
  TExtra extends object,
> {
  segments: readonly TSegment[];
  contentHeight: number;
  canvasHeight: number;
  emptyTone: TTone;
  minMarkerHeight?: number;
  resolveExtra?: (segment: TSegment) => TExtra;
  mergeExtra?: (left: TExtra, right: TExtra) => TExtra;
  mergeTone?: (left: TTone, right: TTone) => TTone;
}

export const DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT = 3;

export function buildMiniMapOverlayMarkers<
  TTone extends string,
  TSegment extends MiniMapOverlaySegment<TTone>,
  TExtra extends object = EmptyMarkerExtra,
>({
  segments,
  contentHeight,
  canvasHeight,
  emptyTone,
  minMarkerHeight = DEFAULT_MINIMAP_OVERLAY_MARKER_HEIGHT,
  resolveExtra,
  mergeExtra,
  mergeTone,
}: BuildMiniMapOverlayMarkersOptions<TTone, TSegment, TExtra>): Array<MiniMapOverlayMarker<TTone, TExtra>> {
  const resolvedSegments: readonly MiniMapOverlaySegment<TTone>[] = segments.length > 0
    ? segments
    : [{ tone: emptyTone, height: Math.max(1, contentHeight) }];
  const total = Math.max(
    contentHeight,
    resolvedSegments.reduce((sum, segment) => sum + segment.height, 0),
    1,
  );
  const canvasSize = Math.max(1, canvasHeight);
  const normalizedMinMarkerHeight = Math.max(1, Math.floor(minMarkerHeight));
  const resolveMarkerExtra = resolveExtra ?? (() => ({}) as TExtra);
  const mergeMarkerExtra = mergeExtra ?? ((left: TExtra) => left);
  const mergeMarkerTone = mergeTone ?? ((left: TTone, right: TTone) => (left === right ? left : right));
  const rawMarkers: Array<{ tone: TTone; start: number; end: number; extra: TExtra }> = [];

  let offset = 0;
  let currentMarker: { tone: TTone; start: number; end: number; extra: TExtra } | null = null;

  const flushMarker = () => {
    if (!currentMarker || currentMarker.tone === emptyTone) return;
    rawMarkers.push(currentMarker);
    currentMarker = null;
  };

  resolvedSegments.forEach((segment) => {
    const nextOffset = offset + segment.height;

    if (segment.tone === emptyTone) {
      flushMarker();
      offset = nextOffset;
      return;
    }

    const segmentExtra = resolveMarkerExtra(segment as TSegment);
    if (currentMarker && currentMarker.tone === segment.tone && currentMarker.end === offset) {
      currentMarker.end = nextOffset;
      currentMarker.extra = mergeMarkerExtra(currentMarker.extra, segmentExtra);
    } else {
      flushMarker();
      currentMarker = {
        tone: segment.tone,
        start: offset,
        end: nextOffset,
        extra: segmentExtra,
      };
    }

    offset = nextOffset;
  });

  flushMarker();

  const markers = rawMarkers.map((marker) => {
    const rawTop = (marker.start / total) * canvasSize;
    const rawBottom = (marker.end / total) * canvasSize;
    const rawHeight = Math.max(rawBottom - rawTop, Number.EPSILON);
    const targetHeight = Math.min(canvasSize, Math.max(normalizedMinMarkerHeight, rawHeight));
    const centeredTop = rawTop - ((targetHeight - rawHeight) / 2);
    const clampedTop = Math.max(0, Math.min(canvasSize - targetHeight, centeredTop));
    const top = clampedTop;
    const height = Math.max(1, Math.min(canvasSize - top, targetHeight));

    return {
      tone: marker.tone,
      top,
      height,
      extra: marker.extra,
    };
  });

  const mergedMarkers: Array<{
    tone: TTone;
    top: number;
    height: number;
    extra: TExtra;
  }> = [];
  markers.forEach((marker) => {
    const previous = mergedMarkers.at(-1);
    if (!previous) {
      mergedMarkers.push({ ...marker });
      return;
    }

    const previousBottom = previous.top + previous.height;
    const markerBottom = marker.top + marker.height;
    // Adjacent markers occupy distinct pixel ranges and must keep their own
    // semantic colors. Merge only when minimum-height expansion or rounding
    // makes the painted ranges actually overlap.
    if (marker.top < previousBottom) {
      previous.top = Math.min(previous.top, marker.top);
      previous.height = Math.max(previousBottom, markerBottom) - previous.top;
      previous.tone = previous.tone === marker.tone
        ? previous.tone
        : mergeMarkerTone(previous.tone, marker.tone);
      previous.extra = mergeMarkerExtra(previous.extra, marker.extra);
      return;
    }

    mergedMarkers.push({ ...marker });
  });

  return mergedMarkers.map((marker) => ({
    tone: marker.tone,
    top: marker.top,
    height: marker.height,
    ...marker.extra,
  }));
}
