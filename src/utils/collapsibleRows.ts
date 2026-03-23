import { getExpandedHiddenCount, type CollapseExpansionState } from './collapseState';

export interface CollapsibleRowBlock<RowT extends { lineIdx: number }> {
  kind: 'equal' | 'change';
  rows: RowT[];
  startLineIdx: number;
  endLineIdx: number;
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
    }) => TCollapseItem;
  },
): Array<TRowItem | TCollapseItem> {
  if (!collapseCtx) {
    return blocks.flatMap(block => block.rows.map(options.buildRowItem));
  }

  const result: Array<TRowItem | TCollapseItem> = [];

  blocks.forEach((block) => {
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

    const blockId = `${options.blockPrefix}-${block.startLineIdx}-${block.endLineIdx}`;
    const hiddenCount = block.rows.length - (options.contextLines * 2);
    const expandedHiddenCount = Math.min(hiddenCount, getExpandedHiddenCount(expandedBlocks, blockId));

    if (expandedHiddenCount >= hiddenCount) {
      block.rows.forEach((row) => {
        result.push(options.buildRowItem(row));
      });
      return;
    }

    for (let index = 0; index < options.contextLines; index += 1) {
      result.push(options.buildRowItem(block.rows[index]!));
    }
    for (let index = options.contextLines; index < options.contextLines + expandedHiddenCount; index += 1) {
      result.push(options.buildRowItem(block.rows[index]!));
    }

    result.push(options.buildCollapseItem({
      blockId,
      count: hiddenCount - expandedHiddenCount,
      fromIdx: block.rows[options.contextLines + expandedHiddenCount]!.lineIdx,
      toIdx: block.rows[block.rows.length - options.contextLines - 1]!.lineIdx,
    }));

    for (let index = block.rows.length - options.contextLines; index < block.rows.length; index += 1) {
      result.push(options.buildRowItem(block.rows[index]!));
    }
  });

  return result;
}
