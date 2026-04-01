import type { WorkbookMetadataSource } from '@/types';
import { resolveWorkbookMetadata, type WorkbookMetadataMap } from '@/utils/workbook/workbookMeta';

interface WorkbookMetadataWorkerRequest {
  requestId: number;
  data: WorkbookMetadataSource;
}

interface WorkbookMetadataWorkerSuccess {
  ok: true;
  requestId: number;
  metadata: {
    base: WorkbookMetadataMap | null;
    mine: WorkbookMetadataMap | null;
  };
}

interface WorkbookMetadataWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type WorkbookMetadataWorkerResponse = WorkbookMetadataWorkerSuccess | WorkbookMetadataWorkerFailure;

type MetadataResult = { base: WorkbookMetadataMap | null; mine: WorkbookMetadataMap | null };

interface PendingMetadataRequest {
  resolve: (result: MetadataResult) => void;
  reject: (error: Error) => void;
  data: WorkbookMetadataSource;
}

class WorkbookMetadataWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingMetadataRequest>();

  compute(data: WorkbookMetadataSource): Promise<MetadataResult> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(resolveWorkbookMetadata(data));
    }

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { resolve, reject, data });

      try {
        const payload: WorkbookMetadataWorkerRequest = { requestId, data };
        // Note: We intentionally do NOT transfer bytes here because the caller
        // may still need the buffer after this call. Transferring would
        // neuterthe ArrayBuffer and break downstream consumers.
        this.ensureWorker().postMessage(payload);
      } catch (error) {
        this.pending.delete(requestId);
        this.resolveWithSyncFallback(data, error, resolve, reject);
      }
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('../../workers/workbook/workbookMetaWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (event: MessageEvent<WorkbookMetadataWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.metadata);
        return;
      }
      this.resolveWithSyncFallback(
        pending.data,
        new Error(response.error),
        pending.resolve,
        pending.reject,
      );
    };
    worker.onerror = (event) => {
      this.failPendingRequests(new Error(event.message || 'Failed to resolve workbook metadata in worker.'));
    };
    worker.onmessageerror = () => {
      this.failPendingRequests(new Error('Failed to receive workbook metadata worker result.'));
    };

    this.worker = worker;
    return worker;
  }

  private failPendingRequests(error: Error) {
    const pendingEntries = [...this.pending.values()];
    this.pending.clear();
    this.disposeWorker();
    pendingEntries.forEach((pending) => {
      this.resolveWithSyncFallback(pending.data, error, pending.resolve, pending.reject);
    });
  }

  private disposeWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
  }

  private resolveWithSyncFallback(
    data: WorkbookMetadataSource,
    reason: unknown,
    resolve: (result: MetadataResult) => void,
    reject: (error: Error) => void,
  ) {
    try {
      resolve(resolveWorkbookMetadata(data));
    } catch (fallbackError) {
      reject(
        fallbackError instanceof Error
          ? fallbackError
          : new Error(
              reason instanceof Error
                ? reason.message
                : String(reason ?? 'Failed to resolve workbook metadata.'),
            ),
      );
    }
  }
}

const metadataWorkerClient = new WorkbookMetadataWorkerClient();

export function resolveWorkbookMetadataAsync(data: WorkbookMetadataSource): Promise<MetadataResult> {
  return metadataWorkerClient.compute(data);
}
