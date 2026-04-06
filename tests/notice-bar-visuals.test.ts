import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '../src/context/i18n';
import DiffSourceNoticeBar from '../src/components/diff/DiffSourceNoticeBar';
import WorkbookArtifactNoticeBar from '../src/components/workbook/WorkbookArtifactNoticeBar';

function renderWithI18n(element: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, element),
  );
}

test('WorkbookArtifactNoticeBar uses the shared neutral indicator accent', () => {
  const html = renderWithI18n(
    React.createElement(WorkbookArtifactNoticeBar, { onClose: () => {} }),
  );

  assert.match(html, /工作簿产物文件发生了变化|artifact/i);
  assert.match(html, /var\(--acc2\)/);
});

test('DiffSourceNoticeBar uses the shared neutral indicator accent', () => {
  const html = renderWithI18n(
    React.createElement(DiffSourceNoticeBar, {
      code: 'unversioned-working-copy',
      onClose: () => {},
    }),
  );

  assert.match(html, /未纳入 SVN 版本管理|unversioned/i);
  assert.match(html, /var\(--acc2\)/);
});
