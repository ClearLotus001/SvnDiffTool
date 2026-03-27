import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import WorkbookArtifactNoticeBar from '../src/components/workbook/WorkbookArtifactNoticeBar';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { THEMES } from '../src/theme';

test('WorkbookArtifactNoticeBar renders prominent artifact-only diff copy', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(WorkbookArtifactNoticeBar, {
          onClose: () => {},
        }),
      ),
    ),
  );

  assert.match(html, /当前对比没有单元格差异，但工作簿产物文件发生了变化/);
  assert.match(html, /这类变化通常来自非单元格层/);
});
