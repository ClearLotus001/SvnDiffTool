import type { SyntaxPresentation } from '@/types';
import type { SupportedShikiLanguage } from '@/utils/diff/shikiSupportedLanguages';
import { createLatestWorkerClient } from '@/utils/async/latestWorkerClient';

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

const syntaxHighlightWorkerClient = createLatestWorkerClient<
  ComputeSyntaxTokensOptions,
  SyntaxHighlightWorkerRequest,
  SyntaxHighlightWorkerResponse,
  SyntaxPresentation
>({
  createWorker: () => new Worker(
    new URL('../../workers/text/syntaxHighlightWorker.ts', import.meta.url),
    { type: 'module' },
  ),
  buildRequest: (requestId, options) => ({
    requestId,
    ...options,
  } satisfies SyntaxHighlightWorkerRequest),
  parseResponse: (response) => (
    response.ok
      ? { ok: true, result: response.presentation }
      : { ok: false, error: response.error }
  ),
  supersededMessage: 'Superseded syntax highlight request.',
  staleMessage: 'Discarded stale syntax highlight result.',
  workerErrorMessage: 'Failed to compute syntax highlighting in worker.',
  workerMessageErrorMessage: 'Failed to receive syntax highlight worker result.',
  workerUnavailableMessage: 'Web Worker is unavailable.',
});

export function computeSyntaxTokensAsync(
  options: ComputeSyntaxTokensOptions,
): Promise<SyntaxPresentation> {
  return syntaxHighlightWorkerClient.compute(options);
}
