/// <reference lib="webworker" />

import { computeDiff } from '../engine/diff';

interface DiffWorkerRequest {
  baseText: string;
  mineText: string;
}

interface DiffWorkerSuccess {
  ok: true;
  diffLines: ReturnType<typeof computeDiff>;
}

interface DiffWorkerFailure {
  ok: false;
  error: string;
}

type DiffWorkerResponse = DiffWorkerSuccess | DiffWorkerFailure;

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  try {
    const { baseText, mineText } = event.data;
    const diffLines = computeDiff(baseText, mineText);
    const response: DiffWorkerResponse = { ok: true, diffLines };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: DiffWorkerResponse = { ok: false, error: message };
    self.postMessage(response);
  }
};

export {};
