import type { DiffLine } from '@/types';
import { computeDiff } from '@/engine/text/diff';

interface TextDiffWorkerRequest {
  requestId: number;
  baseText: string;
  mineText: string;
}

interface TextDiffWorkerSuccess {
  ok: true;
  requestId: number;
  diffLines: DiffLine[];
}

interface TextDiffWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type TextDiffWorkerResponse = TextDiffWorkerSuccess | TextDiffWorkerFailure;

interface PendingTextDiffRequest {
  baseText: string;
  mineText: string;
  resolve: (diffLines: DiffLine[]) => void;
  reject: (error: Error) => void;
}

class TextDiffWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingTextDiffRequest>();

  compute(baseText: string, mineText: string): Promise<DiffLine[]> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(computeDiff(baseText, mineText));
    }

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { baseText, mineText, resolve, reject });

      try {
        this.ensureWorker().postMessage({ requestId, baseText, mineText } satisfies TextDiffWorkerRequest);
      } catch (error) {
        this.pending.delete(requestId);
        this.resolveWithSyncFallback(baseText, mineText, error, resolve, reject);
      }
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('../../workers/text/textDiffWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (event: MessageEvent<TextDiffWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.diffLines);
        return;
      }
      this.resolveWithSyncFallback(
        pending.baseText,
        pending.mineText,
        new Error(response.error),
        pending.resolve,
        pending.reject,
      );
    };
    worker.onerror = (event) => {
      this.failPendingRequests(new Error(event.message || 'Failed to compute text diff in worker.'));
    };
    worker.onmessageerror = () => {
      this.failPendingRequests(new Error('Failed to receive text diff worker result.'));
    };

    this.worker = worker;
    return worker;
  }

  private failPendingRequests(error: Error) {
    const pendingEntries = [...this.pending.values()];
    this.pending.clear();
    this.disposeWorker();
    pendingEntries.forEach((pending) => {
      this.resolveWithSyncFallback(
        pending.baseText,
        pending.mineText,
        error,
        pending.resolve,
        pending.reject,
      );
    });
  }

  private disposeWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
  }

  private resolveWithSyncFallback(
    baseText: string,
    mineText: string,
    reason: unknown,
    resolve: (diffLines: DiffLine[]) => void,
    reject: (error: Error) => void,
  ) {
    try {
      resolve(computeDiff(baseText, mineText));
    } catch (fallbackError) {
      reject(
        fallbackError instanceof Error
          ? fallbackError
          : new Error(
              reason instanceof Error
                ? reason.message
                : String(reason ?? 'Failed to compute text diff.'),
            ),
      );
    }
  }
}

const textDiffWorkerClient = new TextDiffWorkerClient();

export function computeTextDiffAsync(
  baseText: string,
  mineText: string,
): Promise<DiffLine[]> {
  return textDiffWorkerClient.compute(baseText, mineText);
}
