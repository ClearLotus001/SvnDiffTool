import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import WorkbookCompareTooltip from '../src/components/workbook/WorkbookCompareTooltip';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { THEMES } from '../src/theme';
import type { WorkbookCellDelta } from '../src/types';

function renderTooltip(
  compareCell: WorkbookCellDelta,
  props?: { baseTitle?: string; mineTitle?: string },
): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(WorkbookCompareTooltip, { compareCell, ...props }),
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
  assert.match(html, /提示：本地工作副本已将该单元格清空，对比版本仍有内容。/);
  assert.match(html, /对比版本/);
  assert.match(html, /本地工作副本/);
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
  assert.match(html, /提示：本地工作副本为该单元格新增了内容，对比版本原本为空。/);
  assert.match(html, /对比版本/);
  assert.match(html, /本地工作副本/);
  assert.match(html, /after/);
  assert.match(html, /—/);
});

test('tooltip uses active side titles for revision-vs-revision compare', () => {
  const html = renderTooltip(createCompareCell({
    baseCell: { value: 'before', formula: '' },
    mineCell: { value: '', formula: '' },
    kind: 'delete',
    hasBaseContent: true,
    hasMineContent: false,
  }), {
    baseTitle: '版本 A',
    mineTitle: '版本 B',
  });

  assert.match(html, /提示：版本 B已将该单元格清空，版本 A仍有内容。/);
  assert.match(html, /版本 A/);
  assert.match(html, /版本 B/);
  assert.doesNotMatch(html, /对比版本/);
  assert.doesNotMatch(html, /本地工作副本/);
});

test('tooltip restores workbook logical line breaks instead of showing slash-normalized values', () => {
  const html = renderTooltip(createCompareCell({
    baseCell: { value: '六人个人竞速单局 / 我们恋爱吧 / 全魔法套装+A车', formula: '' },
    mineCell: { value: '六人个人竞速单局 / 我们恋爱吧 / 全魔法套装+A车', formula: '' },
  }));

  assert.doesNotMatch(html, /六人个人竞速单局 \/ 我们恋爱吧 \/ 全魔法套装\+A车/);
  assert.match(html, /六人个人竞速单局/);
  assert.match(html, /我们恋爱吧/);
  assert.match(html, /全魔法套装\+A车/);
  assert.doesNotMatch(html, /↵/);
});
