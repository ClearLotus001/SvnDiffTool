import type { DiffLine, WorkbookCompareMode } from '../types';
import { parseWorkbookDisplayLine } from '../utils/workbookDisplay';
import {
  alignWorkbookEntries,
  createWorkbookAlignmentEntry,
  type WorkbookAlignmentEntry,
} from '../utils/workbookAlignment';

interface WorkbookSheetEntry {
  name: string;
  rawSheetLine: string;
  rows: WorkbookAlignmentEntry<{ rowNumber: number }>[];
}

interface WorkbookSheetPair {
  base: WorkbookSheetEntry | null;
  mine: WorkbookSheetEntry | null;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '' || lines[lines.length - 1] === '\r') lines.pop();
  return lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

export function isWorkbookText(text: string): boolean {
  const firstNonEmptyLine = splitLines(text).find(line => line.trim().length > 0) ?? '';
  const parsed = parseWorkbookDisplayLine(firstNonEmptyLine);
  return parsed?.kind === 'sheet' || parsed?.kind === 'row';
}

export function isWorkbookTextPair(baseText: string, mineText: string): boolean {
  return isWorkbookText(baseText) && isWorkbookText(mineText);
}

function parseWorkbookDocument(
  text: string,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookSheetEntry[] {
  const lines = splitLines(text);
  const sheets: WorkbookSheetEntry[] = [];
  let current: WorkbookSheetEntry | null = null;

  lines.forEach((line) => {
    if (!line) return;
    const parsed = parseWorkbookDisplayLine(line);
    if (!parsed) return;

    if (parsed.kind === 'sheet') {
      if (current) sheets.push(current);
      current = {
        name: parsed.sheetName,
        rawSheetLine: line,
        rows: [],
      };
      return;
    }

    if (!current) return;
    const entry = createWorkbookAlignmentEntry(line, { rowNumber: parsed.rowNumber }, compareMode);
    if (entry) current.rows.push(entry);
  });

  if (current) sheets.push(current);
  return sheets;
}

function alignWorkbookSheets(
  baseSheets: WorkbookSheetEntry[],
  mineSheets: WorkbookSheetEntry[],
): WorkbookSheetPair[] {
  const mineQueues = new Map<string, WorkbookSheetEntry[]>();
  mineSheets.forEach((sheet) => {
    const existing = mineQueues.get(sheet.name);
    if (existing) {
      existing.push(sheet);
      return;
    }
    mineQueues.set(sheet.name, [sheet]);
  });

  const matchedMineSheets = new Set<WorkbookSheetEntry>();
  const pairs: WorkbookSheetPair[] = baseSheets.map((baseSheet) => {
    const queue = mineQueues.get(baseSheet.name);
    const mineSheet = queue?.shift() ?? null;
    if (mineSheet) matchedMineSheets.add(mineSheet);
    return {
      base: baseSheet,
      mine: mineSheet,
    };
  });

  mineSheets.forEach((mineSheet) => {
    if (matchedMineSheets.has(mineSheet)) return;
    pairs.push({
      base: null,
      mine: mineSheet,
    });
  });

  return pairs;
}

function makeLine(
  type: DiffLine['type'],
  base: string | null,
  mine: string | null,
  baseLineNo: number | null,
  mineLineNo: number | null,
): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo,
    mineLineNo,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function appendSheetDiff(
  result: DiffLine[],
  pair: WorkbookSheetPair,
): void {
  if (pair.base && pair.mine) {
    result.push(makeLine('equal', pair.base.rawSheetLine, pair.mine.rawSheetLine, null, null));

    const rowPairs = alignWorkbookEntries(pair.base.rows, pair.mine.rows);
    rowPairs.forEach((rowPair) => {
      if (rowPair.base && rowPair.mine) {
        if (rowPair.base.signature === rowPair.mine.signature) {
          result.push(makeLine(
            'equal',
            rowPair.base.rawLine,
            rowPair.mine.rawLine,
            rowPair.base.parsed.rowNumber,
            rowPair.mine.parsed.rowNumber,
          ));
          return;
        }

        result.push(makeLine(
          'delete',
          rowPair.base.rawLine,
          null,
          rowPair.base.parsed.rowNumber,
          null,
        ));
        result.push(makeLine(
          'add',
          null,
          rowPair.mine.rawLine,
          null,
          rowPair.mine.parsed.rowNumber,
        ));
        return;
      }

      if (rowPair.base) {
        result.push(makeLine(
          'delete',
          rowPair.base.rawLine,
          null,
          rowPair.base.parsed.rowNumber,
          null,
        ));
      }
      if (rowPair.mine) {
        result.push(makeLine(
          'add',
          null,
          rowPair.mine.rawLine,
          null,
          rowPair.mine.parsed.rowNumber,
        ));
      }
    });
    return;
  }

  if (pair.base) {
    result.push(makeLine('delete', pair.base.rawSheetLine, null, null, null));
    pair.base.rows.forEach((row) => {
      result.push(makeLine('delete', row.rawLine, null, row.parsed.rowNumber, null));
    });
  }

  if (pair.mine) {
    result.push(makeLine('add', null, pair.mine.rawSheetLine, null, null));
    pair.mine.rows.forEach((row) => {
      result.push(makeLine('add', null, row.rawLine, null, row.parsed.rowNumber));
    });
  }
}

export function computeWorkbookDiff(
  baseText: string,
  mineText: string,
  compareMode: WorkbookCompareMode = 'strict',
): DiffLine[] {
  const baseSheets = parseWorkbookDocument(baseText, compareMode);
  const mineSheets = parseWorkbookDocument(mineText, compareMode);
  const sheetPairs = alignWorkbookSheets(baseSheets, mineSheets);
  const result: DiffLine[] = [];

  sheetPairs.forEach((pair) => appendSheetDiff(result, pair));
  return result;
}
