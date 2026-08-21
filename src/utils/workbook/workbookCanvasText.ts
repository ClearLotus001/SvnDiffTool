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
  segmentLimit = Number.POSITIVE_INFINITY,
): string[] {
  if (!line) return [''];
  if (maxWidth <= 0 || measureText(line) <= maxWidth) return [line];

  const chars = Array.from(line);
  const wrapped: string[] = [];
  let start = 0;
  const safeSegmentLimit = Math.max(1, segmentLimit);
  while (start < chars.length && wrapped.length < safeSegmentLimit) {
    let low = 1;
    let high = chars.length - start;
    let best = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = chars.slice(start, start + middle).join('');
      if (measureText(candidate) <= maxWidth) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    wrapped.push(chars.slice(start, start + best).join(''));
    start += best;
  }
  return wrapped.length > 0 ? wrapped : [line];
}

function wrapWorkbookCanvasTextLines(
  logicalLines: string[],
  maxWidth: number,
  maxSegments: number,
  measureText: (value: string) => number,
): string[] {
  const wrapped: string[] = [];
  const safeMaxSegments = Math.max(1, maxSegments);
  for (const line of logicalLines) {
    const remainingSegments = safeMaxSegments - wrapped.length;
    if (remainingSegments <= 0) break;
    wrapped.push(...wrapWorkbookCanvasLine(line, maxWidth, measureText, remainingSegments));
  }
  return wrapped;
}

function ellipsizeWorkbookCanvasLine(
  line: string,
  maxWidth: number,
  measureText: (value: string) => number,
): string {
  if (maxWidth <= 0) return '…';
  if (measureText(`${line}…`) <= maxWidth) return `${line}…`;

  const chars = Array.from(line);
  let low = 0;
  let high = chars.length;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${chars.slice(0, middle).join('')}…`;
    if (measureText(candidate) <= maxWidth) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best > 0 ? `${chars.slice(0, best).join('')}…` : '…';
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

  const safeMaxLines = Math.max(1, maxLines);
  const wrapped = wrapWorkbookCanvasTextLines(
    logicalLines,
    maxWidth,
    safeMaxLines + 1,
    measureText,
  );
  if (wrapped.length <= maxLines) return wrapped;

  const clipped = wrapped.slice(0, safeMaxLines);
  const lastLine = clipped[clipped.length - 1] ?? '';
  clipped[clipped.length - 1] = measureText(`${lastLine}…`) <= maxWidth
    ? `${lastLine}…`
    : ellipsizeWorkbookCanvasLine(lastLine, maxWidth, measureText);
  return clipped;
}

export function isWorkbookCanvasTextTruncated(params: {
  value: string;
  maxWidth: number;
  maxLines?: number;
  wrapText?: boolean;
  measureText: (value: string) => number;
}): boolean {
  const {
    value,
    maxWidth,
    maxLines = 1,
    wrapText = false,
    measureText,
  } = params;
  const normalized = normalizeWorkbookCanvasText(value).trim();
  if (!normalized) return false;
  if (maxWidth <= 0) return true;

  if (!wrapText) {
    return measureText(normalized.replace(/\n/g, ' / ')) > maxWidth;
  }

  const logicalLines = splitWorkbookCanvasTextLines(normalized);
  const safeMaxLines = Math.max(1, maxLines);
  const wrapped = wrapWorkbookCanvasTextLines(
    logicalLines,
    maxWidth,
    safeMaxLines + 1,
    measureText,
  );
  return wrapped.length > safeMaxLines;
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
