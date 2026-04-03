/// <reference lib="webworker" />

import {
  createHighlighterCore,
} from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { ThemeRegistrationAny } from '@shikijs/types';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import githubDarkHighContrast from '@shikijs/themes/github-dark-high-contrast';
import type { SyntaxPresentation, Token } from '@/types';
import type { SupportedShikiLanguage } from '@/utils/diff/shikiSupportedLanguages';
import { shikiLanguageRegistry } from '@/workers/text/shikiLanguageRegistry';

interface SyntaxHighlightWorkerRequest {
  requestId: number;
  baseText: string;
  mineText: string;
  languageId: SupportedShikiLanguage;
  themeName: PreloadedThemeName;
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

const PRELOADED_THEMES = {
  'github-dark': githubDark,
  'github-light': githubLight,
  'github-dark-high-contrast': githubDarkHighContrast,
} as const satisfies Record<string, ThemeRegistrationAny>;
type PreloadedThemeName = keyof typeof PRELOADED_THEMES;

const loadedLanguages = new Set<string>();
const highlighterPromise = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  themes: Object.values(PRELOADED_THEMES),
  langs: [],
});

function toLineTokens(
  code: string,
  languageId: SupportedShikiLanguage,
  themeName: PreloadedThemeName,
): Promise<Token[][]> {
  return highlighterPromise.then(async (highlighter) => {
    if (!loadedLanguages.has(languageId)) {
      await highlighter.loadLanguage(...(await shikiLanguageRegistry[languageId]()));
      loadedLanguages.add(languageId);
    }

    const themedLines = highlighter.codeToTokensBase(code, {
      lang: languageId,
      theme: themeName,
    });

    return themedLines.map((line) => line.map((token) => ({
      type: 'plain',
      text: token.content,
      color: token.color ?? null,
      fontStyle: token.fontStyle ?? null,
    } satisfies Token)));
  });
}

self.onmessage = (event: MessageEvent<SyntaxHighlightWorkerRequest>) => {
  const request = event.data;

  void Promise.all([
    toLineTokens(request.baseText, request.languageId, request.themeName),
    toLineTokens(request.mineText, request.languageId, request.themeName),
  ]).then(([baseLineTokens, mineLineTokens]) => {
    const response: SyntaxHighlightWorkerResponse = {
      ok: true,
      requestId: request.requestId,
      presentation: {
        languageId: request.languageId,
        source: 'shiki',
        baseLineTokens,
        mineLineTokens,
      },
    };
    self.postMessage(response);
  }).catch((error: unknown) => {
    const response: SyntaxHighlightWorkerResponse = {
      ok: false,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  });
};

export {};
