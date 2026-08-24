import type { DiffLine } from '@/types';
import type { CopyVersionSide } from '@/utils/diff/textCopy';

const COPY_NEWLINE = '\r\n';
const LARGE_COLUMN = Number.MAX_SAFE_INTEGER;

export type LogicalTextSelectionMode = 'display' | 'base' | 'mine' | 'auto';
export type LogicalTextSelectionSide = CopyVersionSide | 'both';

export interface LogicalTextSelectionPoint {
  lineIdx: number;
  side: LogicalTextSelectionSide;
  column: number;
}

export interface LogicalTextSelection {
  anchor: LogicalTextSelectionPoint;
  focus: LogicalTextSelectionPoint;
}

export interface LogicalTextSelectionRange {
  start: number;
  end: number;
}

export interface LogicalTextSelectionLineRange {
  startLineIdx: number;
  endLineIdx: number;
  count: number;
}

export type LogicalTextSelectionDirection = 'left' | 'right' | 'up' | 'down';

function isWordCharacter(char: string) {
  return /[\p{L}\p{N}_$]/u.test(char);
}

function resolveSideRank(side: LogicalTextSelectionSide) {
  if (side === 'mine') return 1;
  return 0;
}

function clampColumn(column: number, textLength: number) {
  if (!Number.isFinite(column)) return textLength;
  return Math.max(0, Math.min(textLength, column));
}

function resolveDisplayLineContent(line: DiffLine) {
  if (line.type === 'add') return line.mine ?? '';
  if (line.type === 'delete') return line.base ?? '';
  return line.base ?? line.mine ?? '';
}

export function resolveLogicalTextLineContentForSide(
  line: DiffLine,
  side: LogicalTextSelectionSide,
): string | null {
  if (side === 'both') return resolveDisplayLineContent(line);
  return side === 'base' ? line.base : line.mine;
}

function resolveLineContentForMode(
  line: DiffLine,
  mode: Exclude<LogicalTextSelectionMode, 'auto'>,
): string | null {
  if (mode === 'display') return resolveLogicalTextLineContentForSide(line, 'both');
  return resolveLogicalTextLineContentForSide(line, mode);
}

function resolveSelectionSideForMode(
  mode: LogicalTextSelectionMode,
): LogicalTextSelectionSide {
  if (mode === 'base' || mode === 'mine') return mode;
  return 'both';
}

function compareLogicalTextSelectionPoints(
  left: LogicalTextSelectionPoint,
  right: LogicalTextSelectionPoint,
) {
  if (left.lineIdx !== right.lineIdx) return left.lineIdx - right.lineIdx;

  const sideDelta = resolveSideRank(left.side) - resolveSideRank(right.side);
  if (sideDelta !== 0) return sideDelta;

  return left.column - right.column;
}

function normalizeLogicalTextSelection(selection: LogicalTextSelection) {
  return compareLogicalTextSelectionPoints(selection.anchor, selection.focus) <= 0
    ? selection
    : {
      anchor: selection.focus,
      focus: selection.anchor,
    };
}

export function isLogicalTextSelectionCollapsed(selection: LogicalTextSelection | null | undefined) {
  if (!selection) return true;
  return compareLogicalTextSelectionPoints(selection.anchor, selection.focus) === 0;
}

export function getLogicalTextSelectionLineRange(
  selection: LogicalTextSelection | null | undefined,
): LogicalTextSelectionLineRange | null {
  if (!selection || isLogicalTextSelectionCollapsed(selection)) return null;
  const startLineIdx = Math.min(selection.anchor.lineIdx, selection.focus.lineIdx);
  const endLineIdx = Math.max(selection.anchor.lineIdx, selection.focus.lineIdx);
  return {
    startLineIdx,
    endLineIdx,
    count: endLineIdx - startLineIdx + 1,
  };
}

export function isLogicalTextPointWithinSelection(
  selection: LogicalTextSelection | null | undefined,
  point: LogicalTextSelectionPoint,
) {
  if (!selection || isLogicalTextSelectionCollapsed(selection)) return false;
  const normalized = normalizeLogicalTextSelection(selection);
  return compareLogicalTextSelectionPoints(normalized.anchor, point) <= 0
    && compareLogicalTextSelectionPoints(point, normalized.focus) <= 0;
}

export function doesLogicalTextSelectionIntersectLineRange(
  selection: LogicalTextSelection | null | undefined,
  startLineIdx: number | null | undefined,
  endLineIdx: number | null | undefined,
) {
  if (!selection || startLineIdx == null || endLineIdx == null || isLogicalTextSelectionCollapsed(selection)) {
    return false;
  }
  const normalized = normalizeLogicalTextSelection(selection);
  return startLineIdx <= normalized.focus.lineIdx && endLineIdx >= normalized.anchor.lineIdx;
}

function shouldRestrictSelectionToSingleSide(selection: LogicalTextSelection) {
  return selection.anchor.side === selection.focus.side && selection.anchor.side !== 'both';
}

export function getLogicalTextSelectionRangeForLine(
  selection: LogicalTextSelection | null | undefined,
  lineIdx: number,
  side: LogicalTextSelectionSide,
  textLength: number,
): LogicalTextSelectionRange | null {
  if (!selection || textLength <= 0 || isLogicalTextSelectionCollapsed(selection)) return null;

  const normalized = normalizeLogicalTextSelection(selection);
  if (shouldRestrictSelectionToSingleSide(normalized) && side !== normalized.anchor.side) {
    return null;
  }

  const lineStart: LogicalTextSelectionPoint = { lineIdx, side, column: 0 };
  const lineEnd: LogicalTextSelectionPoint = { lineIdx, side, column: LARGE_COLUMN };
  if (compareLogicalTextSelectionPoints(normalized.focus, lineStart) <= 0) return null;
  if (compareLogicalTextSelectionPoints(normalized.anchor, lineEnd) >= 0) return null;

  const isAnchorLine = normalized.anchor.lineIdx === lineIdx && normalized.anchor.side === side;
  const isFocusLine = normalized.focus.lineIdx === lineIdx && normalized.focus.side === side;

  let start = 0;
  let end = textLength;

  if (isAnchorLine) {
    start = clampColumn(normalized.anchor.column, textLength);
  }
  if (isFocusLine) {
    end = clampColumn(normalized.focus.column, textLength);
  }

  if (compareLogicalTextSelectionPoints(normalized.anchor, lineStart) > 0 && !isAnchorLine) {
    start = textLength;
  }
  if (compareLogicalTextSelectionPoints(normalized.focus, lineEnd) < 0 && !isFocusLine) {
    end = 0;
  }

  if (compareLogicalTextSelectionPoints(lineStart, normalized.anchor) >= 0) {
    start = 0;
  }
  if (compareLogicalTextSelectionPoints(lineEnd, normalized.focus) <= 0) {
    end = textLength;
  }

  if (end <= start) return null;
  return { start, end };
}

function resolveLogicalTextSelectionCopyMode(
  selection: LogicalTextSelection,
  requestedMode: LogicalTextSelectionMode,
): Exclude<LogicalTextSelectionMode, 'auto'> {
  if (requestedMode !== 'auto') return requestedMode;
  return selection.anchor.side === selection.focus.side && (selection.anchor.side === 'base' || selection.anchor.side === 'mine')
    ? selection.anchor.side
    : 'display';
}

function collapseSelectionSideForDisplay(selection: LogicalTextSelection): LogicalTextSelection {
  return {
    anchor: {
      ...selection.anchor,
      side: 'both',
    },
    focus: {
      ...selection.focus,
      side: 'both',
    },
  };
}

export function buildLogicalTextSelectionCopyText(
  diffLines: readonly DiffLine[],
  selection: LogicalTextSelection | null | undefined,
  requestedMode: LogicalTextSelectionMode,
) {
  if (!selection || diffLines.length === 0 || isLogicalTextSelectionCollapsed(selection)) return '';

  const normalized = normalizeLogicalTextSelection(selection);
  const mode = resolveLogicalTextSelectionCopyMode(normalized, requestedMode);
  const normalizedSelection = mode === 'display'
    ? collapseSelectionSideForDisplay(normalized)
    : normalized;
  const startLineIdx = Math.max(0, Math.min(normalized.anchor.lineIdx, diffLines.length - 1));
  const endLineIdx = Math.max(0, Math.min(normalized.focus.lineIdx, diffLines.length - 1));
  const lines: string[] = [];

  for (let lineIdx = startLineIdx; lineIdx <= endLineIdx; lineIdx += 1) {
    const line = diffLines[lineIdx];
    if (!line) continue;
    const content = resolveLineContentForMode(line, mode);
    if (content == null) continue;

    const selectionSide: LogicalTextSelectionSide = mode === 'display' ? 'both' : mode;
    const range = getLogicalTextSelectionRangeForLine(normalizedSelection, lineIdx, selectionSide, content.length);
    if (!range) continue;
    lines.push(content.slice(range.start, range.end));
  }

  return lines.join(COPY_NEWLINE);
}

export function buildSelectAllLogicalTextSelection(
  diffLines: readonly DiffLine[],
  requestedMode: LogicalTextSelectionMode,
): LogicalTextSelection | null {
  if (diffLines.length === 0) return null;

  const mode: Exclude<LogicalTextSelectionMode, 'auto'> = requestedMode === 'auto'
    ? 'display'
    : requestedMode;
  const side = resolveSelectionSideForMode(mode);

  let firstLineIdx = -1;
  let lastLineIdx = -1;
  let lastContentLength = 0;

  for (let lineIdx = 0; lineIdx < diffLines.length; lineIdx += 1) {
    const line = diffLines[lineIdx];
    if (!line) continue;
    const content = resolveLineContentForMode(line, mode);
    if (content == null) continue;
    if (firstLineIdx < 0) {
      firstLineIdx = lineIdx;
    }
    lastLineIdx = lineIdx;
    lastContentLength = content.length;
  }

  if (firstLineIdx < 0 || lastLineIdx < 0) return null;

  return {
    anchor: {
      lineIdx: firstLineIdx,
      side,
      column: 0,
    },
    focus: {
      lineIdx: lastLineIdx,
      side,
      column: lastContentLength,
    },
  };
}

export function moveLogicalTextSelectionPoint(
  diffLines: readonly DiffLine[],
  point: LogicalTextSelectionPoint,
  direction: LogicalTextSelectionDirection,
): LogicalTextSelectionPoint | null {
  if (diffLines.length === 0) return null;

  const resolveContentLength = (lineIdx: number) => {
    const line = diffLines[lineIdx];
    if (!line) return null;
    const content = resolveLogicalTextLineContentForSide(line, point.side);
    return content == null ? null : content.length;
  };

  const currentLength = resolveContentLength(point.lineIdx);
  if (currentLength == null) return null;
  const currentColumn = Number.isFinite(point.column)
    ? Math.max(0, Math.min(point.column, currentLength))
    : currentLength;

  if (direction === 'left') {
    if (currentColumn > 0) {
      return { ...point, column: currentColumn - 1 };
    }
    for (let lineIdx = point.lineIdx - 1; lineIdx >= 0; lineIdx -= 1) {
      const length = resolveContentLength(lineIdx);
      if (length == null) continue;
      return { ...point, lineIdx, column: length };
    }
    return { ...point, column: 0 };
  }

  if (direction === 'right') {
    if (currentColumn < currentLength) {
      return { ...point, column: currentColumn + 1 };
    }
    for (let lineIdx = point.lineIdx + 1; lineIdx < diffLines.length; lineIdx += 1) {
      const length = resolveContentLength(lineIdx);
      if (length == null) continue;
      return { ...point, lineIdx, column: 0 };
    }
    return { ...point, column: currentLength };
  }

  if (direction === 'up') {
    for (let lineIdx = point.lineIdx - 1; lineIdx >= 0; lineIdx -= 1) {
      const length = resolveContentLength(lineIdx);
      if (length == null) continue;
      return {
        ...point,
        lineIdx,
        column: Number.isFinite(point.column) ? Math.min(point.column, length) : LARGE_COLUMN,
      };
    }
    return { ...point, column: currentColumn };
  }

  for (let lineIdx = point.lineIdx + 1; lineIdx < diffLines.length; lineIdx += 1) {
    const length = resolveContentLength(lineIdx);
    if (length == null) continue;
    return {
      ...point,
      lineIdx,
      column: Number.isFinite(point.column) ? Math.min(point.column, length) : LARGE_COLUMN,
    };
  }
  return { ...point, column: currentColumn };
}

export function expandLogicalTextSelectionToWord(
  text: string,
  column: number,
): LogicalTextSelectionRange {
  const clampedColumn = Math.max(0, Math.min(text.length, column));
  if (text.length === 0) return { start: 0, end: 0 };

  const pivot = Math.min(Math.max(clampedColumn, 0), Math.max(0, text.length - 1));
  const pivotChar = text.charAt(pivot);
  if (!pivotChar) return { start: clampedColumn, end: clampedColumn };

  const isWord = isWordCharacter(pivotChar);
  const isWhitespace = /\s/u.test(pivotChar);
  const matchesCategory = (char: string) => (
    isWhitespace ? /\s/u.test(char) : isWord ? isWordCharacter(char) : (!/\s/u.test(char) && !isWordCharacter(char))
  );

  let start = pivot;
  while (start > 0 && matchesCategory(text.charAt(start - 1))) {
    start -= 1;
  }

  let end = pivot + 1;
  while (end < text.length && matchesCategory(text.charAt(end))) {
    end += 1;
  }

  return { start, end };
}
