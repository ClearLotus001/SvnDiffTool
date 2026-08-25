export interface WorkbookMaskedRegionOrigin {
  rowNumber: number;
  column: number;
}

export interface WorkbookMaskedRegionMotion extends WorkbookMaskedRegionOrigin {
  revealProgress: number;
  targetProgress: 0 | 1;
}

export type WorkbookMaskedRegionMotionMap = Readonly<Record<string, WorkbookMaskedRegionMotion>>;

export const WORKBOOK_MASK_REVEAL_DURATION_MS = 360;
export const WORKBOOK_MASK_RESTORE_DURATION_MS = 240;

interface AdvanceWorkbookMaskedRegionMotionsResult {
  motionByRegion: WorkbookMaskedRegionMotionMap;
  hasRunningMotion: boolean;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function advanceWorkbookMaskedRegionMotions(
  motionByRegion: WorkbookMaskedRegionMotionMap,
  elapsedMs: number,
): AdvanceWorkbookMaskedRegionMotionsResult {
  const safeElapsedMs = Math.max(0, elapsedMs);
  let hasRunningMotion = false;
  let changed = false;
  const nextMotionByRegion: Record<string, WorkbookMaskedRegionMotion> = {};

  Object.entries(motionByRegion).forEach(([regionId, motion]) => {
    const duration = motion.targetProgress === 1
      ? WORKBOOK_MASK_REVEAL_DURATION_MS
      : WORKBOOK_MASK_RESTORE_DURATION_MS;
    const direction = motion.targetProgress === 1 ? 1 : -1;
    const nextProgress = clampUnit(motion.revealProgress + ((safeElapsedMs / duration) * direction));
    const reachedTarget = nextProgress === motion.targetProgress;

    if (reachedTarget && motion.targetProgress === 0) {
      changed = true;
      return;
    }

    if (!reachedTarget) hasRunningMotion = true;
    if (nextProgress !== motion.revealProgress) changed = true;
    nextMotionByRegion[regionId] = nextProgress === motion.revealProgress
      ? motion
      : { ...motion, revealProgress: nextProgress };
  });

  return {
    motionByRegion: changed ? nextMotionByRegion : motionByRegion,
    hasRunningMotion,
  };
}

export function createWorkbookMaskedRegionMotion(
  origin: WorkbookMaskedRegionOrigin,
  revealProgress = 0,
): WorkbookMaskedRegionMotion {
  return {
    rowNumber: origin.rowNumber,
    column: origin.column,
    revealProgress: clampUnit(revealProgress),
    targetProgress: 1,
  };
}
