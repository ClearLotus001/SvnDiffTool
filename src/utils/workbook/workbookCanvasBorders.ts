import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';

interface WorkbookCanvasBorderCandidate {
  start: number;
  end: number;
  drawCoord: number;
  color: string;
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
}

export interface WorkbookCanvasBorderRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  priority?: number;
}

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
  const hasLeadingCandidate = overlappingCandidates.some(candidate => candidate.drawCoord === group.seam);
  const hasTrailingCandidate = overlappingCandidates.some(candidate => candidate.drawCoord === group.seam - 1);

  if (hasLeadingCandidate && hasTrailingCandidate) {
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
        ctx.fillRect(pending.start, pending.drawCoord, pending.end - pending.start, 1);
      } else {
        ctx.fillRect(pending.drawCoord, pending.start, 1, pending.end - pending.start);
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
      };
    }

    flushPending();
  });
}

export function resolveWorkbookCanvasCellBorderPriority(
  compareCell: WorkbookCompareCellState | undefined,
  hasEntry: boolean,
): number {
  if (compareCell?.changed) return 2;
  return hasEntry ? 0 : 1;
}

export function createWorkbookCanvasBorderRegistry() {
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
      priority = 0,
    }: WorkbookCanvasBorderRect) {
      if (width <= 0 || height <= 0 || !isVisibleBorderColor(color)) return;

      registerCandidate(horizontalGroups, y, x, x + width, y, color, priority);
      registerCandidate(horizontalGroups, y + height, x, x + width, y + height - 1, color, priority);
      registerCandidate(verticalGroups, x, y, y + height, x, color, priority);
      registerCandidate(verticalGroups, x + width, y, y + height, x + width - 1, color, priority);
    },
    flush(ctx: CanvasRenderingContext2D) {
      flushWorkbookCanvasBorderGroups(ctx, 'horizontal', horizontalGroups);
      flushWorkbookCanvasBorderGroups(ctx, 'vertical', verticalGroups);
    },
  };
}
