import type {
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookDiffRegionPatch,
  WorkbookSelectedCell,
} from '../types';
import type { WorkbookMetadataMap } from './workbookMeta';
import { findWorkbookMergeRange } from './workbookMergeLayout';
import { buildWorkbookSplitRowCompareState } from './workbookCompare';
import {
  buildWorkbookRowEntry,
  buildWorkbookSelectedCell,
} from './workbookNavigation';
import type { IndexedWorkbookSectionRows } from './workbookSheetIndex';
import { getWorkbookColumnLabel, type WorkbookSection } from './workbookSections';

interface WorkbookDiffRegionNode extends WorkbookDiffRegionPatch {
  rowNumberStart: number;
  rowNumberEnd: number;
  anchorSelection: WorkbookSelectedCell | null;
  anchorLineIdx: number;
}

function findParent(parent: number[], index: number): number {
  if (parent[index] === index) return index;
  parent[index] = findParent(parent, parent[index]!);
  return parent[index]!;
}

function unionParent(parent: number[], left: number, right: number) {
  const leftRoot = findParent(parent, left);
  const rightRoot = findParent(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function intervalsTouch(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA <= (endB + 1) && endA >= (startB - 1);
}

function patchesTouch(left: WorkbookDiffRegionPatch, right: WorkbookDiffRegionPatch): boolean {
  return intervalsTouch(left.startRowIndex, left.endRowIndex, right.startRowIndex, right.endRowIndex)
    && intervalsTouch(left.startCol, left.endCol, right.startCol, right.endCol);
}

function resolveRowIndex(
  rowNumber: number | null,
  fallbackIndex: number,
  rowIndexByNumber: Map<number, number>,
): number {
  if (rowNumber == null) return fallbackIndex;
  return rowIndexByNumber.get(rowNumber) ?? fallbackIndex;
}

function buildNodeAnchorSelection(
  sheetName: string,
  baseVersionLabel: string,
  mineVersionLabel: string,
  row: IndexedWorkbookSectionRows['rows'][number],
  column: number,
  baseMergeRanges: NonNullable<WorkbookMetadataMap['sheets'][string]>['mergeRanges'],
  mineMergeRanges: NonNullable<WorkbookMetadataMap['sheets'][string]>['mergeRanges'],
): WorkbookSelectedCell | null {
  const baseEntry = buildWorkbookRowEntry(row, 'base', sheetName, baseVersionLabel);
  const mineEntry = buildWorkbookRowEntry(row, 'mine', sheetName, mineVersionLabel);

  if (row.right?.type === 'add' && mineEntry) {
    return buildWorkbookSelectedCell(mineEntry, column, mineMergeRanges);
  }
  if (row.left?.type === 'delete' && baseEntry) {
    return buildWorkbookSelectedCell(baseEntry, column, baseMergeRanges);
  }
  if (mineEntry) {
    return buildWorkbookSelectedCell(mineEntry, column, mineMergeRanges);
  }
  if (baseEntry) {
    return buildWorkbookSelectedCell(baseEntry, column, baseMergeRanges);
  }
  return null;
}

function collectWorkbookDiffRegionNodes(
  section: WorkbookSection,
  rows: IndexedWorkbookSectionRows['rows'],
  baseVersionLabel: string,
  mineVersionLabel: string,
  compareMode: WorkbookCompareMode,
  baseWorkbookMetadata: WorkbookMetadataMap | null,
  mineWorkbookMetadata: WorkbookMetadataMap | null,
): WorkbookDiffRegionNode[] {
  const baseMergeRanges = baseWorkbookMetadata?.sheets[section.name]?.mergeRanges ?? [];
  const mineMergeRanges = mineWorkbookMetadata?.sheets[section.name]?.mergeRanges ?? [];
  const rowEntries = rows.map((row) => ({
    row,
    baseEntry: buildWorkbookRowEntry(row, 'base', section.name, baseVersionLabel),
    mineEntry: buildWorkbookRowEntry(row, 'mine', section.name, mineVersionLabel),
  }));
  const baseRowIndexByNumber = new Map<number, number>();
  const mineRowIndexByNumber = new Map<number, number>();

  rowEntries.forEach((entry, rowIndex) => {
    if (entry.baseEntry) baseRowIndexByNumber.set(entry.baseEntry.rowNumber, rowIndex);
    if (entry.mineEntry) mineRowIndexByNumber.set(entry.mineEntry.rowNumber, rowIndex);
  });

  const nodes: WorkbookDiffRegionNode[] = [];

  rowEntries.forEach((entry, rowIndex) => {
    const rowState = buildWorkbookSplitRowCompareState(entry.row, undefined, compareMode);
    if (!rowState.hasChanges) return;

    rowState.cellDeltas.forEach((cellDelta, column) => {
      if (!cellDelta.changed) return;

      const baseRowNumber = entry.baseEntry?.rowNumber ?? null;
      const mineRowNumber = entry.mineEntry?.rowNumber ?? null;
      const baseRange = baseRowNumber != null
        ? findWorkbookMergeRange(baseMergeRanges, baseRowNumber, column)
        : null;
      const mineRange = mineRowNumber != null
        ? findWorkbookMergeRange(mineMergeRanges, mineRowNumber, column)
        : null;
      const startCol = Math.min(baseRange?.startCol ?? column, mineRange?.startCol ?? column);
      const endCol = Math.max(baseRange?.endCol ?? column, mineRange?.endCol ?? column);
      const baseRowStart = baseRange?.startRow ?? baseRowNumber;
      const baseRowEnd = baseRange?.endRow ?? baseRowNumber;
      const mineRowStart = mineRange?.startRow ?? mineRowNumber;
      const mineRowEnd = mineRange?.endRow ?? mineRowNumber;
      const startRowIndex = Math.min(
        rowIndex,
        resolveRowIndex(baseRowStart, rowIndex, baseRowIndexByNumber),
        resolveRowIndex(mineRowStart, rowIndex, mineRowIndexByNumber),
      );
      const endRowIndex = Math.max(
        rowIndex,
        resolveRowIndex(baseRowEnd, rowIndex, baseRowIndexByNumber),
        resolveRowIndex(mineRowEnd, rowIndex, mineRowIndexByNumber),
      );
      const hasBaseSide = Boolean(entry.baseEntry && cellDelta.kind !== 'add');
      const hasMineSide = Boolean(entry.mineEntry && cellDelta.kind !== 'delete');
      const rowNumberCandidates = [baseRowStart, baseRowEnd, mineRowStart, mineRowEnd]
        .filter((value): value is number => value != null && value > 0);
      const rowNumberStart = rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0;
      const rowNumberEnd = rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0;

      nodes.push({
        startRowIndex,
        endRowIndex,
        startCol,
        endCol,
        baseRowStart,
        baseRowEnd,
        mineRowStart,
        mineRowEnd,
        hasBaseSide,
        hasMineSide,
        lineIdxs: entry.row.lineIdxs,
        rowNumberStart,
        rowNumberEnd,
        anchorSelection: buildNodeAnchorSelection(
          section.name,
          baseVersionLabel,
          mineVersionLabel,
          entry.row,
          startCol,
          baseMergeRanges,
          mineMergeRanges,
        ),
        anchorLineIdx: Math.min(...entry.row.lineIdxs),
      });
    });
  });

  return nodes;
}

function aggregateWorkbookDiffRegions(
  sheetName: string,
  nodes: WorkbookDiffRegionNode[],
): WorkbookDiffRegion[] {
  if (nodes.length === 0) return [];

  const sortedNodeIndexes = nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => (
      left.node.startRowIndex - right.node.startRowIndex
      || left.node.startCol - right.node.startCol
      || left.node.endRowIndex - right.node.endRowIndex
      || left.node.endCol - right.node.endCol
    ))
    .map((entry) => entry.index);
  const parent = nodes.map((_, index) => index);
  const activeNodeIndexes: number[] = [];

  sortedNodeIndexes.forEach((nodeIndex) => {
    const node = nodes[nodeIndex]!;
    for (let activeIndex = activeNodeIndexes.length - 1; activeIndex >= 0; activeIndex -= 1) {
      const otherIndex = activeNodeIndexes[activeIndex]!;
      const otherNode = nodes[otherIndex]!;
      if (otherNode.endRowIndex < node.startRowIndex - 1) {
        activeNodeIndexes.splice(activeIndex, 1);
        continue;
      }
      if (patchesTouch(node, otherNode)) {
        unionParent(parent, otherIndex, nodeIndex);
      }
    }
    activeNodeIndexes.push(nodeIndex);
  });

  const groupedNodes = new Map<number, WorkbookDiffRegionNode[]>();
  nodes.forEach((node, index) => {
    const root = findParent(parent, index);
    const group = groupedNodes.get(root);
    if (group) group.push(node);
    else groupedNodes.set(root, [node]);
  });

  return Array.from(groupedNodes.values())
    .map((groupNodes, regionIndex) => {
      const patches = groupNodes.slice().sort((left, right) => (
        left.startRowIndex - right.startRowIndex
        || left.startCol - right.startCol
        || left.endRowIndex - right.endRowIndex
        || left.endCol - right.endCol
      ));
      const anchorPatch = patches[0]!;
      const lineIdxs = patches.flatMap((patch) => patch.lineIdxs);
      const rowNumberCandidates = patches
        .flatMap((patch) => [patch.rowNumberStart, patch.rowNumberEnd])
        .filter((value) => value > 0);

      return {
        id: `${sheetName}:${anchorPatch.startRowIndex}:${anchorPatch.startCol}:${regionIndex}`,
        sheetName,
        startRowIndex: Math.min(...patches.map((patch) => patch.startRowIndex)),
        endRowIndex: Math.max(...patches.map((patch) => patch.endRowIndex)),
        startCol: Math.min(...patches.map((patch) => patch.startCol)),
        endCol: Math.max(...patches.map((patch) => patch.endCol)),
        rowNumberStart: rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0,
        rowNumberEnd: rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0,
        lineStartIdx: Math.min(...lineIdxs),
        lineEndIdx: Math.max(...lineIdxs),
        anchorLineIdx: anchorPatch.anchorLineIdx,
        hasBaseSide: patches.some((patch) => patch.hasBaseSide),
        hasMineSide: patches.some((patch) => patch.hasMineSide),
        anchorSelection: anchorPatch.anchorSelection,
        patches,
      };
    })
    .sort((left, right) => (
      left.startRowIndex - right.startRowIndex
      || left.startCol - right.startCol
      || left.endRowIndex - right.endRowIndex
      || left.endCol - right.endCol
    ));
}

export function buildWorkbookDiffRegions(
  workbookSections: WorkbookSection[],
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>,
  baseVersionLabel: string,
  mineVersionLabel: string,
  compareMode: WorkbookCompareMode = 'strict',
  baseWorkbookMetadata: WorkbookMetadataMap | null = null,
  mineWorkbookMetadata: WorkbookMetadataMap | null = null,
): WorkbookDiffRegion[] {
  return workbookSections.flatMap((section) => {
    const rows = workbookSectionRowIndex.get(section.name)?.rows ?? [];
    const nodes = collectWorkbookDiffRegionNodes(
      section,
      rows,
      baseVersionLabel,
      mineVersionLabel,
      compareMode,
      baseWorkbookMetadata,
      mineWorkbookMetadata,
    );
    return aggregateWorkbookDiffRegions(section.name, nodes);
  });
}

export function formatWorkbookDiffRegionLabel(
  region: WorkbookDiffRegion | null | undefined,
  includeSheetName = true,
): string {
  if (!region) return '';

  const startColumn = getWorkbookColumnLabel(region.startCol);
  const endColumn = getWorkbookColumnLabel(region.endCol);
  const body = region.rowNumberStart > 0 && region.rowNumberEnd > 0
    ? (
      region.startCol === region.endCol && region.rowNumberStart === region.rowNumberEnd
        ? `${startColumn}${region.rowNumberStart}`
        : `${startColumn}${region.rowNumberStart}:${endColumn}${region.rowNumberEnd}`
    )
    : (
      region.startCol === region.endCol
        ? startColumn
        : `${startColumn}:${endColumn}`
    );

  return includeSheetName ? `${region.sheetName}!${body}` : body;
}

export function workbookDiffRegionContainsSelection(
  region: WorkbookDiffRegion,
  selection: WorkbookSelectedCell | null,
): boolean {
  if (!selection || selection.kind !== 'cell' || selection.sheetName !== region.sheetName) return false;

  return region.patches.some((patch) => {
    const hasSide = selection.side === 'base' ? patch.hasBaseSide : patch.hasMineSide;
    const rowStart = selection.side === 'base' ? patch.baseRowStart : patch.mineRowStart;
    const rowEnd = selection.side === 'base' ? patch.baseRowEnd : patch.mineRowEnd;
    if (!hasSide || rowStart == null || rowEnd == null) return false;
    return selection.rowNumber >= rowStart
      && selection.rowNumber <= rowEnd
      && selection.colIndex >= patch.startCol
      && selection.colIndex <= patch.endCol;
  });
}

export function findWorkbookDiffRegionIndexForSelection(
  regions: WorkbookDiffRegion[],
  selection: WorkbookSelectedCell | null,
): number {
  if (!selection || selection.kind !== 'cell') return -1;
  return regions.findIndex((region) => workbookDiffRegionContainsSelection(region, selection));
}
