export interface SelectionBarBand {
  top: number;
  bottom: number;
  weight: number;
}

interface SelectionBarPlacementParams {
  rangeTop: number;
  rangeBottom: number;
  anchorAbove: number;
  anchorBelow: number;
  viewportTop: number;
  viewportBottom: number;
  barHeight: number;
  gap: number;
  bands: SelectionBarBand[];
}

interface SelectionBarPlacementCandidate {
  placement: 'above' | 'below';
  rawTop: number;
  anchorCenter: number;
  order: number;
}

export interface SelectionBarPlacementResult {
  top: number;
  anchorCenter: number;
  placement: 'above' | 'below';
}

function overlapSize(start: number, end: number, otherStart: number, otherEnd: number) {
  return Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart));
}

export function resolveSelectionBarPlacement({
  rangeTop,
  rangeBottom,
  anchorAbove,
  anchorBelow,
  viewportTop,
  viewportBottom,
  barHeight,
  gap,
  bands,
}: SelectionBarPlacementParams): SelectionBarPlacementResult {
  const minTop = viewportTop;
  const maxTop = Math.max(minTop, viewportBottom - barHeight);

  const candidates: SelectionBarPlacementCandidate[] = [
    { placement: 'above', rawTop: rangeTop - barHeight - gap, anchorCenter: anchorAbove, order: 0 },
    { placement: 'below', rawTop: rangeBottom + gap, anchorCenter: anchorBelow, order: 1 },
    { placement: 'above', rawTop: viewportTop, anchorCenter: anchorAbove, order: 2 },
    { placement: 'below', rawTop: viewportBottom - barHeight, anchorCenter: anchorBelow, order: 3 },
  ];

  const ranked = candidates.map((candidate) => {
    const top = Math.min(maxTop, Math.max(minTop, candidate.rawTop));
    const bottom = top + barHeight;
    const overlapPenalty = bands.reduce((sum, band) => (
      sum + (overlapSize(top, bottom, band.top, band.bottom) * band.weight)
    ), 0);
    const clampPenalty = Math.abs(candidate.rawTop - top) * 0.4;
    return {
      ...candidate,
      top,
      score: overlapPenalty + clampPenalty,
    };
  }).sort((left, right) => (
    left.score - right.score
    || left.order - right.order
  ));

  const best = ranked[0] ?? { top: minTop, anchorCenter: anchorAbove, placement: 'above' as const };
  return {
    top: Math.round(best.top),
    anchorCenter: best.anchorCenter,
    placement: best.placement,
  };
}
