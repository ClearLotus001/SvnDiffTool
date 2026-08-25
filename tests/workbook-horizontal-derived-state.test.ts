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

const differenceSectionRows: SplitRow[] = sectionRows.map((row, index) => (
  index === 2
    ? {
        ...row,
        left: row.left ? { ...row.left, type: 'delete' as const } : null,
        right: row.right ? { ...row.right, type: 'add' as const } : null,
      }
    : row
));

const precomputedDifferenceRows: SplitRow[] = sectionRows.map((row, index) => (
  index === 2
    ? {
        ...row,
        workbookRowDelta: {
          cellDeltas: new Map(),
          changedColumns: [1],
          strictOnlyColumns: [],
          changedCount: 1,
          hasChanges: true,
          tone: 'mixed' as const,
        },
      }
    : row
));

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
      renderPolicy: { mode: 'full', maskIrrelevantCells: false },
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

test('useWorkbookHorizontalDerivedState can project only changed workbook rows', () => {
  const result = renderHorizontalDerivedState({
    sectionRows: differenceSectionRows,
    protectedLineIdxSet: new Set([1]),
    renderPolicy: { mode: 'differences-only', maskIrrelevantCells: true },
  });

  assert.deepEqual(result.frozenRows.map((row) => row.lineIdx), [1]);
  assert.deepEqual(result.items.map((item) => item.kind), ['split-line']);
  const item = result.items[0];
  assert.equal(item?.kind === 'split-line' ? item.lineIdx : null, 3);
});

test('differences-only mode trusts precomputed cell deltas over equal line shells', () => {
  const result = renderHorizontalDerivedState({
    sectionRows: precomputedDifferenceRows,
    protectedLineIdxSet: new Set([1]),
    renderPolicy: { mode: 'differences-only', maskIrrelevantCells: true },
  });

  assert.deepEqual(result.frozenRows.map((row) => row.lineIdx), [1]);
  assert.deepEqual(result.items.map((item) => item.kind === 'split-line' ? item.lineIdx : null), [3]);
});

test('differences-only mode keeps explicitly protected search rows visible', () => {
  const result = renderHorizontalDerivedState({
    protectedLineIdxSet: new Set([1, 2]),
    renderPolicy: { mode: 'differences-only', maskIrrelevantCells: true },
  });

  assert.deepEqual(result.frozenRows.map((row) => row.lineIdx), [1]);
  assert.deepEqual(result.items.map((item) => item.kind === 'split-line' ? item.lineIdx : null), [2]);
});

test('differences-only cache stays isolated from the full-row projection', () => {
  const full = renderHorizontalDerivedState({
    sectionRows: differenceSectionRows,
    collapseCtx: false,
    renderPolicy: { mode: 'full', maskIrrelevantCells: false },
  });
  const differences = renderHorizontalDerivedState({
    sectionRows: differenceSectionRows,
    collapseCtx: false,
    renderPolicy: { mode: 'differences-only', maskIrrelevantCells: true },
  });

  assert.notEqual(full.collapsedItemsMeasured, differences.collapsedItemsMeasured);
  assert.equal(full.items.length, 3);
  assert.equal(differences.items.length, 1);
});
