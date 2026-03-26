import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import WorkbookCompareTooltip from '../src/components/WorkbookCompareTooltip';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { THEMES } from '../src/theme';
import type { WorkbookCellDelta } from '../src/types';

function renderTooltip(compareCell: WorkbookCellDelta): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(WorkbookCompareTooltip, { compareCell }),
      ),
    ),
  );
}

function createCompareCell(overrides: Partial<WorkbookCellDelta>): WorkbookCellDelta {
  return {
    column: 0,
    baseCell: { value: 'before', formula: '' },
    mineCell: { value: 'after', formula: '' },
    changed: true,
    masked: false,
    strictOnly: false,
    kind: 'modify',
    hasBaseContent: true,
    hasMineContent: true,
    hasContent: true,
    ...overrides,
  };
}

test('tooltip shows cleared badge and hint for paired delete-like cells', () => {
  const html = renderTooltip(createCompareCell({
    baseCell: { value: 'before', formula: '' },
    mineCell: { value: '', formula: '' },
    kind: 'delete',
    hasBaseContent: true,
    hasMineContent: false,
  }));

  assert.match(html, /删空/);
  assert.match(html, /提示：本地侧已将该单元格清空，基线侧仍有内容。/);
  assert.match(html, /基线/);
  assert.match(html, /本地/);
  assert.match(html, /before/);
  assert.match(html, /—/);
});

test('tooltip shows added badge and hint for paired add-like cells', () => {
  const html = renderTooltip(createCompareCell({
    baseCell: { value: '', formula: '' },
    mineCell: { value: 'after', formula: '' },
    kind: 'add',
    hasBaseContent: false,
    hasMineContent: true,
  }));

  assert.match(html, /新增内容/);
  assert.match(html, /提示：本地侧为该单元格新增了内容，基线侧原本为空。/);
  assert.match(html, /基线/);
  assert.match(html, /本地/);
  assert.match(html, /after/);
  assert.match(html, /—/);
});
