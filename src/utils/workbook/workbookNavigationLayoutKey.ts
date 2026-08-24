import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import { buildWorkbookExpandedBlocksSignature } from '@/utils/workbook/workbookExpandedBlocksSignature';

export function buildWorkbookNavigationLayoutKey(params: {
  layout: 'columns' | 'split-h' | 'stacked';
  expandedBlocks: CollapseExpansionState;
  itemCount: number;
  stackedItemCount?: number;
  totalHeight: number;
}): string {
  return [
    params.layout,
    buildWorkbookExpandedBlocksSignature(params.expandedBlocks),
    params.itemCount,
    params.stackedItemCount ?? 0,
    params.totalHeight,
  ].join(':');
}
