import { useEffect, useRef, useState } from 'react';

export type AnimatedVisibilityState = 'entering' | 'entered' | 'exiting';

interface UseAnimatedVisibilityOptions {
  exitDurationMs?: number;
}

export default function useAnimatedVisibility(
  visible: boolean,
  options?: UseAnimatedVisibilityOptions,
) {
  const exitDurationMs = options?.exitDurationMs ?? 170;
  const [shouldRender, setShouldRender] = useState(visible);
  const [state, setState] = useState<AnimatedVisibilityState>(visible ? 'entered' : 'exiting');
  const rafIdsRef = useRef<number[]>([]);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      rafIdsRef.current.forEach((id) => cancelAnimationFrame(id));
      rafIdsRef.current = [];
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    clearPending();

    if (visible) {
      setShouldRender(true);
      setState('entering');
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          setState('entered');
        });
        rafIdsRef.current.push(raf2);
      });
      rafIdsRef.current.push(raf1);
      return clearPending;
    }

    if (!shouldRender) {
      setState('exiting');
      return clearPending;
    }

    setState('exiting');
    timeoutRef.current = window.setTimeout(() => {
      setShouldRender(false);
    }, exitDurationMs);

    return clearPending;
  }, [exitDurationMs, shouldRender, visible]);

  return {
    shouldRender,
    state,
  };
}
