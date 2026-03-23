import type { DiffLine } from '../types';
import { computeDiff } from '../engine/diff';

interface DiffWorkerRequest {
  baseText: string;
  mineText: string;
}

interface DiffWorkerSuccess {
  ok: true;
  diffLines: DiffLine[];
}

interface DiffWorkerFailure {
  ok: false;
  error: string;
}

type DiffWorkerResponse = DiffWorkerSuccess | DiffWorkerFailure;

export function computeDiffAsync(baseText: string, mineText: string): Promise<DiffLine[]> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(computeDiff(baseText, mineText));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/diffWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
      worker.terminate();

      if (event.data.ok) {
        resolve(event.data.diffLines);
        return;
      }

      reject(new Error(event.data.error));
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Failed to compute diff in worker.'));
    };

    const payload: DiffWorkerRequest = { baseText, mineText };
    worker.postMessage(payload);
  });
}
