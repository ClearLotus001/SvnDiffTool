import type { WorkbookCompareMode } from '@/types';
import type { WorkbookRowDisplayLine } from '@/utils/workbook/workbookDisplay';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import { hasWorkbookCellContent, serializeWorkbookCellForMode } from '@/utils/workbook/workbookCellContract';

export interface WorkbookAlignmentEntry<TMeta = unknown> {
  rawLine: string;
  parsed: WorkbookRowDisplayLine;
  signature: string;
  meta: TMeta;
}

export interface WorkbookAlignedEntryPair<TMeta = unknown> {
  base: WorkbookAlignmentEntry<TMeta> | null;
  mine: WorkbookAlignmentEntry<TMeta> | null;
}

interface LCSNode {
  baseIdx: number;
  mineIdx: number;
  prev: LCSNode | null;
}

interface LCSEntry {
  baseIdx: number;
  mineIdx: number;
}

export function buildWorkbookRowSignature(
  parsed: WorkbookRowDisplayLine,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  const cells = [...parsed.cells];
  while (cells.length > 0) {
    const lastCell = cells[cells.length - 1];
    if (!lastCell || hasWorkbookCellContent(lastCell, compareMode)) break;
    cells.pop();
  }

  return cells
    .map(cell => serializeWorkbookCellForMode(cell, compareMode))
    .join('\t');
}

export function createWorkbookAlignmentEntry<TMeta>(
  rawLine: string,
  meta: TMeta,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookAlignmentEntry<TMeta> | null {
  const parsed = parseWorkbookDisplayLine(rawLine);
  if (parsed?.kind !== 'row') return null;

  return {
    rawLine,
    parsed,
    signature: buildWorkbookRowSignature(parsed, compareMode),
    meta,
  };
}

function patienceLCS<TMeta>(
  baseRows: WorkbookAlignmentEntry<TMeta>[],
  mineRows: WorkbookAlignmentEntry<TMeta>[],
): LCSEntry[] {
  if (baseRows.length === 0 || mineRows.length === 0) return [];

  const mineIndex = new Map<string, number[]>();
  mineRows.forEach((row, index) => {
    const existing = mineIndex.get(row.signature);
    if (existing) {
      existing.push(index);
      return;
    }
    mineIndex.set(row.signature, [index]);
  });

  const piles: LCSNode[] = [];
  const tails: number[] = [];

  for (let baseIdx = 0; baseIdx < baseRows.length; baseIdx += 1) {
    const positions = mineIndex.get(baseRows[baseIdx]!.signature);
    if (!positions) continue;

    // Iterate matching mine positions in reverse order.
    // This is the standard Hunt–Szymanski / patience-LCS trick that prevents
    // one base row from being chained against multiple duplicate mine rows
    // (for example many consecutive blank workbook rows).
    const sortedPositions = positions.slice().sort((left, right) => right - left);
    sortedPositions.forEach((mineIdx) => {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((tails[mid] ?? 0) < mineIdx) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && (tails[lo - 1] ?? 0) >= mineIdx) return;

      const node: LCSNode = {
        baseIdx,
        mineIdx,
        prev: lo > 0 ? (piles[lo - 1] ?? null) : null,
      };
      piles[lo] = node;
      tails[lo] = mineIdx;
    });
  }

  const result: LCSEntry[] = [];
  let node: LCSNode | null = piles[piles.length - 1] ?? null;
  while (node) {
    result.unshift({ baseIdx: node.baseIdx, mineIdx: node.mineIdx });
    node = node.prev;
  }
  return result;
}

export function alignWorkbookEntries<TMeta>(
  baseRows: WorkbookAlignmentEntry<TMeta>[],
  mineRows: WorkbookAlignmentEntry<TMeta>[],
): WorkbookAlignedEntryPair<TMeta>[] {
  const anchors = patienceLCS(baseRows, mineRows);
  const result: WorkbookAlignedEntryPair<TMeta>[] = [];
  let baseIdx = 0;
  let mineIdx = 0;

  const emitUnmatched = (baseEnd: number, mineEnd: number) => {
    const unmatchedCount = Math.max(baseEnd - baseIdx, mineEnd - mineIdx);
    for (let offset = 0; offset < unmatchedCount; offset += 1) {
      result.push({
        base: baseIdx + offset < baseEnd ? (baseRows[baseIdx + offset] ?? null) : null,
        mine: mineIdx + offset < mineEnd ? (mineRows[mineIdx + offset] ?? null) : null,
      });
    }
    baseIdx = baseEnd;
    mineIdx = mineEnd;
  };

  anchors.forEach((anchor) => {
    emitUnmatched(anchor.baseIdx, anchor.mineIdx);
    result.push({
      base: baseRows[anchor.baseIdx] ?? null,
      mine: mineRows[anchor.mineIdx] ?? null,
    });
    baseIdx = anchor.baseIdx + 1;
    mineIdx = anchor.mineIdx + 1;
  });

  emitUnmatched(baseRows.length, mineRows.length);
  return result;
}
