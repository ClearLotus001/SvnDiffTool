import { computeDiff } from '@/engine/text/diff';
import { computeWorkbookDiff, isWorkbookTextPair } from '@/engine/workbook/workbookDiff';
import { getRuntimeLocale, type Locale } from '@/i18n/core';
import type { WorkbookCompareMode } from '@/types';
import { createLatestWorkerClient } from '@/utils/async/latestWorkerClient';
import { resolveDiffTexts } from '@/utils/diff/diffSource';
import type {
  WorkbookDiffAsyncInput,
  WorkbookDiffAsyncResult,
  WorkbookDiffWorkerRequest,
  WorkbookDiffWorkerResponse,
} from '@/utils/workbook/workbookDiffAsyncShared';

interface NormalizedWorkbookDiffAsyncInput extends WorkbookDiffAsyncInput {
  compareMode: WorkbookCompareMode;
  locale: Locale;
}

function getNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function hasInlineContent(content: string | null): content is string {
  return content != null && content !== '';
}

function normalizeInput(input: WorkbookDiffAsyncInput): NormalizedWorkbookDiffAsyncInput {
  return {
    ...input,
    compareMode: input.compareMode ?? 'strict',
    locale: input.locale ?? getRuntimeLocale(),
  };
}

function buildWorkerSource(input: NormalizedWorkbookDiffAsyncInput): WorkbookDiffWorkerRequest['source'] {
  return {
    baseName: input.baseName,
    mineName: input.mineName,
    fileName: input.fileName,
    baseContent: input.baseContent,
    mineContent: input.mineContent,
    baseBytes: hasInlineContent(input.baseContent) ? null : input.baseBytes,
    mineBytes: hasInlineContent(input.mineContent) ? null : input.mineBytes,
  };
}

function computeDiffResultSync(input: NormalizedWorkbookDiffAsyncInput): WorkbookDiffAsyncResult {
  const textStart = getNow();
  const { baseText, mineText } = resolveDiffTexts(buildWorkerSource(input), input.locale);
  const textResolveMs = getNow() - textStart;

  const diffStart = getNow();
  const diffLines = isWorkbookTextPair(baseText, mineText)
    ? computeWorkbookDiff(baseText, mineText, input.compareMode)
    : computeDiff(baseText, mineText);

  return {
    diffLines,
    textResolveMs,
    diffMs: getNow() - diffStart,
  };
}

const workbookDiffWorkerClient = createLatestWorkerClient<
  NormalizedWorkbookDiffAsyncInput,
  WorkbookDiffWorkerRequest,
  WorkbookDiffWorkerResponse,
  WorkbookDiffAsyncResult
>({
  createWorker: () => new Worker(
    new URL('../../workers/workbook/workbookDiffWorker.ts', import.meta.url),
    { type: 'module' },
  ),
  buildRequest: (requestId, input) => ({
    requestId,
    source: buildWorkerSource(input),
    compareMode: input.compareMode,
    locale: input.locale,
  }),
  parseResponse: (response) => (
    response.ok
      ? { ok: true, result: response.result }
      : { ok: false, error: response.error }
  ),
  computeWithoutWorker: computeDiffResultSync,
  supersededMessage: 'Superseded workbook diff request.',
  staleMessage: 'Discarded stale workbook diff result.',
  workerErrorMessage: 'Failed to compute workbook diff in worker.',
  workerMessageErrorMessage: 'Failed to receive workbook diff worker result.',
});

export function computeWorkbookDiffAsync(input: WorkbookDiffAsyncInput): Promise<WorkbookDiffAsyncResult> {
  return workbookDiffWorkerClient.compute(normalizeInput(input));
}
