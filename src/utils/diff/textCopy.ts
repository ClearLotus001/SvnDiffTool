import type { DiffLine, Hunk } from '@/types';

const COPY_NEWLINE = '\r\n';
export type CopyVersionSide = 'base' | 'mine';

function resolveDiffLinePrefix(line: DiffLine) {
  if (line.type === 'add') return '+';
  if (line.type === 'delete') return '-';
  return ' ';
}

function resolveDiffLineContent(line: DiffLine) {
  if (line.type === 'add') return line.mine ?? '';
  if (line.type === 'delete') return line.base ?? '';
  return line.base ?? line.mine ?? '';
}

function formatDiffLineForCopy(line: DiffLine) {
  return `${resolveDiffLinePrefix(line)}${resolveDiffLineContent(line)}`;
}

export function buildDiffCopyText(diffLines: readonly DiffLine[]) {
  return diffLines.map(formatDiffLineForCopy).join(COPY_NEWLINE);
}

export function buildDisplayCopyText(diffLines: readonly DiffLine[]) {
  return diffLines
    .map((line) => resolveDiffLineContent(line))
    .join(COPY_NEWLINE);
}

export function buildDiffRangeCopyText(
  diffLines: readonly DiffLine[],
  startLineIdx: number,
  endLineIdx: number,
) {
  if (diffLines.length === 0) return '';

  const start = Math.max(0, Math.min(startLineIdx, endLineIdx));
  const end = Math.min(diffLines.length - 1, Math.max(startLineIdx, endLineIdx));
  return buildDiffCopyText(diffLines.slice(start, end + 1));
}

export function buildDisplayRangeCopyText(
  diffLines: readonly DiffLine[],
  startLineIdx: number,
  endLineIdx: number,
) {
  if (diffLines.length === 0) return '';

  const start = Math.max(0, Math.min(startLineIdx, endLineIdx));
  const end = Math.min(diffLines.length - 1, Math.max(startLineIdx, endLineIdx));
  return buildDisplayCopyText(diffLines.slice(start, end + 1));
}

export function buildHunkCopyText(
  diffLines: readonly DiffLine[],
  hunk: Pick<Hunk, 'startIdx' | 'endIdx'> | null | undefined,
) {
  if (!hunk) return '';
  return buildDiffRangeCopyText(diffLines, hunk.startIdx, hunk.endIdx);
}

function resolveVersionLineContent(line: DiffLine, side: CopyVersionSide) {
  return side === 'base' ? line.base : line.mine;
}

export function buildVersionCopyText(
  diffLines: readonly DiffLine[],
  side: CopyVersionSide,
) {
  return diffLines
    .map((line) => resolveVersionLineContent(line, side))
    .filter((content): content is string => content != null)
    .join(COPY_NEWLINE);
}

export function buildVersionRangeCopyText(
  diffLines: readonly DiffLine[],
  side: CopyVersionSide,
  startLineIdx: number,
  endLineIdx: number,
) {
  if (diffLines.length === 0) return '';

  const start = Math.max(0, Math.min(startLineIdx, endLineIdx));
  const end = Math.min(diffLines.length - 1, Math.max(startLineIdx, endLineIdx));
  return buildVersionCopyText(diffLines.slice(start, end + 1), side);
}

export function hasVersionContentInRange(
  diffLines: readonly DiffLine[],
  side: CopyVersionSide,
  startLineIdx: number,
  endLineIdx: number,
) {
  if (diffLines.length === 0) return false;

  const start = Math.max(0, Math.min(startLineIdx, endLineIdx));
  const end = Math.min(diffLines.length - 1, Math.max(startLineIdx, endLineIdx));
  for (let index = start; index <= end; index += 1) {
    if (resolveVersionLineContent(diffLines[index]!, side) != null) {
      return true;
    }
  }
  return false;
}
