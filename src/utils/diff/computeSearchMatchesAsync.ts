import type { SearchMatch } from '@/types';
import {
  buildSearchPattern,
  findMatchesInSearchableLines,
} from '@/engine/text/search';

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

interface PendingSearchRequest {
  searchableLines: string[];
  options: SearchOptions;
  resolve: (matches: SearchMatch[]) => void;
  reject: (error: Error) => void;
}

class TextSearchWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingSearchRequest>();
  private workerSearchableLines: string[] | null = null;

  compute(searchableLines: string[], options: SearchOptions): Promise<SearchMatch[]> {
    if (!options.query) return Promise.resolve([]);
    if (typeof Worker === 'undefined') {
      return Promise.resolve(this.computeSync(searchableLines, options));
    }

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { searchableLines, options, resolve, reject });

      try {
        const worker = this.ensureWorker();
        if (this.workerSearchableLines !== searchableLines) {
          worker.postMessage({
            type: 'set-lines',
            lines: searchableLines,
          } satisfies TextSearchWorkerSetLinesRequest);
          this.workerSearchableLines = searchableLines;
        }
        worker.postMessage({
          type: 'search',
          requestId,
          query: options.query,
          isRegex: options.isRegex,
          isCaseSensitive: options.isCaseSensitive,
        } satisfies TextSearchWorkerSearchRequest);
      } catch (error) {
        this.pending.delete(requestId);
        this.resolveWithSyncFallback(searchableLines, options, error, resolve, reject);
      }
    });
  }

  warmup() {
    if (typeof Worker === 'undefined') return;
    try {
      this.ensureWorker();
    } catch {
      // Ignore warmup failure; first request will fall back to sync.
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('../../workers/text/textSearchWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (event: MessageEvent<TextSearchWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.matches);
        return;
      }
      this.resolveWithSyncFallback(
        pending.searchableLines,
        pending.options,
        new Error(response.error),
        pending.resolve,
        pending.reject,
      );
    };
    worker.onerror = (event) => {
      this.failPendingRequests(new Error(event.message || 'Failed to compute search matches in worker.'));
    };
    worker.onmessageerror = () => {
      this.failPendingRequests(new Error('Failed to receive search worker result.'));
    };

    this.worker = worker;
    return worker;
  }

  private failPendingRequests(error: Error) {
    const pendingEntries = [...this.pending.values()];
    this.pending.clear();
    this.disposeWorker();
    pendingEntries.forEach((pending) => {
      this.resolveWithSyncFallback(
        pending.searchableLines,
        pending.options,
        error,
        pending.resolve,
        pending.reject,
      );
    });
  }

  private disposeWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.workerSearchableLines = null;
  }

  private computeSync(searchableLines: string[], options: SearchOptions): SearchMatch[] {
    const pattern = buildSearchPattern(options.query, {
      isRegex: options.isRegex,
      isCaseSensitive: options.isCaseSensitive,
    });
    return findMatchesInSearchableLines(searchableLines, pattern);
  }

  private resolveWithSyncFallback(
    searchableLines: string[],
    options: SearchOptions,
    reason: unknown,
    resolve: (matches: SearchMatch[]) => void,
    reject: (error: Error) => void,
  ) {
    try {
      resolve(this.computeSync(searchableLines, options));
    } catch (fallbackError) {
      reject(
        fallbackError instanceof Error
          ? fallbackError
          : new Error(
              reason instanceof Error
                ? reason.message
                : String(reason ?? 'Failed to compute search matches.'),
            ),
      );
    }
  }
}

const textSearchWorkerClient = new TextSearchWorkerClient();
textSearchWorkerClient.warmup();

export function computeSearchMatchesAsync(
  searchableLines: string[],
  options: SearchOptions,
): Promise<SearchMatch[]> {
  return textSearchWorkerClient.compute(searchableLines, options);
}
