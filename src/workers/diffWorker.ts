/// <reference lib="webworker" />

import type { WorkbookCompareMode } from '../types';
import { computeSmartDiff } from '../engine/smartDiff';

interface DiffWorkerRequest {
  baseText: string;
  mineText: string;
  compareMode: WorkbookCompareMode;
}

interface DiffWorkerSuccess {
  ok: true;
  diffLines: ReturnType<typeof computeSmartDiff>;
}

interface DiffWorkerFailure {
  ok: false;
  error: string;
}

type DiffWorkerResponse = DiffWorkerSuccess | DiffWorkerFailure;

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  try {
    const { baseText, mineText, compareMode } = event.data;
    const diffLines = computeSmartDiff(baseText, mineText, compareMode);
    const response: DiffWorkerResponse = { ok: true, diffLines };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: DiffWorkerResponse = { ok: false, error: message };
    self.postMessage(response);
  }
};

export {};
