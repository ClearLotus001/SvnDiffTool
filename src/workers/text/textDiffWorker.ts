/// <reference lib="webworker" />

import { computeDiff } from '@/engine/text/diff';

interface TextDiffWorkerRequest {
  requestId: number;
  baseText: string;
  mineText: string;
}

interface TextDiffWorkerSuccess {
  ok: true;
  requestId: number;
  diffLines: ReturnType<typeof computeDiff>;
}

interface TextDiffWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type TextDiffWorkerResponse = TextDiffWorkerSuccess | TextDiffWorkerFailure;

self.onmessage = (event: MessageEvent<TextDiffWorkerRequest>) => {
  try {
    const { requestId, baseText, mineText } = event.data;
    const diffLines = computeDiff(baseText, mineText);
    const response: TextDiffWorkerResponse = { ok: true, requestId, diffLines };
    self.postMessage(response);
  } catch (error) {
    const requestId = event.data?.requestId ?? -1;
    const message = error instanceof Error ? error.message : String(error);
    const response: TextDiffWorkerResponse = { ok: false, requestId, error: message };
    self.postMessage(response);
  }
};

export {};
