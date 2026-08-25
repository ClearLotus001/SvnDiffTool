import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HomeStartPanel from '../src/components/app/HomeStartPanel';
import { I18nProvider } from '../src/context/i18n';

test('HomeStartPanel uses the shared blue teal and gold action palette', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'en-US' },
      React.createElement(HomeStartPanel, {
        error: '',
        isElectron: true,
        onPickWorkingCopy: () => {},
        onOpenLocalFileCompare: () => {},
        onOpenSvnConfig: () => {},
      }),
    ),
  );

  assert.match(html, /home-action-card--compare[^>]+--home-card-accent:var\(--accent\)/);
  assert.match(html, /home-action-card--primary[^>]+--home-card-accent:var\(--acc2\)/);
  assert.match(html, /home-action-card--svn[^>]+--home-card-accent:var\(--version-mine\)/);
  assert.equal((html.match(/home-action-card__button/g) ?? []).length, 3);
});
