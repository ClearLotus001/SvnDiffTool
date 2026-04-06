export interface ResolveWorkbookFrozenPaneViewportOptions {
  totalFrozenSize: number;
  viewportSize: number;
  headerSize?: number;
  minBodyViewportSize?: number;
  maxViewportRatio?: number;
  minViewportSize?: number;
}

export interface ResolvedWorkbookFrozenPaneViewport {
  viewportSize: number;
  overflowSize: number;
  isOverflowing: boolean;
}

export function resolveWorkbookFrozenPaneViewport({
  totalFrozenSize,
  viewportSize,
  headerSize = 0,
  minBodyViewportSize = 0,
  maxViewportRatio = 1,
  minViewportSize = 0,
}: ResolveWorkbookFrozenPaneViewportOptions): ResolvedWorkbookFrozenPaneViewport {
  const normalizedTotalFrozenSize = Math.max(0, totalFrozenSize);
  if (normalizedTotalFrozenSize === 0) {
    return {
      viewportSize: 0,
      overflowSize: 0,
      isOverflowing: false,
    };
  }

  const availableViewportSize = Math.max(0, viewportSize - Math.max(0, headerSize));
  if (availableViewportSize === 0) {
    return {
      viewportSize: 0,
      overflowSize: normalizedTotalFrozenSize,
      isOverflowing: true,
    };
  }

  const ratioLimitedSize = maxViewportRatio > 0
    ? availableViewportSize * maxViewportRatio
    : availableViewportSize;
  const bodyReservedSize = minBodyViewportSize > 0
    ? availableViewportSize - minBodyViewportSize
    : availableViewportSize;

  let cappedViewportSize = Math.min(
    availableViewportSize,
    Math.max(0, ratioLimitedSize),
    Math.max(0, bodyReservedSize),
  );

  if (cappedViewportSize <= 0) {
    cappedViewportSize = availableViewportSize;
  }

  const normalizedMinViewportSize = Math.max(0, minViewportSize);
  if (normalizedMinViewportSize > 0) {
    cappedViewportSize = Math.min(
      availableViewportSize,
      Math.max(normalizedMinViewportSize, cappedViewportSize),
    );
  }

  const resolvedViewportSize = Math.min(
    normalizedTotalFrozenSize,
    Math.max(0, Math.round(cappedViewportSize)),
  );

  return {
    viewportSize: resolvedViewportSize,
    overflowSize: Math.max(0, normalizedTotalFrozenSize - resolvedViewportSize),
    isOverflowing: resolvedViewportSize < normalizedTotalFrozenSize,
  };
}
