import type { DiffLine, SplitRow } from '../types';
import type { WorkbookSection } from './workbookSections';
import { parseWorkbookDisplayLine } from './workbookDisplay';
import {
  alignWorkbookEntries,
  createWorkbookAlignmentEntry,
} from './workbookAlignment';

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

function buildWorkbookSplitRows(sectionDiffLines: DiffLine[], lineIdxOffset: number): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;

  while (index < sectionDiffLines.length) {
    const line = sectionDiffLines[index]!;

    if (line.type === 'equal') {
      const lineIdx = index + lineIdxOffset;
      if (line.base && line.mine && line.base !== line.mine) {
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
      }));
    const mineRows = sectionDiffLines
      .slice(addStart, index)
      .map((entry, entryIndex) => createWorkbookAlignmentEntry(entry.base ?? entry.mine ?? '', {
        line: entry,
        lineIdx: lineIdxOffset + addStart + entryIndex,
      }));

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
): Map<string, IndexedWorkbookSectionRows> {
  const sectionMap = new Map<string, IndexedWorkbookSectionRows>();

  sections.forEach((section) => {
    const contentStartIdx = Math.min(section.startLineIdx + 1, section.endLineIdx + 1);
    const sectionDiffLines = diffLines.slice(contentStartIdx, section.endLineIdx + 1);
    const splitRows = buildWorkbookSplitRows(sectionDiffLines, contentStartIdx)
      .filter(isWorkbookDataRow);
    sectionMap.set(section.name, { rows: splitRows });
  });

  return sectionMap;
}
