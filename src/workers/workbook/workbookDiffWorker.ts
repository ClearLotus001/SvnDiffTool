/// <reference lib="webworker" />

import { computeDiff } from '@/engine/text/diff';
import { computeWorkbookDiff, isWorkbookTextPair } from '@/engine/workbook/workbookDiff';
import { resolveDiffTexts } from '@/utils/diff/diffSource';
import type { WorkbookDiffWorkerRequest, WorkbookDiffWorkerResponse } from '@/utils/workbook/workbookDiffAsyncShared';

function getNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

self.onmessage = (event: MessageEvent<WorkbookDiffWorkerRequest>) => {
  const requestId = event.data?.requestId ?? -1;

  try {
    const textStart = getNow();
    const { baseText, mineText } = resolveDiffTexts(event.data.source, event.data.locale);
    const textResolveMs = getNow() - textStart;

    const diffStart = getNow();
    const diffLines = isWorkbookTextPair(baseText, mineText)
      ? computeWorkbookDiff(baseText, mineText, event.data.compareMode)
      : computeDiff(baseText, mineText);

    const response: WorkbookDiffWorkerResponse = {
      ok: true,
      requestId,
      result: {
        diffLines,
        textResolveMs,
        diffMs: getNow() - diffStart,
      },
    };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: WorkbookDiffWorkerResponse = { ok: false, requestId, error: message };
    self.postMessage(response);
  }
};

export {};
