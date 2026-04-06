import { resolveSelectionBarPlacement } from '@/utils/diff/selectionBarPlacement';

export interface SelectionBarLayoutEntry {
  topOffset: number;
  height: number;
  selected: boolean;
  weight: number;
}

export interface SelectionBarLayoutMeasurement {
  rangeTop: number;
  rangeBottom: number;
  anchorAbove: number;
  anchorBelow: number;
}

export interface SelectionBarLayoutViewport {
  scrollTop: number;
  clientHeight: number;
  offsetTop: number;
}

export interface SelectionBarLayoutResult {
  top: number;
  connectorOffsetY: number;
  placement: 'above' | 'below';
}

interface ResolveSelectionBarLayoutParams {
  entries: readonly SelectionBarLayoutEntry[];
  viewport: SelectionBarLayoutViewport;
  measurement?: SelectionBarLayoutMeasurement | null;
  barHeight: number;
  gap: number;
  baseOffset?: number;
  viewportPaddingTop?: number;
  viewportPaddingBottom?: number;
  defaultTop?: number;
  defaultConnectorOffsetY?: number;
  defaultPlacement?: 'above' | 'below';
}

function createDefaultSelectionBarLayout(
  top: number,
  connectorOffsetY: number,
  placement: 'above' | 'below',
): SelectionBarLayoutResult {
  return { top, connectorOffsetY, placement };
}

export function resolveSelectionBarLayout({
  entries,
  viewport,
  measurement = null,
  barHeight,
  gap,
  baseOffset = 0,
  viewportPaddingTop = 6,
  viewportPaddingBottom = 6,
  defaultTop = 12,
  defaultConnectorOffsetY = 24,
  defaultPlacement = 'above',
}: ResolveSelectionBarLayoutParams): SelectionBarLayoutResult {
  const fallback = createDefaultSelectionBarLayout(
    defaultTop,
    defaultConnectorOffsetY,
    defaultPlacement,
  );

  if (entries.length === 0) return fallback;

  const viewportStart = viewport.scrollTop;
  const viewportEnd = viewportStart + Math.max(viewport.clientHeight, 1);
  let firstSelectedIndex = -1;
  let firstVisibleSelectedIndex = -1;
  let firstVisibleFragmentEndIndex = -1;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry?.selected) continue;

    if (firstSelectedIndex < 0) firstSelectedIndex = index;
    const entryTop = entry.topOffset;
    const entryBottom = entryTop + entry.height;
    if (entryBottom > viewportStart && entryTop < viewportEnd) {
      if (firstVisibleSelectedIndex < 0) {
        firstVisibleSelectedIndex = index;
        firstVisibleFragmentEndIndex = index;
      } else if (index === firstVisibleFragmentEndIndex + 1) {
        firstVisibleFragmentEndIndex = index;
      } else {
        break;
      }
    }
  }

  const anchorIndex = firstVisibleSelectedIndex >= 0
    ? firstVisibleSelectedIndex
    : firstSelectedIndex;
  if (anchorIndex < 0) return fallback;

  const rangeStartIndex = firstVisibleSelectedIndex >= 0
    ? firstVisibleSelectedIndex
    : anchorIndex;
  const rangeEndIndex = firstVisibleFragmentEndIndex >= 0
    ? firstVisibleFragmentEndIndex
    : anchorIndex;
  const rangeStart = entries[rangeStartIndex];
  const rangeEnd = entries[rangeEndIndex];
  if (!rangeStart || !rangeEnd) return fallback;

  const rangeStartTop = measurement?.rangeTop ?? (
    baseOffset + rangeStart.topOffset - viewport.scrollTop
  );
  const rangeEndBottom = measurement?.rangeBottom ?? (
    baseOffset + rangeEnd.topOffset - viewport.scrollTop + rangeEnd.height
  );
  const anchorAbove = measurement?.anchorAbove ?? (
    baseOffset + rangeStart.topOffset - viewport.scrollTop + (rangeStart.height / 2)
  );
  const anchorBelow = measurement?.anchorBelow ?? (
    baseOffset + rangeEnd.topOffset - viewport.scrollTop + (rangeEnd.height / 2)
  );

  const bands = entries.map((entry) => ({
    top: baseOffset + entry.topOffset - viewport.scrollTop,
    bottom: baseOffset + entry.topOffset - viewport.scrollTop + entry.height,
    weight: entry.weight,
  }));

  const placement = resolveSelectionBarPlacement({
    rangeTop: rangeStartTop,
    rangeBottom: rangeEndBottom,
    anchorAbove,
    anchorBelow,
    viewportTop: baseOffset + viewportPaddingTop,
    viewportBottom: baseOffset + Math.max(0, viewport.clientHeight - viewportPaddingBottom),
    barHeight,
    gap,
    bands,
  });

  return {
    top: placement.top,
    connectorOffsetY: Math.max(12, Math.min(42, Math.round(placement.anchorCenter - placement.top))),
    placement: placement.placement,
  };
}
