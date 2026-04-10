import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ROW_H } from '../src/hooks/virtualization/useVirtual';
import {
  useWorkbookCompareBodyLayout,
  type WorkbookCompareBodyLayoutResult,
} from '../src/hooks/workbook/useWorkbookCompareBodyLayout';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

function createRow(lineIdx: number, rowNumber: number, value: string) {
  return {
    left: {
      type: 'equal' as const,
      base: createWorkbookRowLine(rowNumber, [value]),
      mine: createWorkbookRowLine(rowNumber, [value]),
      baseLineNo: rowNumber,
      mineLineNo: rowNumber,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    right: {
      type: 'equal' as const,
      base: createWorkbookRowLine(rowNumber, [value]),
      mine: createWorkbookRowLine(rowNumber, [value]),
      baseLineNo: rowNumber,
      mineLineNo: rowNumber,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    lineIdx,
    lineIdxs: [lineIdx],
  };
}

test('useWorkbookCompareBodyLayout exposes row frames for columns mode without rescanning body segments', () => {
  const rowA = createRow(10, 2, 'A');
  const rowB = createRow(11, 3, 'B');
  const items = [
    { kind: 'row' as const, row: rowA, lineIdx: 10 },
    { kind: 'row' as const, row: rowB, lineIdx: 11 },
  ];

  let captured: WorkbookCompareBodyLayoutResult | null = null;
  function Probe() {
    captured = useWorkbookCompareBodyLayout({
      mode: 'columns',
      stackedVirtualItems: [],
      startIdx: 0,
      endIdx: items.length,
      items,
      guidedHunkRange: null,
      activeSearchLineIdx: -1,
      searchMatchSet: new Set<number>(),
      visibleFrozenStackedCanvasRuns: [],
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured) throw new Error('expected resolved body layout');
  const resolved = captured as WorkbookCompareBodyLayoutResult;
  assert.equal(resolved.columnsBodySegments?.length, 1);
  assert.deepEqual([...resolved.rowFramesByKey.values()], [
    { top: 0, height: ROW_H },
    { top: ROW_H, height: ROW_H },
  ]);
});

test('useWorkbookCompareBodyLayout exposes row frames for stacked mode with per-row heights', () => {
  const rowA = createRow(10, 2, 'A');
  const rowB = createRow(11, 3, 'B');

  let captured: WorkbookCompareBodyLayoutResult | null = null;
  function Probe() {
    captured = useWorkbookCompareBodyLayout({
      mode: 'stacked',
      stackedVirtualItems: [{
        kind: 'rows',
        rows: [
          { row: rowA, renderMode: 'single-equal', height: ROW_H },
          { row: rowB, renderMode: 'double', height: ROW_H * 2 },
        ],
        height: ROW_H * 3,
        sourceStartItemIndex: 0,
        sourceEndItemIndex: 1,
        groupKey: 'stacked:0:1',
        hasVerticalMerge: false,
        baseTrack: [],
        mineTrack: [],
      }],
      startIdx: 0,
      endIdx: 1,
      items: [
        { kind: 'row' as const, row: rowA, lineIdx: 10 },
        { kind: 'row' as const, row: rowB, lineIdx: 11 },
      ],
      guidedHunkRange: null,
      activeSearchLineIdx: -1,
      searchMatchSet: new Set<number>(),
      visibleFrozenStackedCanvasRuns: [],
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured) throw new Error('expected resolved body layout');
  const resolved = captured as WorkbookCompareBodyLayoutResult;
  assert.equal(resolved.bodySegments.length, 1);
  assert.deepEqual([...resolved.rowFramesByKey.values()], [
    { top: 0, height: ROW_H },
    { top: ROW_H, height: ROW_H * 2 },
  ]);
});
