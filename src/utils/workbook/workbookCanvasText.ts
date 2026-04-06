export function normalizeWorkbookCanvasText(value: string): string {
  return value
    .replace(/\u001F/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

const WORKBOOK_CANVAS_CELL_TEXT_PADDING_X = 6;
const WORKBOOK_CANVAS_CELL_TEXT_PADDING_Y = 2;

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

const workbookCanvasFontMetricCache = new Map<string, { ascent: number; descent: number }>();
const WORKBOOK_CANVAS_TEXT_SAMPLE = 'Hg国';

function getWorkbookCanvasFontMetrics(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  fallbackFontSize: number,
): { ascent: number; descent: number } {
  const cacheKey = ctx.font || `${fallbackFontSize}px system-ui`;
  const cached = workbookCanvasFontMetricCache.get(cacheKey);
  if (cached) return cached;

  const metrics = ctx.measureText(WORKBOOK_CANVAS_TEXT_SAMPLE);
  const ascent = metrics.actualBoundingBoxAscent > 0
    ? metrics.actualBoundingBoxAscent
    : Math.max(1, fallbackFontSize * 0.78);
  const descent = metrics.actualBoundingBoxDescent > 0
    ? metrics.actualBoundingBoxDescent
    : Math.max(1, fallbackFontSize * 0.22);
  const resolved = { ascent, descent };
  workbookCanvasFontMetricCache.set(cacheKey, resolved);
  return resolved;
}

export function getWorkbookCanvasTextBaselineY(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  centerY: number,
  fallbackFontSize: number,
): number {
  const { ascent, descent } = getWorkbookCanvasFontMetrics(ctx, fallbackFontSize);
  return centerY + ((ascent - descent) / 2);
}

export function getWorkbookCanvasTextInsetRect(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: left + WORKBOOK_CANVAS_CELL_TEXT_PADDING_X,
    top: top + WORKBOOK_CANVAS_CELL_TEXT_PADDING_Y,
    width: Math.max(0, width - (WORKBOOK_CANVAS_CELL_TEXT_PADDING_X * 2)),
    height: Math.max(0, height - (WORKBOOK_CANVAS_CELL_TEXT_PADDING_Y * 2)),
  };
}
