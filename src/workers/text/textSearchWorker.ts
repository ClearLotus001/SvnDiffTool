/// <reference lib="webworker" />

import { buildSearchPattern, findMatchesInSearchableLines } from '@/engine/text/search';

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

type TextSearchWorkerRequest = TextSearchWorkerSetLinesRequest | TextSearchWorkerSearchRequest;

interface TextSearchWorkerSuccess {
  ok: true;
  requestId: number;
  matches: ReturnType<typeof findMatchesInSearchableLines>;
}

interface TextSearchWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type TextSearchWorkerResponse = TextSearchWorkerSuccess | TextSearchWorkerFailure;

let searchableLines: string[] = [];

self.onmessage = (event: MessageEvent<TextSearchWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'set-lines') {
    searchableLines = request.lines;
    return;
  }

  try {
    const pattern = buildSearchPattern(request.query, {
      isRegex: request.isRegex,
      isCaseSensitive: request.isCaseSensitive,
    });
    const matches = findMatchesInSearchableLines(searchableLines, pattern);
    const response: TextSearchWorkerResponse = {
      ok: true,
      requestId: request.requestId,
      matches,
    };
    self.postMessage(response);
  } catch (error) {
    const response: TextSearchWorkerResponse = {
      ok: false,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};
