import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SplitRow } from '../src/types';
import {
  useWorkbookHorizontalDerivedState,
  type UseWorkbookHorizontalDerivedStateResult,
} from '../src/hooks/workbook/useWorkbookHorizontalDerivedState';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

const sectionRows: SplitRow[] = Array.from({ length: 4 }, (_, index) => {
  const rowNumber = index + 1;
  const lineText = createWorkbookRowLine(rowNumber, [`value-${rowNumber}`]);
  const line = {
    type: 'equal' as const,
    base: lineText,
    mine: lineText,
    baseLineNo: rowNumber,
    mineLineNo: rowNumber,
    baseCharSpans: null,
    mineCharSpans: null,
  };

  return {
    left: line,
    right: line,
    lineIdx: rowNumber,
    lineIdxs: [rowNumber],
  };
});

const activeWorkbookSection: Parameters<typeof useWorkbookHorizontalDerivedState>[0]['activeWorkbookSection'] = {
  name: 'Thing',
  displayName: 'Thing',
  changeType: 'equal',
  hasBaseSide: true,
  hasMineSide: true,
  renamePeerName: null,
  renameRole: null,
  startLineIdx: 0,
  endLineIdx: 4,
  maxColumns: 1,
  rowCount: 4,
  firstDataLineIdx: 1,
  firstDataRowNumber: 1,
};

function renderHorizontalDerivedState(
  overrides: Partial<Parameters<typeof useWorkbookHorizontalDerivedState>[0]> = {},
) {
  let captured: UseWorkbookHorizontalDerivedStateResult | null = null;

  function Probe() {
    captured = useWorkbookHorizontalDerivedState({
      activeWorkbookSection,
      sectionRows,
      activeSheetCacheKey: 'Thing',
      collapseBlockPrefix: 'thing',
      protectedLineIdxSet: new Set<number>(),
      activeHiddenRows: [],
      activeHiddenColumns: [],
      stickyHeaderFreezeRowNumber: 1,
      freezeRowNumber: 1,
      expandedBlocks: {},
      collapseCtx: true,
      compareMode: 'strict',
      baseVersion: 'BASE',
      mineVersion: 'MINE',
      baseWorkbookMetadata: null,
      mineWorkbookMetadata: null,
      showHiddenColumns: false,
      ...overrides,
    });

    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  if (!captured) throw new Error('expected captured derived state');
  return captured as UseWorkbookHorizontalDerivedStateResult;
}

test('useWorkbookHorizontalDerivedState reuses collapse/item derivations for equivalent expanded-block signatures', () => {
  const first = renderHorizontalDerivedState({
    expandedBlocks: {},
  });
  const second = renderHorizontalDerivedState({
    expandedBlocks: {},
  });

  assert.equal(first.collapsedItemsMeasured, second.collapsedItemsMeasured);
  assert.equal(first.itemsMeasured, second.itemsMeasured);
  assert.equal(first.itemHeights, second.itemHeights);
});

test('useWorkbookHorizontalDerivedState reuses hidden-row overlay derivations for equivalent hidden-row signatures', () => {
  const first = renderHorizontalDerivedState({
    activeHiddenRows: [2],
  });
  const second = renderHorizontalDerivedState({
    activeHiddenRows: [2],
  });

  assert.equal(first.renderItemsMeasured, second.renderItemsMeasured);
  assert.equal(first.itemsMeasured, second.itemsMeasured);
  assert.equal(first.itemHeights, second.itemHeights);
});
