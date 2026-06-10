import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import WorkbookCompareStickyCanvas from '../src/components/workbook/WorkbookCompareStickyCanvas';

function renderCompareStickyCanvas(): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: 'light' },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(WorkbookCompareStickyCanvas, {
          mode: 'stacked',
          showColumnHeader: true,
          headerProps: {
            viewportWidth: 480,
            scrollRef: { current: null },
            freezeColumnCount: 1,
            contentWidth: 1200,
            sheetName: 'Thing',
            selection: {
              anchor: null,
              primary: null,
              items: [],
            },
            fontSize: 13,
            renderColumns: [],
            columnLayoutByColumn: new Map(),
            fixedSide: 'base',
            onSelectColumn: () => {},
          },
          frozenRowsPaneProps: {
            frozenRowsScrollRef: { current: null },
            isHovered: false,
            onHoverEnter: () => {},
            onHoverLeave: () => {},
            frozenRowsViewportHeight: 24,
            frozenRowsViewportIsOverflowing: false,
            frozenRowsRangeLabel: '1R',
            frozenRowsHeight: 24,
            minBodyWidth: 1200,
            mode: 'stacked',
            frozenRowsWindowOffsetTop: 0,
            visibleFrozenStackedCanvasRuns: [],
            visibleFrozenColumnsCanvasRows: [],
            visibleFrozenColumnsCanvasHeight: 0,
            viewportWidth: 480,
            scrollRef: { current: null },
            freezeColumnCount: 1,
            contentWidth: 1200,
            sheetName: 'Thing',
            baseVersion: 'BASE',
            mineVersion: 'MINE',
            headerRowNumber: 1,
            selection: {
              anchor: null,
              primary: null,
              items: [],
            },
            onSelectionRequest: () => {},
            onHoverChange: () => {},
            fontSize: 13,
            visibleColumns: [],
            renderColumns: [],
            columnLayoutByColumn: new Map(),
            baseMergedRanges: [],
            mineMergedRanges: [],
            rowEntryByRowNumber: {
              base: new Map(),
              mine: new Map(),
            },
            compareStateByRow: new Map(),
            compareCellsByRowNumber: {
              base: new Map(),
              mine: new Map(),
            },
            compareMode: 'strict',
          },
        }),
      ),
    ),
  );
}

test('WorkbookCompareStickyCanvas pins frozen rows pane to the left viewport like the header strip', () => {
  const html = renderCompareStickyCanvas();
  const matches = html.match(/position:sticky;left:0;width:480px;overflow:hidden/g) ?? [];

  assert.equal(matches.length, 2);
});
