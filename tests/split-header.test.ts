import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SplitHeader from '../src/components/SplitHeader';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { THEMES } from '../src/theme';
import type { SvnRevisionInfo } from '../src/types';

function createRevisionInfo(overrides: Partial<SvnRevisionInfo>): SvnRevisionInfo {
  return {
    id: 'base',
    revision: 'r1824983',
    title: 'r1824983',
    author: 'winxzhang',
    date: '2026-03-24 23:33',
    message: '修复版本切换后日志摘要缺失的问题',
    kind: 'revision',
    ...overrides,
  };
}

test('SplitHeader keeps revision picker compact and shows the revision log as a full-row summary', () => {
  const baseRevisionInfo = createRevisionInfo({});
  const mineRevisionInfo = createRevisionInfo({
    id: 'mine',
    revision: 'LOCAL',
    title: '本地版本',
    author: 'winxzhang',
    date: '2026-03-24 23:33',
    message: '本地联调版本',
    kind: 'working-copy',
  });

  const html = renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(SplitHeader, {
          baseName: '[1824983]新物品表.xlsm',
          mineName: '[LOCAL]新物品表.xlsm',
          layout: 'split-h',
          isWorkbookMode: true,
          baseRevisionInfo,
          mineRevisionInfo,
          revisionOptions: [baseRevisionInfo, mineRevisionInfo],
          canSwitchRevisions: true,
          onRevisionChange: () => {},
        }),
      ),
    ),
  );

  assert.match(html, /修复版本切换后日志摘要缺失的问题/);
  assert.match(html, /本地联调版本/);
  assert.match(html, /1824983/);
  assert.match(html, /LOCAL/);
  assert.doesNotMatch(html, /提交日志/);
  assert.doesNotMatch(html, /winxzhang · 2026-03-24 23:33/);
});
