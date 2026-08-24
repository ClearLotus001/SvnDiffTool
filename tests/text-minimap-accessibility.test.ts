import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MiniMap from '../src/components/diff/MiniMap';
import { I18nProvider } from '../src/context/i18n';

test('text minimap exposes the same keyboard navigation surface as workbook minimap', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'en-US' },
      React.createElement(MiniMap, {
        segments: [],
        scrollRef: createRef<HTMLDivElement>(),
        contentHeight: 0,
      }),
    ),
  );

  assert.match(html, /role="navigation"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /File diff mini map; use arrow and page keys to scroll/);
});
