import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import CollapseJumpButton, { getCollapseJumpBadgeWidth } from '../src/components/diff/CollapseJumpButton';
import { I18nProvider } from '../src/context/i18n';

test('collapse jump badge expands to contain long progress text', () => {
  assert.equal(getCollapseJumpBadgeWidth('1/9', false), 24);
  assert.equal(getCollapseJumpBadgeWidth('12/405', false), 45);
  assert.equal(getCollapseJumpBadgeWidth('405/405', false), 51);
});

test('docked collapse jump badge stays circular unless its index needs more room', () => {
  assert.equal(getCollapseJumpBadgeWidth('405', true), 24);
  assert.ok(getCollapseJumpBadgeWidth('1000', true) > 24);
});

test('workbook collapse navigation exposes the current sheet in its controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'zh-CN' },
      React.createElement(CollapseJumpButton, {
        onPrev: () => {},
        onNext: () => {},
        currentIndex: 6,
        totalCount: 6,
        contextLabel: '页签配置',
      }),
    ),
  );

  assert.match(markup, /当前页签：页签配置/);
  assert.match(markup, /当前折叠块 6\/6/);
});
