import {
  getCollapseExpandStep,
  getCollapseRevealRanges,
  type CollapseExpansionState,
} from './collapseState';

export interface CollapsibleRowBlock<RowT extends { lineIdx: number }> {
  kind: 'equal' | 'change';
  rows: RowT[];
  startLineIdx: number;
  endLineIdx: number;
}

export interface CollapsedRowTarget {
  blockId: string;
  hiddenStart: number;
  hiddenEnd: number;
  targetIndex: number;
}

function buildCollapseBlockId<RowT extends { lineIdx: number }>(
  block: CollapsibleRowBlock<RowT>,
  blockIndex: number,
  blockPrefix: string,
): string {
  return `${blockPrefix}-${blockIndex}-${block.startLineIdx}-${block.endLineIdx}`;
}

export function buildCollapsibleRowBlocks<RowT extends { lineIdx: number }>(
  rows: RowT[],
  isEqualRow: (row: RowT) => boolean,
): CollapsibleRowBlock<RowT>[] {
  const blocks: CollapsibleRowBlock<RowT>[] = [];
  let index = 0;

  while (index < rows.length) {
    const firstRow = rows[index]!;
    const kind = isEqualRow(firstRow) ? 'equal' : 'change';
    const startIndex = index;
    index += 1;

    while (index < rows.length && (isEqualRow(rows[index]!) ? 'equal' : 'change') === kind) {
      index += 1;
    }

    const blockRows = rows.slice(startIndex, index);
    blocks.push({
      kind,
      rows: blockRows,
      startLineIdx: blockRows[0]!.lineIdx,
      endLineIdx: blockRows[blockRows.length - 1]!.lineIdx,
    });
  }

  return blocks;
}

export function buildCollapsedItems<RowT extends { lineIdx: number }, TRowItem, TCollapseItem>(
  blocks: CollapsibleRowBlock<RowT>[],
  collapseCtx: boolean,
  expandedBlocks: CollapseExpansionState,
  options: {
    contextLines: number;
    blockPrefix: string;
    buildRowItem: (row: RowT) => TRowItem;
    buildCollapseItem: (params: {
      blockId: string;
      count: number;
      fromIdx: number;
      toIdx: number;
      hiddenStart: number;
      hiddenEnd: number;
      expandStep: number;
    }) => TCollapseItem;
  },
): Array<TRowItem | TCollapseItem> {
  if (!collapseCtx) {
    return blocks.flatMap(block => block.rows.map(options.buildRowItem));
  }

  const result: Array<TRowItem | TCollapseItem> = [];

  blocks.forEach((block, blockIndex) => {
    if (block.kind !== 'equal') {
      block.rows.forEach((row) => {
        result.push(options.buildRowItem(row));
      });
      return;
    }

    if (block.rows.length <= options.contextLines * 2) {
      block.rows.forEach((row) => {
        result.push(options.buildRowItem(row));
      });
      return;
    }

    const blockId = buildCollapseBlockId(block, blockIndex, options.blockPrefix);
    const hiddenRows = block.rows.slice(options.contextLines, block.rows.length - options.contextLines);
    const hiddenCount = hiddenRows.length;
    const expandStep = getCollapseExpandStep(hiddenCount);
    const revealedRanges = getCollapseRevealRanges(expandedBlocks, blockId, hiddenCount);

    if (
      revealedRanges.length === 1
      && revealedRanges[0]!.start === 0
      && revealedRanges[0]!.end === hiddenCount - 1
    ) {
      block.rows.forEach((row) => {
        result.push(options.buildRowItem(row));
      });
      return;
    }

    for (let index = 0; index < options.contextLines; index += 1) {
      result.push(options.buildRowItem(block.rows[index]!));
    }

    let cursor = 0;
    revealedRanges.forEach((range) => {
      if (cursor < range.start) {
        result.push(options.buildCollapseItem({
          blockId,
          count: range.start - cursor,
          fromIdx: hiddenRows[cursor]!.lineIdx,
          toIdx: hiddenRows[range.start - 1]!.lineIdx,
          hiddenStart: cursor,
          hiddenEnd: range.start - 1,
          expandStep,
        }));
      }

      for (let index = range.start; index <= range.end; index += 1) {
        result.push(options.buildRowItem(hiddenRows[index]!));
      }
      cursor = range.end + 1;
    });

    if (cursor < hiddenCount) {
      result.push(options.buildCollapseItem({
        blockId,
        count: hiddenCount - cursor,
        fromIdx: hiddenRows[cursor]!.lineIdx,
        toIdx: hiddenRows[hiddenCount - 1]!.lineIdx,
        hiddenStart: cursor,
        hiddenEnd: hiddenCount - 1,
        expandStep,
      }));
    }

    for (let index = block.rows.length - options.contextLines; index < block.rows.length; index += 1) {
      result.push(options.buildRowItem(block.rows[index]!));
    }
  });

  return result;
}

export function findCollapsedRowTarget<RowT extends { lineIdx: number }>(
  blocks: CollapsibleRowBlock<RowT>[],
  expandedBlocks: CollapseExpansionState,
  targetLineIdx: number,
  options: {
    contextLines: number;
    blockPrefix: string;
    rowHasLineIdx?: (row: RowT, lineIdx: number) => boolean;
  },
): CollapsedRowTarget | null {
  const rowHasLineIdx = options.rowHasLineIdx ?? ((row: RowT, lineIdx: number) => row.lineIdx === lineIdx);

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    if (block.kind !== 'equal' || block.rows.length <= options.contextLines * 2) {
      continue;
    }

    const blockId = buildCollapseBlockId(block, blockIndex, options.blockPrefix);
    const hiddenRows = block.rows.slice(options.contextLines, block.rows.length - options.contextLines);
    const targetIndex = hiddenRows.findIndex((row) => rowHasLineIdx(row, targetLineIdx));
    if (targetIndex < 0) continue;

    const revealedRanges = getCollapseRevealRanges(expandedBlocks, blockId, hiddenRows.length);
    let cursor = 0;

    for (const range of revealedRanges) {
      if (targetIndex < range.start) {
        return {
          blockId,
          hiddenStart: cursor,
          hiddenEnd: range.start - 1,
          targetIndex,
        };
      }
      if (targetIndex <= range.end) {
        return null;
      }
      cursor = range.end + 1;
    }

    return {
      blockId,
      hiddenStart: cursor,
      hiddenEnd: hiddenRows.length - 1,
      targetIndex,
    };
  }

  return null;
}
