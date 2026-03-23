import type { WorkbookMetadataSource } from '../types';
import { resolveWorkbookMetadata, type WorkbookMetadataMap } from './workbookMeta';

interface WorkbookMetadataWorkerRequest {
  data: WorkbookMetadataSource;
}

interface WorkbookMetadataWorkerSuccess {
  ok: true;
  metadata: {
    base: WorkbookMetadataMap | null;
    mine: WorkbookMetadataMap | null;
  };
}

interface WorkbookMetadataWorkerFailure {
  ok: false;
  error: string;
}

type WorkbookMetadataWorkerResponse = WorkbookMetadataWorkerSuccess | WorkbookMetadataWorkerFailure;

export function resolveWorkbookMetadataAsync(data: WorkbookMetadataSource): Promise<{
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
}> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(resolveWorkbookMetadata(data));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/workbookMetaWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkbookMetadataWorkerResponse>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.metadata);
        return;
      }
      reject(new Error(event.data.error));
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Failed to resolve workbook metadata in worker.'));
    };

    const payload: WorkbookMetadataWorkerRequest = { data };
    const transferables: Transferable[] = [];
    if (data.baseBytes) transferables.push(data.baseBytes.buffer);
    if (data.mineBytes) transferables.push(data.mineBytes.buffer);
    worker.postMessage(payload, transferables);
  });
}
