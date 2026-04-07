import type { SearchMatch } from '@/types';
import {
  buildSearchPattern,
  findMatchesInSearchableLines,
} from '@/engine/text/search';
import { createLatestWorkerClient } from '@/utils/async/latestWorkerClient';
import { scheduleWorkerWarmup } from '@/utils/async/workerWarmup';

interface SearchOptions {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
}

interface TextSearchWorkerSetLinesRequest {
  type: 'set-lines';
  lines: string[];
}

interface TextSearchWorkerSearchRequest {
  type: 'search';
  requestId: number;
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
}

interface TextSearchWorkerSuccess {
  ok: true;
  requestId: number;
  matches: SearchMatch[];
}

interface TextSearchWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type TextSearchWorkerResponse = TextSearchWorkerSuccess | TextSearchWorkerFailure;

interface TextSearchRequestInput {
  searchableLines: string[];
  options: SearchOptions;
}

function computeSearchMatchesSync({
  searchableLines,
  options,
}: TextSearchRequestInput): SearchMatch[] {
  const pattern = buildSearchPattern(options.query, {
    isRegex: options.isRegex,
    isCaseSensitive: options.isCaseSensitive,
  });
  return findMatchesInSearchableLines(searchableLines, pattern);
}

let workerSearchableLines: string[] | null = null;

const textSearchWorkerClient = createLatestWorkerClient<
  TextSearchRequestInput,
  TextSearchWorkerSearchRequest,
  TextSearchWorkerResponse,
  SearchMatch[]
>({
  createWorker: () => new Worker(
    new URL('../../workers/text/textSearchWorker.ts', import.meta.url),
    { type: 'module' },
  ),
  beforeRequest: (worker, input) => {
    if (workerSearchableLines === input.searchableLines) return;

    worker.postMessage({
      type: 'set-lines',
      lines: input.searchableLines,
    } satisfies TextSearchWorkerSetLinesRequest);
    workerSearchableLines = input.searchableLines;
  },
  buildRequest: (requestId, input) => ({
    type: 'search',
    requestId,
    query: input.options.query,
    isRegex: input.options.isRegex,
    isCaseSensitive: input.options.isCaseSensitive,
  } satisfies TextSearchWorkerSearchRequest),
  parseResponse: (response) => (
    response.ok
      ? { ok: true, result: response.matches }
      : { ok: false, error: response.error }
  ),
  computeWithoutWorker: computeSearchMatchesSync,
  supersededMessage: 'Superseded search request.',
  staleMessage: 'Discarded stale search result.',
  workerErrorMessage: 'Failed to compute search matches in worker.',
  workerMessageErrorMessage: 'Failed to receive search worker result.',
  onDispose: () => {
    workerSearchableLines = null;
  },
});

scheduleWorkerWarmup(() => {
  textSearchWorkerClient.warmup();
});

export function computeSearchMatchesAsync(
  searchableLines: string[],
  options: SearchOptions,
): Promise<SearchMatch[]> {
  if (!options.query) return Promise.resolve([]);
  return textSearchWorkerClient.compute({ searchableLines, options });
}
