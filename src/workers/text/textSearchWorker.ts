/// <reference lib="webworker" />

import {
  buildSearchPattern,
  scanMatchesInSearchableLines,
  type SearchScanResult,
} from '@/engine/text/search';

interface TextSearchWorkerSetLinesRequest {
  type: 'set-lines';
  lines: string[];
  lineStartOffsets: number[] | null;
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
  result: SearchScanResult;
}

interface TextSearchWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type TextSearchWorkerResponse = TextSearchWorkerSuccess | TextSearchWorkerFailure;

let searchableLines: string[] = [];
let lineStartOffsets: number[] | null = null;

self.onmessage = (event: MessageEvent<TextSearchWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'set-lines') {
    searchableLines = request.lines;
    lineStartOffsets = request.lineStartOffsets;
    return;
  }

  try {
    const pattern = buildSearchPattern(request.query, {
      isRegex: request.isRegex,
      isCaseSensitive: request.isCaseSensitive,
    });
    const result = scanMatchesInSearchableLines(
      searchableLines,
      pattern,
      undefined,
      lineStartOffsets,
    );
    const response: TextSearchWorkerResponse = {
      ok: true,
      requestId: request.requestId,
      result,
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
