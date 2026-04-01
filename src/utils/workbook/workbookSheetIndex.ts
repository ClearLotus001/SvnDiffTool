import type {
  DiffLine,
  SplitRow,
  WorkbookCompareMode,
  WorkbookPrecomputedDeltaPayload,
} from '@/types';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import { buildWorkbookLineSheetContexts } from '@/utils/workbook/workbookSections';
import {
  buildWorkbookRowSignature,
  alignWorkbookEntries,
  createWorkbookAlignmentEntry,
} from '@/utils/workbook/workbookAlignment';
import { buildWorkbookRowDelta, hydrateWorkbookRowDelta } from '@/utils/workbook/workbookDelta';
import { workbookDebugLog, isWorkbookDebugEnabled } from '@/utils/workbook/workbookDebug';

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

function makeSideScopedLine(
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
  sectionDiffLines: Array<{ line: DiffLine; lineIdx: number }>,
  compareMode: WorkbookCompareMode = 'strict',
): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;

  while (index < sectionDiffLines.length) {
    const entry = sectionDiffLines[index]!;
    const line = entry.line;

    if (line.type === 'equal') {
      const lineIdx = entry.lineIdx;
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
    while (index < sectionDiffLines.length && sectionDiffLines[index]!.line.type === 'delete') index += 1;
    const addStart = index;
    while (index < sectionDiffLines.length && sectionDiffLines[index]!.line.type === 'add') index += 1;

    const baseRows = sectionDiffLines
      .slice(deleteStart, addStart)
      .map((scopedEntry) => createWorkbookAlignmentEntry(scopedEntry.line.base ?? scopedEntry.line.mine ?? '', {
        line: scopedEntry.line,
        lineIdx: scopedEntry.lineIdx,
      }, compareMode));
    const mineRows = sectionDiffLines
      .slice(addStart, index)
      .map((scopedEntry) => createWorkbookAlignmentEntry(scopedEntry.line.base ?? scopedEntry.line.mine ?? '', {
        line: scopedEntry.line,
        lineIdx: scopedEntry.lineIdx,
      }, compareMode));

    rows.push(...alignWorkbookChangeRows(
      baseRows,
      mineRows,
      sectionDiffLines[deleteStart]?.lineIdx ?? 0,
    ));

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
  const lineSheetContexts = buildWorkbookLineSheetContexts(diffLines);

  sections.forEach((section) => {
    const contentStartIdx = Math.min(section.startLineIdx + 1, section.endLineIdx + 1);
    const scopedSectionDiffLines = diffLines
      .slice(contentStartIdx, section.endLineIdx + 1)
      .flatMap((line, localIndex) => {
        const lineIdx = contentStartIdx + localIndex;
        const context = lineSheetContexts[lineIdx];
        const parsedBase = line.base ? parseWorkbookDisplayLine(line.base) : null;
        const parsedMine = line.mine ? parseWorkbookDisplayLine(line.mine) : null;
      const keepBase = parsedBase?.kind === 'row' && context?.baseSheetName === section.name;
      const keepMine = parsedMine?.kind === 'row' && context?.mineSheetName === section.name;
      if (!keepBase && !keepMine) return [];

      if (
        isWorkbookDebugEnabled()
        && parsedBase?.kind === 'row'
        && parsedMine?.kind === 'row'
        && context?.baseSheetName !== context?.mineSheetName
      ) {
        workbookDebugLog('sheet-index/js-cross-sheet-row', {
          sectionName: section.name,
          lineIdx,
          baseSheetName: context?.baseSheetName ?? null,
          mineSheetName: context?.mineSheetName ?? null,
          keepBase,
          keepMine,
          baseRowNumber: parsedBase.rowNumber,
          mineRowNumber: parsedMine.rowNumber,
          baseColumnCount: parsedBase.cells.length,
          mineColumnCount: parsedMine.cells.length,
        });
      }

      return [{
        lineIdx,
          line: {
            ...line,
            type: keepBase && keepMine ? 'equal' : keepBase ? 'delete' : 'add',
            base: keepBase ? line.base : null,
            mine: keepMine ? line.mine : null,
            baseLineNo: keepBase ? line.baseLineNo : null,
            mineLineNo: keepMine ? line.mineLineNo : null,
            baseCharSpans: keepBase ? line.baseCharSpans : null,
            mineCharSpans: keepMine ? line.mineCharSpans : null,
          } satisfies DiffLine,
        }];
      });
    const splitRows = buildWorkbookSplitRows(scopedSectionDiffLines, compareMode)
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
  const lineSheetContexts = buildWorkbookLineSheetContexts(diffLines);

  payload.sections.forEach((section) => {
    const rows: SplitRow[] = section.rows.flatMap((row) => {
      const leftLine = row.leftLineIdx != null ? (diffLines[row.leftLineIdx] ?? null) : null;
      const rightLine = row.rightLineIdx != null ? (diffLines[row.rightLineIdx] ?? null) : null;
      const leftContext = row.leftLineIdx != null ? lineSheetContexts[row.leftLineIdx] : null;
      const rightContext = row.rightLineIdx != null ? lineSheetContexts[row.rightLineIdx] : null;
      const keepLeft = Boolean(leftLine && leftContext?.baseSheetName === section.name);
      const keepRight = Boolean(rightLine && rightContext?.mineSheetName === section.name);
      if (!keepLeft && !keepRight) return [];

      const scopedLeft = keepLeft && leftLine ? makeSideScopedLine(leftLine, 'base') : null;
      const scopedRight = keepRight && rightLine ? makeSideScopedLine(rightLine, 'mine') : null;
      const nextLineIdxs = Array.from(new Set([
        ...(keepLeft && row.leftLineIdx != null ? [row.leftLineIdx] : []),
        ...(keepRight && row.rightLineIdx != null ? [row.rightLineIdx] : []),
      ]));
      const shouldReusePrecomputedDelta = (
        keepLeft === Boolean(leftLine)
        && keepRight === Boolean(rightLine)
      );

      if (
        isWorkbookDebugEnabled()
        && leftLine
        && rightLine
        && leftContext?.baseSheetName !== rightContext?.mineSheetName
      ) {
        workbookDebugLog('sheet-index/precomputed-cross-sheet-row', {
          sectionName: section.name,
          payloadLineIdx: row.lineIdx,
          leftLineIdx: row.leftLineIdx,
          rightLineIdx: row.rightLineIdx,
          leftSheetName: leftContext?.baseSheetName ?? null,
          rightSheetName: rightContext?.mineSheetName ?? null,
          keepLeft,
          keepRight,
          reusePrecomputedDelta: shouldReusePrecomputedDelta,
          changedColumns: row.changedColumns,
        });
      }

      return [{
        left: scopedLeft,
        right: scopedRight,
        lineIdx: nextLineIdxs[0] ?? row.lineIdx,
        lineIdxs: nextLineIdxs.length > 0 ? nextLineIdxs : row.lineIdxs,
        workbookRowDelta: shouldReusePrecomputedDelta
          ? hydrateWorkbookRowDelta(row)
          : buildWorkbookRowDelta(scopedLeft, scopedRight, undefined, payload.compareMode),
      }];
    });
    sectionMap.set(section.name, { rows });
  });

  return sectionMap;
}
