import type { DiffLine, SyntaxPresentation, Token } from '@/types';
import type { ThemeKey } from '@/theme';

export const MAX_SYNTAX_HIGHLIGHT_TOTAL_CHARS = 300_000;
export const MAX_SYNTAX_HIGHLIGHT_LINES = 8_000;
export const MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH = 2_000;

export function resolveShikiTheme(themeKey: ThemeKey): string {
  switch (themeKey) {
    case 'light':
      return 'github-light';
    case 'hc':
      return 'github-dark-high-contrast';
    case 'dark':
    default:
      return 'github-dark';
  }
}

function getLineCount(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

function getLongestLineLength(text: string): number {
  if (!text) return 0;
  return text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
}

export function shouldUseAsyncSyntaxHighlighting(
  baseText: string,
  mineText: string,
  languageId: string | null,
): boolean {
  if (!languageId) return false;

  const totalChars = baseText.length + mineText.length;
  if (totalChars > MAX_SYNTAX_HIGHLIGHT_TOTAL_CHARS) return false;

  const totalLines = getLineCount(baseText) + getLineCount(mineText);
  if (totalLines > MAX_SYNTAX_HIGHLIGHT_LINES) return false;

  const longestLineLength = Math.max(
    getLongestLineLength(baseText),
    getLongestLineLength(mineText),
  );
  if (longestLineLength > MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH) return false;

  return true;
}

function getLineTokens(
  lineTokens: Token[][],
  lineNumber: number | null,
): Token[] | undefined {
  if (lineNumber == null || lineNumber <= 0) return undefined;
  return lineTokens[lineNumber - 1];
}

export function getUnifiedLineSyntaxTokens(
  presentation: SyntaxPresentation | null,
  line: DiffLine,
): Token[] | undefined {
  if (!presentation) return undefined;
  if (line.type === 'add') {
    return getLineTokens(presentation.mineLineTokens, line.mineLineNo);
  }
  return getLineTokens(presentation.baseLineTokens, line.baseLineNo ?? line.mineLineNo);
}

export function getSplitLineSyntaxTokens(
  presentation: SyntaxPresentation | null,
  line: DiffLine | null,
  side: 'left' | 'right',
): Token[] | undefined {
  if (!presentation || !line) return undefined;
  return side === 'left'
    ? getLineTokens(presentation.baseLineTokens, line.baseLineNo)
    : getLineTokens(presentation.mineLineTokens, line.mineLineNo);
}

