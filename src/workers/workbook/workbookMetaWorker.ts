/// <reference lib="webworker" />

import type { WorkbookMetadataSource } from '@/types';
import { resolveWorkbookMetadata } from '@/utils/workbook/workbookMeta';

interface WorkbookMetadataWorkerRequest {
  requestId: number;
  data: WorkbookMetadataSource;
}

interface WorkbookMetadataWorkerSuccess {
  ok: true;
  requestId: number;
  metadata: ReturnType<typeof resolveWorkbookMetadata>;
}

interface WorkbookMetadataWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type WorkbookMetadataWorkerResponse = WorkbookMetadataWorkerSuccess | WorkbookMetadataWorkerFailure;

self.onmessage = (event: MessageEvent<WorkbookMetadataWorkerRequest>) => {
  const requestId = event.data?.requestId ?? -1;
  try {
    const metadata = resolveWorkbookMetadata(event.data.data);
    const response: WorkbookMetadataWorkerResponse = { ok: true, requestId, metadata };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: WorkbookMetadataWorkerResponse = { ok: false, requestId, error: message };
    self.postMessage(response);
  }
};

export {};
