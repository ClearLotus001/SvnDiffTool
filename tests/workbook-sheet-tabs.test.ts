import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '../src/context/i18n';
import WorkbookSheetTabs from '../src/components/workbook/WorkbookSheetTabs';
import type { WorkbookSection } from '../src/types';

function createSection(index: number): WorkbookSection {
  return {
    name: `Sheet${index + 1}`,
    displayName: `Sheet${index + 1}`,
    changeType: 'equal',
    hasBaseSide: true,
    hasMineSide: true,
    renamePeerName: null,
    renameRole: null,
    startLineIdx: index * 10,
    endLineIdx: (index * 10) + 9,
    maxColumns: 5,
    rowCount: 10,
    firstDataLineIdx: (index * 10) + 1,
    firstDataRowNumber: 1,
  };
}

test('WorkbookSheetTabs renders collapsed unchanged groups while keeping the active sheet visible', () => {
  const sections = Array.from({ length: 8 }, (_, index) => createSection(index));
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'zh-CN' },
      React.createElement(WorkbookSheetTabs, {
        sections,
        activeIndex: 4,
        onSelect: () => {},
        fontSize: 13,
        collapseUnchanged: true,
      }),
    ),
  );

  assert.equal((markup.match(/data-testid="workbook-sheet-collapse"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-collapse-visual="compressed-range"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-collapse-density="compact"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-collapse-arrows="wrap-count"/g) ?? []).length, 2);
  assert.equal((markup.match(/lucide-chevron-right/g) ?? []).length, 2);
  assert.equal((markup.match(/lucide-chevron-left/g) ?? []).length, 2);
  assert.equal((markup.match(/data-testid="workbook-sheet-tab"/g) ?? []).length, 3);
  assert.match(markup, /Sheet5/);
  assert.doesNotMatch(markup, /Sheet2/);
});
