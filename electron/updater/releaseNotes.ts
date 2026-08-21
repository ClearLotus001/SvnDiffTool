const HTML_LINE_BREAK_PATTERN = /<\s*br\s*\/?\s*>/gi;
const HTML_LIST_ITEM_PATTERN = /<\s*li\b[^>]*>/gi;
const HTML_BLOCK_END_PATTERN = /<\s*\/\s*(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)\s*>/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeNumericHtmlEntity(match: string, value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return match;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, codePoint: string) => decodeNumericHtmlEntity(match, codePoint, 16))
    .replace(/&#([0-9]+);/g, (match, codePoint: string) => decodeNumericHtmlEntity(match, codePoint, 10))
    .replace(/&(amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => (
      NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match
    ));
}

function normalizeReleaseNoteText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/\r\n?/g, '\n')
      .replace(HTML_LINE_BREAK_PATTERN, '\n')
      .replace(HTML_LIST_ITEM_PATTERN, '- ')
      .replace(HTML_BLOCK_END_PATTERN, '\n')
      .replace(HTML_TAG_PATTERN, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = normalizeReleaseNoteText(value);
    return normalized || null;
  }
  if (!Array.isArray(value)) return null;

  const notes = value
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const note = (item as { note?: unknown }).note;
      return typeof note === 'string' ? normalizeReleaseNoteText(note) : '';
    })
    .filter(Boolean);

  return notes.length > 0 ? notes.join('\n\n') : null;
}
