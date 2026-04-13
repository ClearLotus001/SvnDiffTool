import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import WorkbookFormulaBar from '../src/components/workbook/WorkbookFormulaBar';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import type { WorkbookSelectedCell, WorkbookSelectionState } from '../src/types';

function renderFormulaBar(
  selection: WorkbookSelectionState,
  props?: { baseTitle?: string; mineTitle?: string },
): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: 'light' },
      React.createElement(
        I18nProvider,
        { initialLocale: 'zh-CN' },
        React.createElement(WorkbookFormulaBar, {
          selection,
          fontSize: 13,
          baseTitle: props?.baseTitle,
          mineTitle: props?.mineTitle,
          onFreezeRow: () => {},
          onFreezeColumn: () => {},
          onFreezePane: () => {},
          onUnfreezeRow: () => {},
          onUnfreezeColumn: () => {},
          onResetFreeze: () => {},
        }),
      ),
    ),
  );
}

function createCell(side: 'base' | 'mine', versionLabel: string): WorkbookSelectedCell {
  return {
    kind: 'cell',
    sheetName: 'Thing',
    side,
    versionLabel,
    rowNumber: 2,
    colIndex: 1,
    colLabel: 'B',
    address: 'B2',
    value: '42',
    formula: '=40+2',
  };
}

test('formula bar uses active compare titles for revision-vs-revision selection', () => {
  const selection: WorkbookSelectionState = {
    anchor: createCell('mine', 'r1827002'),
    primary: createCell('mine', 'r1827002'),
    items: [createCell('mine', 'r1827002')],
  };

  const html = renderFormulaBar(selection, {
    baseTitle: '版本 A',
    mineTitle: '版本 B',
  });

  assert.match(html, /版本 B · r1827002/);
  assert.doesNotMatch(html, /本地工作副本/);
});

test('formula bar shows the rectangular selection range in the address field', () => {
  const first = createCell('base', 'BASE');
  const second = {
    ...first,
    rowNumber: 3,
    colIndex: 3,
    colLabel: 'D',
    address: 'D3',
  };
  const selection: WorkbookSelectionState = {
    anchor: first,
    primary: second,
    items: [
      first,
      { ...first, colIndex: 2, colLabel: 'C', address: 'C2' },
      { ...first, colIndex: 3, colLabel: 'D', address: 'D2' },
      { ...first, rowNumber: 3, address: 'B3' },
      { ...first, rowNumber: 3, colIndex: 2, colLabel: 'C', address: 'C3' },
      second,
    ],
  };

  const html = renderFormulaBar(selection);

  assert.match(html, />B2:D3</);
  assert.match(html, /已选 6 个单元格/);
});
