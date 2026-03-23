import type { DiffLine, SplitRow } from '../types';
import { buildSplitRows } from '../engine/diff';
import type { WorkbookSection } from './workbookSections';
import { parseWorkbookDisplayLine } from './workbookDisplay';

export interface IndexedWorkbookSectionRows {
  rows: SplitRow[];
}

function offsetSplitRows(rows: SplitRow[], lineIdxOffset: number): SplitRow[] {
  return rows.map((row) => ({
    ...row,
    lineIdx: row.lineIdx + lineIdxOffset,
    lineIdxs: row.lineIdxs.map((lineIdx) => lineIdx + lineIdxOffset),
  }));
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
    const splitRows = offsetSplitRows(buildSplitRows(sectionDiffLines), contentStartIdx)
      .filter(isWorkbookDataRow);
    sectionMap.set(section.name, { rows: splitRows });
  });

  return sectionMap;
}
