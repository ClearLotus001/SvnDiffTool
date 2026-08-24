import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import DiffLoadErrorNoticeBar from '../src/components/diff/DiffLoadErrorNoticeBar';
import { I18nProvider } from '../src/context/i18n';

test('DiffLoadErrorNoticeBar announces a recoverable loaded-view failure', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'en-US' },
      React.createElement(DiffLoadErrorNoticeBar, {
        message: 'Failed to load the selected revision.',
        onClose: () => {},
      }),
    ),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Comparison was not updated/);
  assert.match(html, /Failed to load the selected revision/);
});
