import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchBar from '../src/components/diff/SearchBar';
import { I18nProvider } from '../src/context/i18n';

test('SearchBar exposes an invalid regex instead of reporting no results', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'en-US' },
      React.createElement(SearchBar, {
        query: '[',
        isRegex: true,
        isCaseSensitive: false,
        isPatternInvalid: true,
        isWorkbookMode: false,
        workbookSearchScope: 'all',
        activeSheetName: null,
        matchCount: 0,
        totalMatchCount: 0,
        resultsTruncated: false,
        activeIdx: -1,
        isSearching: false,
        resolveResult: () => null,
        onSearch: () => {},
        onPreviewNav: () => {},
        onNav: () => {},
        onJump: () => {},
        onClose: () => {},
      }),
    ),
  );

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /Invalid regular expression/);
  assert.doesNotMatch(html, />No results</);
});
