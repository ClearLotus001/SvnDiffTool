import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  advanceWorkbookMaskedRegionMotions,
  createWorkbookMaskedRegionMotion,
  type WorkbookMaskedRegionMotionMap,
  type WorkbookMaskedRegionOrigin,
} from '@/utils/workbook/workbookMaskedRegionMotion';

interface WorkbookMaskedRegionRevealValue {
  motionByRegion: WorkbookMaskedRegionMotionMap;
  revealRegion: (regionId: string | null, origin?: WorkbookMaskedRegionOrigin) => void;
  clearRegion: () => void;
}

const EMPTY_MOTION_BY_REGION: WorkbookMaskedRegionMotionMap = Object.freeze({});

const WorkbookMaskedRegionRevealContext = createContext<WorkbookMaskedRegionRevealValue>({
  motionByRegion: EMPTY_MOTION_BY_REGION,
  revealRegion: () => {},
  clearRegion: () => {},
});

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WorkbookMaskedRegionRevealProvider({
  enabled,
  onRegionEnter,
  children,
}: {
  enabled: boolean;
  onRegionEnter?: (() => void) | undefined;
  children: ReactNode;
}) {
  const [motionByRegion, setMotionByRegion] = useState<WorkbookMaskedRegionMotionMap>(EMPTY_MOTION_BY_REGION);
  const motionByRegionRef = useRef(motionByRegion);
  const activeRegionIdRef = useRef('');
  const animationFrameRef = useRef(0);
  const previousFrameTimeRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTickRef = useRef<(timestamp: number) => void>(() => {});
  const onRegionEnterRef = useRef(onRegionEnter);
  onRegionEnterRef.current = onRegionEnter;

  const commitMotionByRegion = useCallback((next: WorkbookMaskedRegionMotionMap) => {
    motionByRegionRef.current = next;
    setMotionByRegion(next);
  }, []);

  const scheduleAnimation = useCallback(() => {
    if (animationFrameRef.current || typeof window === 'undefined') return;
    previousFrameTimeRef.current = 0;
    animationFrameRef.current = window.requestAnimationFrame((timestamp) => {
      animationTickRef.current(timestamp);
    });
  }, []);

  animationTickRef.current = (timestamp) => {
    const previousTimestamp = previousFrameTimeRef.current || timestamp;
    const elapsedMs = Math.min(64, Math.max(0, timestamp - previousTimestamp));
    previousFrameTimeRef.current = timestamp;
    const result = advanceWorkbookMaskedRegionMotions(motionByRegionRef.current, elapsedMs);
    if (result.motionByRegion !== motionByRegionRef.current) {
      commitMotionByRegion(result.motionByRegion);
    }
    if (result.hasRunningMotion) {
      animationFrameRef.current = window.requestAnimationFrame((nextTimestamp) => {
        animationTickRef.current(nextTimestamp);
      });
      return;
    }
    animationFrameRef.current = 0;
    previousFrameTimeRef.current = 0;
  };

  const transitionToRegion = useCallback((regionId: string, origin?: WorkbookMaskedRegionOrigin) => {
    const previousRegionId = activeRegionIdRef.current;
    if (previousRegionId === regionId) return;
    activeRegionIdRef.current = regionId;

    const reducedMotion = prefersReducedMotion();
    const nextMotionByRegion: Record<string, ReturnType<typeof createWorkbookMaskedRegionMotion>> = {
      ...motionByRegionRef.current,
    };
    if (previousRegionId) {
      if (reducedMotion) {
        delete nextMotionByRegion[previousRegionId];
      } else {
        const previousMotion = nextMotionByRegion[previousRegionId];
        if (previousMotion) {
          nextMotionByRegion[previousRegionId] = { ...previousMotion, targetProgress: 0 };
        }
      }
    }

    if (regionId) {
      const existingMotion = nextMotionByRegion[regionId];
      const resolvedOrigin = origin ?? existingMotion ?? { rowNumber: 0, column: 0 };
      nextMotionByRegion[regionId] = reducedMotion
        ? createWorkbookMaskedRegionMotion(resolvedOrigin, 1)
        : {
            ...createWorkbookMaskedRegionMotion(resolvedOrigin, existingMotion?.revealProgress ?? 0),
            targetProgress: 1,
          };
    }

    commitMotionByRegion(nextMotionByRegion);
    if (!reducedMotion) scheduleAnimation();
    if (regionId) onRegionEnterRef.current?.();
  }, [commitMotionByRegion, scheduleAnimation]);

  useEffect(() => {
    if (enabled) return;
    activeRegionIdRef.current = '';
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    previousFrameTimeRef.current = 0;
    commitMotionByRegion(EMPTY_MOTION_BY_REGION);
  }, [commitMotionByRegion, enabled]);

  useEffect(() => () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const revealRegion = useCallback((regionId: string | null, origin?: WorkbookMaskedRegionOrigin) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    transitionToRegion(enabled ? (regionId ?? '') : '', origin);
  }, [enabled, transitionToRegion]);

  const clearRegion = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      transitionToRegion('');
    }, 24);
  }, [transitionToRegion]);

  const value = useMemo(() => ({
    motionByRegion,
    revealRegion,
    clearRegion,
  }), [clearRegion, motionByRegion, revealRegion]);

  return (
    <WorkbookMaskedRegionRevealContext.Provider value={value}>
      {children}
    </WorkbookMaskedRegionRevealContext.Provider>
  );
}

export function useWorkbookMaskedRegionReveal(): WorkbookMaskedRegionRevealValue {
  return useContext(WorkbookMaskedRegionRevealContext);
}
