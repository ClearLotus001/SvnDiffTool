import type {
  DiffLine,
  WorkbookSelectedCell,
} from '@/types';
import type { WorkbookLineSheetContext } from '@/utils/workbook/workbookSections';

interface WorkbookGotoRowCandidate {
  lineIdx: number;
  rowNumber: number;
  side: 'base' | 'mine';
  sheetName: string;
}

export interface ResolveWorkbookGotoTargetParams {
  lineNo: number;
  diffLines: readonly DiffLine[];
  lineSheetContexts: readonly WorkbookLineSheetContext[];
  sheetName: string | null;
  preferredSide?: 'base' | 'mine' | null | undefined;
  preferredColumn?: number | undefined;
  preferredColumnLabel?: string | undefined;
  baseVersionLabel: string;
  mineVersionLabel: string;
  allowedLineIndexes?: ReadonlySet<number> | undefined;
}

export interface ResolvedWorkbookGotoTarget {
  lineIdx: number;
  selection: WorkbookSelectedCell;
}

function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function getSidePriority(
  side: 'base' | 'mine',
  preferredSide: 'base' | 'mine' | null | undefined,
): number {
  if (preferredSide && side === preferredSide) return 0;
  return side === 'mine' ? 1 : 2;
}

function compareExactCandidates(
  left: WorkbookGotoRowCandidate,
  right: WorkbookGotoRowCandidate,
  preferredSide: 'base' | 'mine' | null | undefined,
): number {
  return getSidePriority(left.side, preferredSide)
    - getSidePriority(right.side, preferredSide)
    || left.lineIdx - right.lineIdx;
}

function compareNearestCandidates(
  left: WorkbookGotoRowCandidate,
  right: WorkbookGotoRowCandidate,
  preferredSide: 'base' | 'mine' | null | undefined,
): number {
  return left.rowNumber - right.rowNumber
    || compareExactCandidates(left, right, preferredSide);
}

function compareLastCandidates(
  left: WorkbookGotoRowCandidate,
  right: WorkbookGotoRowCandidate,
  preferredSide: 'base' | 'mine' | null | undefined,
): number {
  return right.rowNumber - left.rowNumber
    || compareExactCandidates(left, right, preferredSide);
}

export function collectWorkbookGotoRowCandidates(
  diffLines: readonly DiffLine[],
  lineSheetContexts: readonly WorkbookLineSheetContext[],
  sheetName: string | null,
  allowedLineIndexes?: ReadonlySet<number>,
): WorkbookGotoRowCandidate[] {
  if (!sheetName) return [];

  const candidates: WorkbookGotoRowCandidate[] = [];
  diffLines.forEach((line, lineIdx) => {
    if (allowedLineIndexes && !allowedLineIndexes.has(lineIdx)) return;
    const context = lineSheetContexts[lineIdx] ?? null;
    if (!context) return;

    if (line.baseLineNo != null && context.baseSheetName === sheetName) {
      candidates.push({
        lineIdx,
        rowNumber: line.baseLineNo,
        side: 'base',
        sheetName,
      });
    }

    if (line.mineLineNo != null && context.mineSheetName === sheetName) {
      candidates.push({
        lineIdx,
        rowNumber: line.mineLineNo,
        side: 'mine',
        sheetName,
      });
    }
  });

  return candidates;
}

function resolveWorkbookGotoCandidate(
  candidates: readonly WorkbookGotoRowCandidate[],
  lineNo: number,
  preferredSide: 'base' | 'mine' | null | undefined,
): WorkbookGotoRowCandidate | null {
  if (candidates.length === 0) return null;

  const exact = candidates
    .filter((candidate) => candidate.rowNumber === lineNo)
    .sort((left, right) => compareExactCandidates(left, right, preferredSide))[0];
  if (exact) return exact;

  const nearest = candidates
    .filter((candidate) => candidate.rowNumber >= lineNo)
    .sort((left, right) => compareNearestCandidates(left, right, preferredSide))[0];
  if (nearest) return nearest;

  return [...candidates]
    .sort((left, right) => compareLastCandidates(left, right, preferredSide))[0] ?? null;
}

export function getWorkbookSheetMaxRowNumber(
  diffLines: readonly DiffLine[],
  lineSheetContexts: readonly WorkbookLineSheetContext[],
  sheetName: string | null,
  allowedLineIndexes?: ReadonlySet<number>,
): number {
  const candidates = collectWorkbookGotoRowCandidates(diffLines, lineSheetContexts, sheetName, allowedLineIndexes);
  return candidates.reduce((max, candidate) => Math.max(max, candidate.rowNumber), 0);
}

export function resolveWorkbookGotoTarget({
  lineNo,
  diffLines,
  lineSheetContexts,
  sheetName,
  preferredSide = null,
  preferredColumn = 0,
  preferredColumnLabel,
  baseVersionLabel,
  mineVersionLabel,
  allowedLineIndexes,
}: ResolveWorkbookGotoTargetParams): ResolvedWorkbookGotoTarget | null {
  const candidates = collectWorkbookGotoRowCandidates(diffLines, lineSheetContexts, sheetName, allowedLineIndexes);
  const candidate = resolveWorkbookGotoCandidate(candidates, lineNo, preferredSide);
  if (!candidate) return null;

  const colIndex = Math.max(0, preferredColumn);
  const colLabel = preferredColumnLabel || getWorkbookColumnLabel(colIndex);

  return {
    lineIdx: candidate.lineIdx,
    selection: {
      kind: 'row',
      sheetName: candidate.sheetName,
      side: candidate.side,
      versionLabel: candidate.side === 'base' ? baseVersionLabel : mineVersionLabel,
      rowNumber: candidate.rowNumber,
      colIndex,
      colLabel,
      address: String(candidate.rowNumber),
      value: '',
      formula: '',
    },
  };
}
