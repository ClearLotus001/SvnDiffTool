import type {
  DiffLine,
  SplitRow,
  WorkbookCompareMode,
  WorkbookPrecomputedDeltaPayload,
} from '../types';
import type { WorkbookSection } from './workbookSections';
import { parseWorkbookDisplayLine } from './workbookDisplay';
import {
  buildWorkbookRowSignature,
  alignWorkbookEntries,
  createWorkbookAlignmentEntry,
} from './workbookAlignment';
import { hydrateWorkbookRowDelta } from './workbookDelta';

export interface IndexedWorkbookSectionRows {
  rows: SplitRow[];
}

function buildSplitRow(
  left: DiffLine | null,
  right: DiffLine | null,
  leftLineIdx: number | null,
  rightLineIdx: number | null,
  fallbackLineIdx: number,
): SplitRow {
  const lineIdxs = [leftLineIdx, rightLineIdx].filter((lineIdx): lineIdx is number => lineIdx != null);
  return {
    left,
    right,
    lineIdx: lineIdxs[0] ?? fallbackLineIdx,
    lineIdxs,
  };
}

function makeSideScopedEqualLine(
  line: DiffLine,
  side: 'base' | 'mine',
): DiffLine {
  return side === 'base'
    ? {
        ...line,
        mine: null,
        mineLineNo: null,
        mineCharSpans: null,
      }
    : {
        ...line,
        base: null,
        baseLineNo: null,
        baseCharSpans: null,
      };
}

function alignWorkbookChangeRows(
  baseRows: Array<ReturnType<typeof createWorkbookAlignmentEntry<{ line: DiffLine; lineIdx: number }>>>,
  mineRows: Array<ReturnType<typeof createWorkbookAlignmentEntry<{ line: DiffLine; lineIdx: number }>>>,
  fallbackLineIdx: number,
): SplitRow[] {
  return alignWorkbookEntries(
    baseRows.filter((entry): entry is NonNullable<typeof entry> => entry != null),
    mineRows.filter((entry): entry is NonNullable<typeof entry> => entry != null),
  ).map((pair) => buildSplitRow(
    pair.base?.meta.line ?? null,
    pair.mine?.meta.line ?? null,
    pair.base?.meta.lineIdx ?? null,
    pair.mine?.meta.lineIdx ?? null,
    fallbackLineIdx,
  ));
}

function buildWorkbookSplitRows(
  sectionDiffLines: DiffLine[],
  lineIdxOffset: number,
  compareMode: WorkbookCompareMode = 'strict',
): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;

  while (index < sectionDiffLines.length) {
    const line = sectionDiffLines[index]!;

    if (line.type === 'equal') {
      const lineIdx = index + lineIdxOffset;
      const leftParsed = line.base ? parseWorkbookDisplayLine(line.base) : null;
      const rightParsed = line.mine ? parseWorkbookDisplayLine(line.mine) : null;
      const rowNumbersDiffer = leftParsed?.kind === 'row' && rightParsed?.kind === 'row'
        ? leftParsed.rowNumber !== rightParsed.rowNumber
        : false;
      const lineSemanticallyDiffers = leftParsed?.kind === 'row' && rightParsed?.kind === 'row'
        ? buildWorkbookRowSignature(leftParsed, compareMode) !== buildWorkbookRowSignature(rightParsed, compareMode)
        : line.base !== line.mine;
      if (line.base && line.mine && (lineSemanticallyDiffers || rowNumbersDiffer)) {
        rows.push(buildSplitRow(
          makeSideScopedEqualLine(line, 'base'),
          makeSideScopedEqualLine(line, 'mine'),
          lineIdx,
          lineIdx,
          lineIdx,
        ));
      } else {
        rows.push({
          left: line,
          right: line,
          lineIdx,
          lineIdxs: [lineIdx],
        });
      }
      index += 1;
      continue;
    }

    const deleteStart = index;
    while (index < sectionDiffLines.length && sectionDiffLines[index]!.type === 'delete') index += 1;
    const addStart = index;
    while (index < sectionDiffLines.length && sectionDiffLines[index]!.type === 'add') index += 1;

    const baseRows = sectionDiffLines
      .slice(deleteStart, addStart)
      .map((entry, entryIndex) => createWorkbookAlignmentEntry(entry.base ?? entry.mine ?? '', {
        line: entry,
        lineIdx: lineIdxOffset + deleteStart + entryIndex,
      }, compareMode));
    const mineRows = sectionDiffLines
      .slice(addStart, index)
      .map((entry, entryIndex) => createWorkbookAlignmentEntry(entry.base ?? entry.mine ?? '', {
        line: entry,
        lineIdx: lineIdxOffset + addStart + entryIndex,
      }, compareMode));

    rows.push(...alignWorkbookChangeRows(baseRows, mineRows, lineIdxOffset + deleteStart));

    if (index === deleteStart) index += 1;
  }

  return rows;
}

function isWorkbookDataRow(row: SplitRow): boolean {
  const leftParsed = parseWorkbookDisplayLine(row.left?.base ?? row.left?.mine ?? '');
  const rightParsed = parseWorkbookDisplayLine(row.right?.base ?? row.right?.mine ?? '');
  if (leftParsed?.kind === 'sheet' || rightParsed?.kind === 'sheet') return false;
  return leftParsed?.kind === 'row' || rightParsed?.kind === 'row';
}

export function buildWorkbookSectionRowIndex(
  diffLines: DiffLine[],
  sections: WorkbookSection[],
  compareMode: WorkbookCompareMode = 'strict',
): Map<string, IndexedWorkbookSectionRows> {
  const sectionMap = new Map<string, IndexedWorkbookSectionRows>();

  sections.forEach((section) => {
    const contentStartIdx = Math.min(section.startLineIdx + 1, section.endLineIdx + 1);
    const sectionDiffLines = diffLines.slice(contentStartIdx, section.endLineIdx + 1);
    const splitRows = buildWorkbookSplitRows(sectionDiffLines, contentStartIdx, compareMode)
      .filter(isWorkbookDataRow);
    sectionMap.set(section.name, { rows: splitRows });
  });

  return sectionMap;
}

export function buildWorkbookSectionRowIndexFromPrecomputedDelta(
  diffLines: DiffLine[],
  payload: WorkbookPrecomputedDeltaPayload | null | undefined,
): Map<string, IndexedWorkbookSectionRows> {
  const sectionMap = new Map<string, IndexedWorkbookSectionRows>();
  if (!payload) return sectionMap;

  payload.sections.forEach((section) => {
    const rows: SplitRow[] = section.rows.map((row) => ({
      left: row.leftLineIdx != null ? (diffLines[row.leftLineIdx] ?? null) : null,
      right: row.rightLineIdx != null ? (diffLines[row.rightLineIdx] ?? null) : null,
      lineIdx: row.lineIdx,
      lineIdxs: row.lineIdxs,
      workbookRowDelta: hydrateWorkbookRowDelta(row),
    }));
    sectionMap.set(section.name, { rows });
  });

  return sectionMap;
}
