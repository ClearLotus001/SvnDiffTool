export function normalizeWorkbookCanvasText(value: string): string {
  return value
    .replace(/\u001F/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function splitWorkbookCanvasTextLines(value: string): string[] {
  const normalized = normalizeWorkbookCanvasText(value).replace(/\s\/\s/g, '\n').trim();
  if (!normalized) return [];
  return normalized.split('\n').map(line => line.trim()).filter(Boolean);
}

function wrapWorkbookCanvasLine(
  line: string,
  maxWidth: number,
  measureText: (value: string) => number,
): string[] {
  if (!line) return [''];
  if (maxWidth <= 0 || measureText(line) <= maxWidth) return [line];

  const wrapped: string[] = [];
  let current = '';

  Array.from(line).forEach((char) => {
    const candidate = `${current}${char}`;
    if (current && measureText(candidate) > maxWidth) {
      wrapped.push(current);
      current = char;
      return;
    }
    current = candidate;
  });

  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [line];
}

function ellipsizeWorkbookCanvasLine(
  line: string,
  maxWidth: number,
  measureText: (value: string) => number,
): string {
  if (maxWidth <= 0) return '…';
  if (measureText(line) <= maxWidth) return line;

  let current = line;
  while (current.length > 0 && measureText(`${current}…`) > maxWidth) {
    current = current.slice(0, -1);
  }

  return current ? `${current}…` : '…';
}

export function layoutWorkbookCanvasTextLines(params: {
  value: string;
  maxWidth: number;
  maxLines: number;
  measureText: (value: string) => number;
}): string[] {
  const { value, maxWidth, maxLines, measureText } = params;
  const logicalLines = splitWorkbookCanvasTextLines(value);
  if (logicalLines.length === 0) return [];

  const wrapped = logicalLines.flatMap(line => wrapWorkbookCanvasLine(line, maxWidth, measureText));
  if (wrapped.length <= maxLines) return wrapped;

  const clipped = wrapped.slice(0, Math.max(1, maxLines));
  const lastLine = clipped[clipped.length - 1] ?? '';
  clipped[clipped.length - 1] = measureText(`${lastLine}…`) <= maxWidth
    ? `${lastLine}…`
    : ellipsizeWorkbookCanvasLine(lastLine, maxWidth, measureText);
  return clipped;
}
