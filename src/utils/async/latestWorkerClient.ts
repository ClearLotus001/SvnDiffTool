import { createAbortError, createLatestRequestTracker } from './latestRequest';

interface WorkerResponseWithRequestId {
  requestId: number;
}

type WorkerResponseResult<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; error: unknown };

interface PendingWorkerRequest<TInput, TResult> {
  input: TInput;
  resolve: (result: TResult) => void;
  reject: (error: Error) => void;
}

export interface LatestWorkerClientOptions<
  TInput,
  TRequest,
  TResponse extends WorkerResponseWithRequestId,
  TResult,
> {
  createWorker: () => Worker;
  buildRequest: (requestId: number, input: TInput) => TRequest;
  parseResponse: (response: TResponse) => WorkerResponseResult<TResult>;
  beforeRequest?: (worker: Worker, input: TInput) => void;
  computeWithoutWorker?: (input: TInput) => TResult | Promise<TResult>;
  supersededMessage: string;
  staleMessage: string;
  workerErrorMessage: string;
  workerMessageErrorMessage: string;
  workerUnavailableMessage?: string;
  onDispose?: () => void;
}

export interface LatestWorkerClient<TInput, TResult> {
  compute: (input: TInput) => Promise<TResult>;
  warmup: () => void;
  dispose: () => void;
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error || fallbackMessage);
  return new Error(String(error ?? fallbackMessage));
}

export function createLatestWorkerClient<
  TInput,
  TRequest,
  TResponse extends WorkerResponseWithRequestId,
  TResult,
>(
  options: LatestWorkerClientOptions<TInput, TRequest, TResponse, TResult>,
): LatestWorkerClient<TInput, TResult> {
  let worker: Worker | null = null;
  const requestTracker = createLatestRequestTracker();
  const pending = new Map<number, PendingWorkerRequest<TInput, TResult>>();

  const dispose = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    options.onDispose?.();
  };

  const resolveWithFallback = (
    input: TInput,
    reason: unknown,
    resolve: (result: TResult) => void,
    reject: (error: Error) => void,
  ) => {
    if (!options.computeWithoutWorker) {
      reject(
        normalizeError(
          reason,
          options.workerUnavailableMessage ?? options.workerErrorMessage,
        ),
      );
      return;
    }

    try {
      Promise.resolve(options.computeWithoutWorker(input))
        .then(resolve)
        .catch((fallbackError) => {
          reject(
            fallbackError instanceof Error
              ? fallbackError
              : normalizeError(reason, options.workerErrorMessage),
          );
        });
    } catch (fallbackError) {
      reject(
        fallbackError instanceof Error
          ? fallbackError
          : normalizeError(reason, options.workerErrorMessage),
      );
    }
  };

  const failPendingRequests = (error: Error) => {
    const pendingEntries = [...pending.values()];
    pending.clear();
    dispose();
    pendingEntries.forEach((entry) => {
      resolveWithFallback(entry.input, error, entry.resolve, entry.reject);
    });
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;

    const nextWorker = options.createWorker();
    nextWorker.onmessage = (event: MessageEvent<TResponse>) => {
      const response = event.data;
      const entry = pending.get(response.requestId);
      if (!entry) return;

      pending.delete(response.requestId);
      if (!requestTracker.isCurrent(response.requestId)) {
        entry.reject(createAbortError(options.staleMessage));
        return;
      }

      const result = options.parseResponse(response);
      if (result.ok) {
        entry.resolve(result.result);
        return;
      }

      resolveWithFallback(entry.input, result.error, entry.resolve, entry.reject);
    };
    nextWorker.onerror = (event) => {
      failPendingRequests(
        normalizeError(
          event.message || options.workerErrorMessage,
          options.workerErrorMessage,
        ),
      );
    };
    nextWorker.onmessageerror = () => {
      failPendingRequests(new Error(options.workerMessageErrorMessage));
    };

    worker = nextWorker;
    return nextWorker;
  };

  return {
    compute: (input: TInput): Promise<TResult> => {
      if (typeof Worker === 'undefined') {
        if (!options.computeWithoutWorker) {
          return Promise.reject(
            new Error(options.workerUnavailableMessage ?? 'Web Worker is unavailable.'),
          );
        }

        try {
          return Promise.resolve(options.computeWithoutWorker(input));
        } catch (error) {
          return Promise.reject(normalizeError(error, options.workerErrorMessage));
        }
      }

      if (pending.size > 0) {
        const abortError = createAbortError(options.supersededMessage);
        const pendingEntries = [...pending.values()];
        pending.clear();
        dispose();
        pendingEntries.forEach((entry) => entry.reject(abortError));
      }

      return new Promise((resolve, reject) => {
        const requestId = requestTracker.begin();
        pending.set(requestId, { input, resolve, reject });

        try {
          const activeWorker = ensureWorker();
          options.beforeRequest?.(activeWorker, input);
          activeWorker.postMessage(options.buildRequest(requestId, input));
        } catch (error) {
          pending.delete(requestId);
          resolveWithFallback(input, error, resolve, reject);
        }
      });
    },
    warmup: () => {
      if (typeof Worker === 'undefined') return;
      try {
        ensureWorker();
      } catch {
        // Ignore warmup failure; compute will fall back if needed.
      }
    },
    dispose,
  };
}

