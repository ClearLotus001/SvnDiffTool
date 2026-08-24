import type { SharedCharSpan } from '../../../shared/textMyers';
import { computeCharDiff } from '../../../shared/textMyers';
import type { ThemeTokens } from '@/theme/tokens';
import type { WorkbookCellDelta } from '@/types';
import { normalizeWorkbookCanvasText } from '@/utils/workbook/workbookCanvasText';

export interface WorkbookCanvasCellTextDiff {
  baseText: string;
  mineText: string;
  baseSpans: SharedCharSpan[];
  mineSpans: SharedCharSpan[];
}

export interface WorkbookCanvasTextDrawSegment extends SharedCharSpan {
  x: number;
  width: number;
}

export interface WorkbookCanvasTextDiffHighlightVisual {
  background: string;
  edge: string;
}

const workbookCanvasCellTextDiffCache = new WeakMap<WorkbookCellDelta, {
  baseText: string;
  mineText: string;
  diff: WorkbookCanvasCellTextDiff | null;
}>();

export function formatWorkbookCanvasCellText(value: string): string {
  return normalizeWorkbookCanvasText(value || '\u00A0').replace(/\n/g, ' / ');
}

function buildStrictWhitespaceFallback(
  baseText: string,
  mineText: string,
  baseValue: string,
  mineValue: string,
): Pick<WorkbookCanvasCellTextDiff, 'baseSpans' | 'mineSpans'> {
  return {
    baseSpans: [{ highlight: baseValue !== '', text: baseText }],
    mineSpans: [{ highlight: mineValue !== '', text: mineText }],
  };
}

export function getWorkbookCanvasCellTextDiff(
  compareCell: WorkbookCellDelta | undefined,
): WorkbookCanvasCellTextDiff | null {
  if (!compareCell?.changed) return null;
  if (!compareCell.strictOnly && (compareCell.kind === 'add' || compareCell.kind === 'delete')) {
    return null;
  }

  const baseText = formatWorkbookCanvasCellText(compareCell.baseCell.value);
  const mineText = formatWorkbookCanvasCellText(compareCell.mineCell.value);
  if (baseText === mineText) return null;

  const cached = workbookCanvasCellTextDiffCache.get(compareCell);
  if (cached?.baseText === baseText && cached.mineText === mineText) return cached.diff;

  const computed = computeCharDiff(baseText, mineText)
    ?? (compareCell.strictOnly
      ? buildStrictWhitespaceFallback(
          baseText,
          mineText,
          compareCell.baseCell.value,
          compareCell.mineCell.value,
        )
      : null);
  const diff = computed
    ? { baseText, mineText, baseSpans: computed.baseSpans, mineSpans: computed.mineSpans }
    : null;
  workbookCanvasCellTextDiffCache.set(compareCell, { baseText, mineText, diff });
  return diff;
}

export function getWorkbookCanvasCellTextDiffSpans(
  compareCell: WorkbookCellDelta | undefined,
  side: 'base' | 'mine',
): SharedCharSpan[] | null {
  const diff = getWorkbookCanvasCellTextDiff(compareCell);
  if (!diff) return null;
  return side === 'base' ? diff.baseSpans : diff.mineSpans;
}

export function resolveWorkbookCanvasTextDiffHighlight(
  theme: ThemeTokens,
  compareCell: WorkbookCellDelta | undefined,
): WorkbookCanvasTextDiffHighlightVisual {
  return compareCell?.strictOnly
    ? {
        background: `${theme.searchHl}52`,
        edge: `${theme.searchHl}cc`,
      }
    : {
        background: `${theme.chgTx}40`,
        edge: `${theme.chgBrd}cc`,
      };
}

export function layoutWorkbookCanvasTextDrawSegments(params: {
  text: string;
  x: number;
  charSpans?: SharedCharSpan[] | null;
  measureText: (value: string) => number;
}): WorkbookCanvasTextDrawSegment[] {
  const { text, x, charSpans, measureText } = params;
  const resolvedSpans = charSpans?.map((span) => span.text).join('') === text
    ? charSpans
    : [{ highlight: false, text }];
  let cursorX = x;
  return resolvedSpans.map((span) => {
    const width = measureText(span.text);
    const segment = { ...span, x: cursorX, width };
    cursorX += width;
    return segment;
  });
}

export function drawWorkbookCanvasCellText(params: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  baselineY: number;
  fallbackFontSize: number;
  textColor: string;
  highlightVisual: WorkbookCanvasTextDiffHighlightVisual;
  charSpans?: SharedCharSpan[] | null;
}) {
  const {
    ctx,
    text,
    x,
    baselineY,
    fallbackFontSize,
    textColor,
    highlightVisual,
    charSpans,
  } = params;
  const segments = layoutWorkbookCanvasTextDrawSegments({
    text,
    x,
    charSpans: charSpans ?? null,
    measureText: (value) => ctx.measureText(value).width,
  });
  const fontMetrics = ctx.measureText('Hg');
  const ascent = fontMetrics.actualBoundingBoxAscent > 0
    ? fontMetrics.actualBoundingBoxAscent
    : Math.max(1, fallbackFontSize * 0.78);
  const descent = fontMetrics.actualBoundingBoxDescent > 0
    ? fontMetrics.actualBoundingBoxDescent
    : Math.max(1, fallbackFontSize * 0.22);
  const highlightTop = baselineY - ascent - 1;
  const highlightHeight = ascent + descent + 2;

  segments.forEach((segment) => {
    if (segment.highlight && segment.width > 0) {
      const highlightLeft = segment.x - 1;
      const highlightWidth = segment.width + 2;
      ctx.fillStyle = highlightVisual.background;
      ctx.beginPath();
      ctx.roundRect(
        highlightLeft,
        highlightTop,
        highlightWidth,
        highlightHeight,
        2,
      );
      ctx.fill();
      ctx.fillStyle = highlightVisual.edge;
      ctx.fillRect(
        highlightLeft,
        highlightTop + highlightHeight - 2,
        highlightWidth,
        2,
      );
    }
    if (segment.text) {
      ctx.fillStyle = textColor;
      ctx.fillText(segment.text, segment.x, baselineY);
    }
  });
}

export function drawWorkbookCanvasComparedCellText(params: {
  ctx: CanvasRenderingContext2D;
  value: string;
  compareCell: WorkbookCellDelta | undefined;
  side: 'base' | 'mine';
  theme: ThemeTokens;
  x: number;
  baselineY: number;
  fallbackFontSize: number;
  textColor: string;
}) {
  const {
    ctx,
    value,
    compareCell,
    side,
    theme,
    x,
    baselineY,
    fallbackFontSize,
    textColor,
  } = params;
  drawWorkbookCanvasCellText({
    ctx,
    text: formatWorkbookCanvasCellText(value),
    x,
    baselineY,
    fallbackFontSize,
    textColor,
    highlightVisual: resolveWorkbookCanvasTextDiffHighlight(theme, compareCell),
    charSpans: getWorkbookCanvasCellTextDiffSpans(compareCell, side),
  });
}
