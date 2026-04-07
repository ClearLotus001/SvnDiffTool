const DEFAULT_WARMUP_TIMEOUT_MS = 1_500;

type IdleCallbackHandle = number;
type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

interface IdleCallbackHost {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout?: number }) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
}

export function scheduleWorkerWarmup(warmup: () => void): void {
  if (typeof window === 'undefined') return;
  if (typeof Worker === 'undefined') return;

  const startWarmup = () => {
    let finished = false;
    const idleHost = globalThis as typeof globalThis & IdleCallbackHost;

    const runWarmup = () => {
      if (finished) return;
      finished = true;
      warmup();
    };

    const idleCallbackHandle = idleHost.requestIdleCallback?.(() => {
      runWarmup();
    }, { timeout: DEFAULT_WARMUP_TIMEOUT_MS });

    window.setTimeout(() => {
      if (idleCallbackHandle != null) {
        idleHost.cancelIdleCallback?.(idleCallbackHandle);
      }
      runWarmup();
    }, DEFAULT_WARMUP_TIMEOUT_MS);
  };

  if (typeof document === 'undefined' || document.readyState === 'complete') {
    window.setTimeout(startWarmup, 0);
    return;
  }

  window.addEventListener('load', () => {
    window.setTimeout(startWarmup, 0);
  }, { once: true });
}
