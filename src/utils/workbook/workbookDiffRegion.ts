import type {
  Hunk,
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookDiffRegionPatch,
  WorkbookSelectedCell,
} from '@/types';
import type { WorkbookMetadataMap } from '@/utils/workbook/workbookMeta';
import { findWorkbookMergeRange } from '@/utils/workbook/workbookMergeLayout';
import { buildWorkbookSplitRowCompareState } from '@/utils/workbook/workbookCompare';
import { getWorkbookRowDeltaEntries } from '@/utils/workbook/workbookDelta';
import {
  buildWorkbookRowEntry,
  buildWorkbookSelectedCell,
} from '@/utils/workbook/workbookNavigation';
import type { IndexedWorkbookSectionRows, WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';
import { getWorkbookColumnLabel, type WorkbookSection } from '@/utils/workbook/workbookSections';

interface WorkbookDiffRegionNode extends WorkbookDiffRegionPatch {
  rowNumberStart: number;
  rowNumberEnd: number;
  anchorSelection: WorkbookSelectedCell | null;
  anchorLineIdx: number;
}

interface WorkbookDiffRegionBlock {
  startRowIndex: number;
  endRowIndex: number;
  startCol: number;
  endCol: number;
  hasBaseSide: boolean;
  hasMineSide: boolean;
  patches: WorkbookDiffRegionNode[];
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

function compareWorkbookDiffRegionNodes(
  left: WorkbookDiffRegionNode,
  right: WorkbookDiffRegionNode,
): number {
  return left.startRowIndex - right.startRowIndex
    || left.startCol - right.startCol
    || left.endRowIndex - right.endRowIndex
    || left.endCol - right.endCol
    || Number(left.hasBaseSide) - Number(right.hasBaseSide)
    || Number(left.hasMineSide) - Number(right.hasMineSide)
    || (left.baseRowStart ?? -1) - (right.baseRowStart ?? -1)
    || (left.baseRowEnd ?? -1) - (right.baseRowEnd ?? -1)
    || (left.mineRowStart ?? -1) - (right.mineRowStart ?? -1)
    || (left.mineRowEnd ?? -1) - (right.mineRowEnd ?? -1)
    || left.anchorLineIdx - right.anchorLineIdx;
}

function compareWorkbookDiffRegionBlocks(
  left: WorkbookDiffRegionBlock,
  right: WorkbookDiffRegionBlock,
): number {
  return left.startRowIndex - right.startRowIndex
    || left.startCol - right.startCol
    || left.endRowIndex - right.endRowIndex
    || left.endCol - right.endCol
    || Number(left.hasBaseSide) - Number(right.hasBaseSide)
    || Number(left.hasMineSide) - Number(right.hasMineSide);
}

function mergeLineIdxs(lineIdxArrays: number[][]): number[] {
  return Array.from(new Set(lineIdxArrays.flatMap((lineIdxs) => lineIdxs)))
    .sort((left, right) => left - right);
}

function buildWorkbookDiffRegionNodeKey(node: WorkbookDiffRegionNode): string {
  return [
    node.startRowIndex,
    node.endRowIndex,
    node.startCol,
    node.endCol,
    node.baseRowStart ?? '',
    node.baseRowEnd ?? '',
    node.mineRowStart ?? '',
    node.mineRowEnd ?? '',
    Number(node.hasBaseSide),
    Number(node.hasMineSide),
  ].join(':');
}

function normalizeWorkbookDiffRegionNodes(nodes: WorkbookDiffRegionNode[]): WorkbookDiffRegionNode[] {
  if (nodes.length <= 1) return nodes.slice().sort(compareWorkbookDiffRegionNodes);

  const groups = new Map<string, WorkbookDiffRegionNode[]>();
  nodes.forEach((node) => {
    const key = buildWorkbookDiffRegionNodeKey(node);
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  });

  return Array.from(groups.values())
    .map((group) => {
      const anchorNode = group
        .slice()
        .sort(compareWorkbookDiffRegionNodes)
        .find((node) => node.anchorSelection != null) ?? group[0]!;
      const rowNumberCandidates = group
        .flatMap((node) => [node.rowNumberStart, node.rowNumberEnd])
        .filter((value) => value > 0);

      return {
        ...anchorNode,
        lineIdxs: mergeLineIdxs(group.map((node) => node.lineIdxs ?? [])),
        rowNumberStart: rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0,
        rowNumberEnd: rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0,
        anchorSelection: anchorNode.anchorSelection,
        anchorLineIdx: Math.min(...group.map((node) => node.anchorLineIdx)),
      };
    })
    .sort(compareWorkbookDiffRegionNodes);
}

function buildWorkbookDiffRegionBlock(
  patches: WorkbookDiffRegionNode[],
): WorkbookDiffRegionBlock {
  return {
    startRowIndex: Math.min(...patches.map((patch) => patch.startRowIndex)),
    endRowIndex: Math.max(...patches.map((patch) => patch.endRowIndex)),
    startCol: Math.min(...patches.map((patch) => patch.startCol)),
    endCol: Math.max(...patches.map((patch) => patch.endCol)),
    hasBaseSide: patches.some((patch) => patch.hasBaseSide),
    hasMineSide: patches.some((patch) => patch.hasMineSide),
    patches: patches.slice().sort(compareWorkbookDiffRegionNodes),
  };
}

function patchesBelongToSameVisualRegion(
  left: WorkbookDiffRegionNode,
  right: WorkbookDiffRegionNode,
): boolean {
  const rowsTouch = intervalsTouch(
    left.startRowIndex,
    left.endRowIndex,
    right.startRowIndex,
    right.endRowIndex,
  );
  const colsTouch = intervalsTouch(
    left.startCol,
    left.endCol,
    right.startCol,
    right.endCol,
  );

  // Workbook change islands are easier to navigate when staircase/corner-touching
  // cells are treated as one visual region. We therefore use 8-neighbor style
  // connectivity on the logical workbook grid: sharing an edge or just a corner
  // both count as connected, while any gap larger than one row/column remains
  // separate.
  return rowsTouch && colsTouch;
}

function buildWorkbookDiffRegionBlocks(
  nodes: WorkbookDiffRegionNode[],
): WorkbookDiffRegionBlock[] {
  const normalizedNodes = normalizeWorkbookDiffRegionNodes(nodes);
  if (normalizedNodes.length === 0) return [];

  const sortedNodeIndexes = normalizedNodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => compareWorkbookDiffRegionNodes(left.node, right.node))
    .map((entry) => entry.index);
  const parent = normalizedNodes.map((_, index) => index);
  const activeNodeIndexes: number[] = [];

  sortedNodeIndexes.forEach((nodeIndex) => {
    const node = normalizedNodes[nodeIndex]!;
    for (let activeIndex = activeNodeIndexes.length - 1; activeIndex >= 0; activeIndex -= 1) {
      const otherIndex = activeNodeIndexes[activeIndex]!;
      const otherNode = normalizedNodes[otherIndex]!;
      if (otherNode.endRowIndex < node.startRowIndex - 1) {
        activeNodeIndexes.splice(activeIndex, 1);
        continue;
      }
      if (patchesBelongToSameVisualRegion(node, otherNode)) {
        unionParent(parent, otherIndex, nodeIndex);
      }
    }
    activeNodeIndexes.push(nodeIndex);
  });

  const groupedNodes = new Map<number, WorkbookDiffRegionNode[]>();
  normalizedNodes.forEach((node, index) => {
    const root = findParent(parent, index);
    const group = groupedNodes.get(root);
    if (group) group.push(node);
    else groupedNodes.set(root, [node]);
  });

  return Array.from(groupedNodes.values())
    .map((groupNodes) => buildWorkbookDiffRegionBlock(groupNodes))
    .sort(compareWorkbookDiffRegionBlocks);
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
  row: IndexedWorkbookSectionRows['rows'][number],
  baseEntry: ReturnType<typeof buildWorkbookRowEntry>,
  mineEntry: ReturnType<typeof buildWorkbookRowEntry>,
  column: number,
  baseMergeRanges: NonNullable<WorkbookMetadataMap['sheets'][string]>['mergeRanges'],
  mineMergeRanges: NonNullable<WorkbookMetadataMap['sheets'][string]>['mergeRanges'],
): WorkbookSelectedCell | null {
  if (row.right?.type === 'add' && mineEntry) {
    return buildWorkbookSelectedCell(mineEntry, column, mineMergeRanges);
  }
  if (row.left?.type === 'delete' && baseEntry) {
    return buildWorkbookSelectedCell(baseEntry, column, baseMergeRanges);
  }
  if (baseEntry) {
    return buildWorkbookSelectedCell(baseEntry, column, baseMergeRanges);
  }
  if (mineEntry) {
    return buildWorkbookSelectedCell(mineEntry, column, mineMergeRanges);
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

    getWorkbookRowDeltaEntries(rowState).forEach((cellDelta) => {
      const column = cellDelta.column;
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
          entry.row,
          entry.baseEntry,
          entry.mineEntry,
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

  return buildWorkbookDiffRegionBlocks(nodes)
    .map((block, regionIndex) => {
      const patches = block.patches.slice().sort(compareWorkbookDiffRegionNodes);
      const anchorPatch = patches[0]!;
      const lineIdxs = mergeLineIdxs(patches.map((patch) => patch.lineIdxs ?? []));
      const rowNumberCandidates = patches
        .flatMap((patch) => [patch.rowNumberStart, patch.rowNumberEnd])
        .filter((value) => value > 0);

      return {
        id: `${sheetName}:${block.startRowIndex}:${block.startCol}:${regionIndex}`,
        sheetName,
        startRowIndex: block.startRowIndex,
        endRowIndex: block.endRowIndex,
        startCol: block.startCol,
        endCol: block.endCol,
        rowNumberStart: rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0,
        rowNumberEnd: rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0,
        lineStartIdx: Math.min(...lineIdxs),
        lineEndIdx: Math.max(...lineIdxs),
        anchorLineIdx: anchorPatch.anchorLineIdx,
        hasBaseSide: block.hasBaseSide,
        hasMineSide: block.hasMineSide,
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
  workbookSectionRowIndex: WorkbookSectionRowIndex,
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

function resolveWorkbookDiffRegionRowStart(region: WorkbookDiffRegion): number {
  return region.rowNumberStart > 0 ? region.rowNumberStart : region.startRowIndex;
}

function resolveWorkbookDiffRegionRowEnd(region: WorkbookDiffRegion): number {
  return region.rowNumberEnd > 0 ? region.rowNumberEnd : region.endRowIndex;
}

function buildWorkbookNavigationSheetOrder(
  regions: WorkbookDiffRegion[],
  sheetOrder: string[],
): string[] {
  const nextSheetOrder: string[] = [];
  const seenSheetNames = new Set<string>();

  sheetOrder.forEach((sheetName) => {
    if (seenSheetNames.has(sheetName)) return;
    seenSheetNames.add(sheetName);
    nextSheetOrder.push(sheetName);
  });

  regions.forEach((region) => {
    if (seenSheetNames.has(region.sheetName)) return;
    seenSheetNames.add(region.sheetName);
    nextSheetOrder.push(region.sheetName);
  });

  return nextSheetOrder;
}

function compareWorkbookDiffRegions(
  left: WorkbookDiffRegion,
  right: WorkbookDiffRegion,
  sheetOrderIndexByName: Map<string, number>,
): number {
  const leftSheetOrder = sheetOrderIndexByName.get(left.sheetName);
  const rightSheetOrder = sheetOrderIndexByName.get(right.sheetName);
  if (leftSheetOrder != null && rightSheetOrder != null && leftSheetOrder !== rightSheetOrder) {
    return leftSheetOrder - rightSheetOrder;
  }
  if (leftSheetOrder != null && rightSheetOrder == null) return -1;
  if (leftSheetOrder == null && rightSheetOrder != null) return 1;

  return left.sheetName.localeCompare(right.sheetName)
    || resolveWorkbookDiffRegionRowStart(left) - resolveWorkbookDiffRegionRowStart(right)
    || left.startCol - right.startCol
    || resolveWorkbookDiffRegionRowEnd(left) - resolveWorkbookDiffRegionRowEnd(right)
    || left.endCol - right.endCol;
}

export function buildWorkbookNavigationRegions(
  regions: WorkbookDiffRegion[],
  _hunks: Hunk[],
  sheetOrder: string[] = [],
): WorkbookDiffRegion[] {
  if (regions.length === 0) return [];

  const navigationSheetOrder = buildWorkbookNavigationSheetOrder(regions, sheetOrder);
  const sheetOrderIndexByName = new Map(
    navigationSheetOrder.map((sheetName, index) => [sheetName, index]),
  );

  return regions
    .slice()
    .sort((left, right) => compareWorkbookDiffRegions(left, right, sheetOrderIndexByName));
}

function buildWorkbookDirectionalSheetTraversalOrder(
  orderedSheetNames: string[],
  activeSheetName: string,
  direction: -1 | 1,
): string[] {
  const activeSheetIndex = orderedSheetNames.indexOf(activeSheetName);
  if (activeSheetIndex < 0) {
    return direction === 1 ? orderedSheetNames : orderedSheetNames.slice().reverse();
  }

  if (direction === 1) {
    return [
      ...orderedSheetNames.slice(activeSheetIndex),
      ...orderedSheetNames.slice(0, activeSheetIndex),
    ];
  }

  return [
    ...orderedSheetNames.slice(0, activeSheetIndex + 1).reverse(),
    ...orderedSheetNames.slice(activeSheetIndex + 1).reverse(),
  ];
}

export function findWorkbookDiffRegionNavigationIndex(params: {
  regions: WorkbookDiffRegion[];
  currentIndex: number;
  direction: -1 | 1;
  activeSheetName: string | null;
  sheetOrder?: string[] | undefined;
}): number {
  const {
    regions,
    currentIndex,
    direction,
    activeSheetName,
    sheetOrder = [],
  } = params;

  if (regions.length === 0) return 0;

  const hasValidCurrentIndex = currentIndex >= 0 && currentIndex < regions.length;
  const activeRegion = hasValidCurrentIndex ? (regions[currentIndex] ?? null) : null;

  if (!activeSheetName || activeRegion?.sheetName === activeSheetName) {
    if (!hasValidCurrentIndex) {
      return direction === 1 ? 0 : regions.length - 1;
    }
    return (currentIndex + direction + regions.length) % regions.length;
  }

  const orderedSheetNames = buildWorkbookDirectionalSheetTraversalOrder(
    buildWorkbookNavigationSheetOrder(regions, sheetOrder),
    activeSheetName,
    direction,
  );

  for (const sheetName of orderedSheetNames) {
    if (direction === 1) {
      const nextIndex = regions.findIndex((region) => region.sheetName === sheetName);
      if (nextIndex >= 0) return nextIndex;
      continue;
    }

    for (let index = regions.length - 1; index >= 0; index -= 1) {
      if (regions[index]?.sheetName === sheetName) return index;
    }
  }

  if (!hasValidCurrentIndex) {
    return direction === 1 ? 0 : regions.length - 1;
  }
  return (currentIndex + direction + regions.length) % regions.length;
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

export function formatWorkbookDiffRegionSummary(
  region: WorkbookDiffRegion | null | undefined,
): string {
  if (!region) return '';

  const rangeLabel = formatWorkbookDiffRegionLabel(region, false);
  const rowCount = region.rowNumberStart > 0 && region.rowNumberEnd > 0
    ? Math.max(1, region.rowNumberEnd - region.rowNumberStart + 1)
    : Math.max(1, region.endRowIndex - region.startRowIndex + 1);
  const columnCount = Math.max(1, region.endCol - region.startCol + 1);

  return `${rangeLabel} · ${rowCount}×${columnCount}`;
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
