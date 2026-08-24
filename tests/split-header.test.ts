import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SplitHeader from '../src/components/navigation/SplitHeader';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
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
      { value: 'light' },
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
  assert.doesNotMatch(html, /\stitle="/);
  assert.match(html, /var\(--version-base\)/);
  assert.match(html, /var\(--version-mine\)/);
});

test('SplitHeader shows distinct labels and full paths for a two-file comparison', () => {
  const basePath = 'E:\\QSM_TDRS\\Publish\\Tools\\TDR_res\\Excel\\[1]新物品表.xlsm';
  const minePath = 'E:\\QSM_TDRS\\Trunk\\Tools\\TDR_res\\Excel\\[1]新物品表.xlsm';
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: 'light' },
      React.createElement(
        I18nProvider,
        { initialLocale: 'zh-CN' },
        React.createElement(SplitHeader, {
          baseName: basePath,
          mineName: minePath,
          baseTitle: '基准文件',
          mineTitle: '对比文件',
          baseValueLabel: 'Publish · [1]新物品表.xlsm',
          mineValueLabel: 'Trunk · [1]新物品表.xlsm',
          isTwoFileCompare: true,
          layout: 'split-h',
          isWorkbookMode: true,
        }),
      ),
    ),
  );

  assert.match(html, /Publish · \[1\]新物品表\.xlsm/);
  assert.match(html, /Trunk · \[1\]新物品表\.xlsm/);
  assert.match(html, /E:\\QSM_TDRS\\Publish\\Tools\\TDR_res\\Excel\\\[1\]新物品表\.xlsm/);
  assert.match(html, /E:\\QSM_TDRS\\Trunk\\Tools\\TDR_res\\Excel\\\[1\]新物品表\.xlsm/);
  assert.match(html, />文件</);
  assert.doesNotMatch(html, />版本号</);
});
