export interface LatestRequestTracker {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
  current: () => number;
}

export function createLatestRequestTracker(initialRequestId = 0): LatestRequestTracker {
  let currentRequestId = initialRequestId;

  return {
    begin: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent: (requestId) => requestId === currentRequestId,
    current: () => currentRequestId,
  };
}

export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
