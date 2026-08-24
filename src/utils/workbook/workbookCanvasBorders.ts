import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';

interface WorkbookCanvasBorderCandidate {
  start: number;
  end: number;
  drawCoord: number;
  color: string;
  thickness: number;
  placement: 'leading' | 'trailing';
  priority: number;
  order: number;
}

interface WorkbookCanvasBorderGroup {
  seam: number;
  candidates: WorkbookCanvasBorderCandidate[];
}

interface WorkbookCanvasBorderSegment {
  start: number;
  end: number;
  drawCoord: number;
  color: string;
  thickness: number;
}

export interface WorkbookCanvasBorderRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  thickness?: number;
  priority?: number;
  edges?: WorkbookCanvasBorderEdges;
}

export interface WorkbookCanvasBorderLayer {
  color: string;
  thickness: number;
  priority: number;
  edges?: WorkbookCanvasBorderEdges;
}

export interface WorkbookCanvasBorderRegistry {
  addRect: (rect: WorkbookCanvasBorderRect) => void;
  flush: (ctx: CanvasRenderingContext2D) => void;
}

export interface WorkbookCanvasBorderEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export const WORKBOOK_CANVAS_BORDER_PRIORITY = {
  grid: 0,
  placeholder: 1,
  diff: 2,
  axisSelection: 3,
  mirroredSelection: 4,
  rangeSelection: 5,
  primarySelection: 6,
} as const;

const ALL_BORDER_EDGES: WorkbookCanvasBorderEdges = {
  top: true,
  right: true,
  bottom: true,
  left: true,
};

type WorkbookCanvasBorderAxis = 'horizontal' | 'vertical';

function getSeamKey(seam: number): string {
  return seam.toFixed(3);
}

function isVisibleBorderColor(color: string): boolean {
  return color.length > 0 && color !== 'transparent';
}

function chooseWorkbookCanvasBorderWinner(
  candidates: WorkbookCanvasBorderCandidate[],
  start: number,
  end: number,
): WorkbookCanvasBorderCandidate | null {
  let winner: WorkbookCanvasBorderCandidate | null = null;

  candidates.forEach((candidate) => {
    if (candidate.start >= end || candidate.end <= start) return;

    if (
      winner == null
      || candidate.priority > winner.priority
      || (candidate.priority === winner.priority && candidate.order > winner.order)
    ) {
      winner = candidate;
    }
  });

  return winner;
}

function getOverlappingWorkbookCanvasBorderCandidates(
  candidates: WorkbookCanvasBorderCandidate[],
  start: number,
  end: number,
): WorkbookCanvasBorderCandidate[] {
  return candidates.filter(candidate => !(candidate.start >= end || candidate.end <= start));
}

function resolveWorkbookCanvasBorderDrawCoord(
  group: WorkbookCanvasBorderGroup,
  overlappingCandidates: WorkbookCanvasBorderCandidate[],
  winner: WorkbookCanvasBorderCandidate,
): number {
  const hasLeadingCandidate = overlappingCandidates.some(candidate => candidate.placement === 'leading');
  const hasTrailingCandidate = overlappingCandidates.some(candidate => candidate.placement === 'trailing');

  if (winner.thickness === 1 && hasLeadingCandidate && hasTrailingCandidate) {
    return group.seam;
  }

  return winner.drawCoord;
}

function flushWorkbookCanvasBorderGroups(
  ctx: CanvasRenderingContext2D,
  axis: WorkbookCanvasBorderAxis,
  groups: Map<string, WorkbookCanvasBorderGroup>,
): void {
  groups.forEach((group) => {
    if (group.candidates.length === 0) return;

    const boundaries = Array.from(new Set(
      group.candidates.flatMap(candidate => [candidate.start, candidate.end]),
    )).sort((left, right) => left - right);

    let pending: WorkbookCanvasBorderSegment | null = null;
    const flushPending = () => {
      if (pending == null) return;
      ctx.fillStyle = pending.color;
      if (axis === 'horizontal') {
        ctx.fillRect(pending.start, pending.drawCoord, pending.end - pending.start, pending.thickness);
      } else {
        ctx.fillRect(pending.drawCoord, pending.start, pending.thickness, pending.end - pending.start);
      }
      pending = null;
    };

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index]!;
      const end = boundaries[index + 1]!;
      if (end <= start) continue;

      const overlappingCandidates = getOverlappingWorkbookCanvasBorderCandidates(group.candidates, start, end);
      const winner = chooseWorkbookCanvasBorderWinner(overlappingCandidates, start, end);
      if (winner == null) {
        flushPending();
        continue;
      }

      const drawCoord = resolveWorkbookCanvasBorderDrawCoord(group, overlappingCandidates, winner);

      if (
        pending
        && pending.color === winner.color
        && pending.thickness === winner.thickness
        && pending.drawCoord === drawCoord
        && pending.end === start
      ) {
        pending.end = end;
        continue;
      }

      flushPending();
      pending = {
        start,
        end,
        drawCoord,
        color: winner.color,
        thickness: winner.thickness,
      };
    }

    flushPending();
  });
}

export function resolveWorkbookCanvasCellBorderPriority(
  compareCell: WorkbookCompareCellState | undefined,
  hasEntry: boolean,
): number {
  if (compareCell?.changed) return WORKBOOK_CANVAS_BORDER_PRIORITY.diff;
  return hasEntry
    ? WORKBOOK_CANVAS_BORDER_PRIORITY.grid
    : WORKBOOK_CANVAS_BORDER_PRIORITY.placeholder;
}

export function createWorkbookCanvasBorderRegistry(): WorkbookCanvasBorderRegistry {
  let order = 0;
  const horizontalGroups = new Map<string, WorkbookCanvasBorderGroup>();
  const verticalGroups = new Map<string, WorkbookCanvasBorderGroup>();

  const registerCandidate = (
    groups: Map<string, WorkbookCanvasBorderGroup>,
    seam: number,
    start: number,
    end: number,
    drawCoord: number,
    color: string,
    thickness: number,
    placement: 'leading' | 'trailing',
    priority: number,
  ) => {
    if (end <= start || !isVisibleBorderColor(color)) return;

    const key = getSeamKey(seam);
    const group = groups.get(key) ?? { seam, candidates: [] };
    group.candidates.push({
      start,
      end,
      drawCoord,
      color,
      thickness,
      placement,
      priority,
      order,
    });
    groups.set(key, group);
    order += 1;
  };

  return {
    addRect({
      x,
      y,
      width,
      height,
      color,
      thickness = 1,
      priority = 0,
      edges = ALL_BORDER_EDGES,
    }: WorkbookCanvasBorderRect) {
      if (width <= 0 || height <= 0 || !isVisibleBorderColor(color)) return;
      const resolvedThickness = Math.max(1, Math.min(
        Math.round(thickness),
        Math.ceil(width / 2),
        Math.ceil(height / 2),
      ));

      if (edges.top) {
        registerCandidate(horizontalGroups, y, x, x + width, y, color, resolvedThickness, 'leading', priority);
      }
      if (edges.bottom) {
        registerCandidate(horizontalGroups, y + height, x, x + width, y + height - resolvedThickness, color, resolvedThickness, 'trailing', priority);
      }
      if (edges.left) {
        registerCandidate(verticalGroups, x, y, y + height, x, color, resolvedThickness, 'leading', priority);
      }
      if (edges.right) {
        registerCandidate(verticalGroups, x + width, y, y + height, x + width - resolvedThickness, color, resolvedThickness, 'trailing', priority);
      }
    },
    flush(ctx: CanvasRenderingContext2D) {
      flushWorkbookCanvasBorderGroups(ctx, 'horizontal', horizontalGroups);
      flushWorkbookCanvasBorderGroups(ctx, 'vertical', verticalGroups);
    },
  };
}

export function registerWorkbookCanvasCellBorders(params: {
  registry: WorkbookCanvasBorderRegistry;
  x: number;
  y: number;
  width: number;
  height: number;
  semantic: WorkbookCanvasBorderLayer;
  selection?: WorkbookCanvasBorderLayer | null;
}): void {
  const {
    registry,
    x,
    y,
    width,
    height,
    semantic,
    selection = null,
  } = params;
  registry.addRect({ x, y, width, height, ...semantic });
  if (selection) {
    registry.addRect({ x, y, width, height, ...selection });
  }
}
