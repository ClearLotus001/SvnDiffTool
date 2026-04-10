import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  useWorkbookHorizontalBodyLayout,
  type WorkbookHorizontalBodyLayoutResult,
} from '../src/hooks/workbook/useWorkbookHorizontalBodyLayout';
import { createWorkbookRowLine } from '../src/utils/workbook/workbookDisplay';

test('useWorkbookHorizontalBodyLayout exposes stable row frames alongside body segments', () => {
  const items = [
    {
      kind: 'split-line' as const,
      lineIdx: 1,
      row: {
        left: {
          type: 'equal' as const,
          base: createWorkbookRowLine(1, ['A']),
          mine: createWorkbookRowLine(1, ['A']),
          baseLineNo: 1,
          mineLineNo: 1,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        right: {
          type: 'equal' as const,
          base: createWorkbookRowLine(1, ['A']),
          mine: createWorkbookRowLine(1, ['A']),
          baseLineNo: 1,
          mineLineNo: 1,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        lineIdx: 1,
        lineIdxs: [1],
      },
    },
    {
      kind: 'split-line' as const,
      lineIdx: 2,
      row: {
        left: {
          type: 'equal' as const,
          base: createWorkbookRowLine(2, ['B']),
          mine: createWorkbookRowLine(2, ['B']),
          baseLineNo: 2,
          mineLineNo: 2,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        right: {
          type: 'equal' as const,
          base: createWorkbookRowLine(2, ['B']),
          mine: createWorkbookRowLine(2, ['B']),
          baseLineNo: 2,
          mineLineNo: 2,
          baseCharSpans: null,
          mineCharSpans: null,
        },
        lineIdx: 2,
        lineIdxs: [2],
      },
    },
  ];

  let captured: WorkbookHorizontalBodyLayoutResult | null = null;
  function Probe() {
    captured = useWorkbookHorizontalBodyLayout({
      items,
      startIdx: 0,
      endIdx: items.length,
      guidedHunkRange: null,
      activeSearchLineIdx: -1,
      searchMatchSet: new Set<number>(),
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));

  if (!captured) throw new Error('expected resolved body layout');
  const resolved = captured as WorkbookHorizontalBodyLayoutResult;
  assert.equal(resolved.bodySegments.length, 1);
  assert.equal(resolved.bodySegments[0]?.kind, 'rows');
  assert.deepEqual([...resolved.rowFramesByKey.values()], [
    { top: 0, height: 24 },
    { top: 24, height: 24 },
  ]);
});
