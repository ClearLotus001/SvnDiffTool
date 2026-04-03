import type { SyntaxPresentation } from '@/types';
import type { SupportedShikiLanguage } from '@/utils/diff/shikiSupportedLanguages';

interface ComputeSyntaxTokensOptions {
  baseText: string;
  mineText: string;
  languageId: SupportedShikiLanguage;
  themeName: string;
}

interface SyntaxHighlightWorkerRequest extends ComputeSyntaxTokensOptions {
  requestId: number;
}

interface SyntaxHighlightWorkerSuccess {
  ok: true;
  requestId: number;
  presentation: SyntaxPresentation;
}

interface SyntaxHighlightWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

type SyntaxHighlightWorkerResponse = SyntaxHighlightWorkerSuccess | SyntaxHighlightWorkerFailure;

interface PendingSyntaxHighlightRequest {
  resolve: (presentation: SyntaxPresentation) => void;
  reject: (error: Error) => void;
}

class SyntaxHighlightWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingSyntaxHighlightRequest>();

  compute(options: ComputeSyntaxTokensOptions): Promise<SyntaxPresentation> {
    if (typeof Worker === 'undefined') {
      return Promise.reject(new Error('Web Worker is unavailable.'));
    }

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { resolve, reject });

      try {
        this.ensureWorker().postMessage({
          requestId,
          ...options,
        } satisfies SyntaxHighlightWorkerRequest);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  warmup() {
    if (typeof Worker === 'undefined') return;
    try {
      this.ensureWorker();
    } catch {
      // Ignore worker warmup failures. Caller will fall back to local tokenizer.
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('../../workers/text/syntaxHighlightWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<SyntaxHighlightWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.presentation);
        return;
      }
      pending.reject(new Error(response.error));
    };

    worker.onerror = (event) => {
      this.failPendingRequests(new Error(event.message || 'Failed to compute syntax highlighting in worker.'));
    };

    worker.onmessageerror = () => {
      this.failPendingRequests(new Error('Failed to receive syntax highlight worker result.'));
    };

    this.worker = worker;
    return worker;
  }

  private failPendingRequests(error: Error) {
    const pendingEntries = [...this.pending.values()];
    this.pending.clear();
    this.disposeWorker();
    pendingEntries.forEach((pending) => pending.reject(error));
  }

  private disposeWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
  }
}

const syntaxHighlightWorkerClient = new SyntaxHighlightWorkerClient();
syntaxHighlightWorkerClient.warmup();

export function computeSyntaxTokensAsync(
  options: ComputeSyntaxTokensOptions,
): Promise<SyntaxPresentation> {
  return syntaxHighlightWorkerClient.compute(options);
}
