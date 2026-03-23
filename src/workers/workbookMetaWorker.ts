/// <reference lib="webworker" />

import type { WorkbookMetadataSource } from '../types';
import { resolveWorkbookMetadata } from '../utils/workbookMeta';

interface WorkbookMetadataWorkerRequest {
  data: WorkbookMetadataSource;
}

interface WorkbookMetadataWorkerSuccess {
  ok: true;
  metadata: ReturnType<typeof resolveWorkbookMetadata>;
}

interface WorkbookMetadataWorkerFailure {
  ok: false;
  error: string;
}

type WorkbookMetadataWorkerResponse = WorkbookMetadataWorkerSuccess | WorkbookMetadataWorkerFailure;

self.onmessage = (event: MessageEvent<WorkbookMetadataWorkerRequest>) => {
  try {
    const metadata = resolveWorkbookMetadata(event.data.data);
    const response: WorkbookMetadataWorkerResponse = { ok: true, metadata };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: WorkbookMetadataWorkerResponse = { ok: false, error: message };
    self.postMessage(response);
  }
};

export {};
