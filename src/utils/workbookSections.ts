import type { DiffLine, WorkbookCompareMode } from '../types';
import { hasWorkbookCellContent } from './workbookCellContract';
import { parseWorkbookDisplayLine } from './workbookDisplay';

export interface WorkbookSection {
  name: string;
  startLineIdx: number;
  endLineIdx: number;
  maxColumns: number;
  firstDataLineIdx: number | null;
  firstDataRowNumber: number | null;
}

export function getWorkbookSections(
  diffLines: DiffLine[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookSection[] {
  const sections: WorkbookSection[] = [];
  let current: WorkbookSection | null = null;

  diffLines.forEach((line, lineIdx) => {
    const parsed = parseWorkbookDisplayLine(line.base ?? line.mine ?? '');
    if (!parsed) return;

    if (parsed.kind === 'sheet') {
      if (current) sections.push(current);
      current = {
        name: parsed.sheetName,
        startLineIdx: lineIdx,
        endLineIdx: lineIdx,
        maxColumns: 0,
        firstDataLineIdx: null,
        firstDataRowNumber: null,
      };
      return;
    }

    if (current && parsed.kind === 'row') {
      current.endLineIdx = lineIdx;
      current.maxColumns = Math.max(current.maxColumns, parsed.cells.length);
      const hasVisibleCell = parsed.cells.some(cell => hasWorkbookCellContent(cell, compareMode));
      if (current.firstDataLineIdx == null && hasVisibleCell) {
        current.firstDataLineIdx = lineIdx;
        current.firstDataRowNumber = parsed.rowNumber;
      }
    }
  });

  if (current) sections.push(current);
  return sections;
}

export function findWorkbookSectionIndex(sections: WorkbookSection[], lineIdx: number): number {
  const foundIndex = sections.findIndex(
    section => lineIdx >= section.startLineIdx && lineIdx <= section.endLineIdx,
  );
  return foundIndex >= 0 ? foundIndex : 0;
}

export function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function getWorkbookColumnLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => getWorkbookColumnLabel(index));
}
