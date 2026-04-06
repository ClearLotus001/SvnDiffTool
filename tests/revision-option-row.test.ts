import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import RevisionOptionRow from '../src/components/navigation/RevisionOptionRow';

test('RevisionOptionRow uses accent selection styling instead of add-diff colors', () => {
  const html = renderToStaticMarkup(
    React.createElement(RevisionOptionRow, {
      option: {
        id: 'r123',
        revision: 'r123',
        title: 'Revision 123',
        author: 'alice',
        date: '2026-04-06',
        message: 'selected row',
        kind: 'revision',
      },
      selected: true,
      hovered: false,
      searchQuery: '',
      highlightStyle: {},
      onSelect: () => {},
      onHover: () => {},
      onLeave: () => {},
    }),
  );

  assert.match(html, /var\(--acc2\)/);
  assert.doesNotMatch(html, /var\(--diff-add-border\)|var\(--diff-add-bg\)|var\(--diff-add-hl\)/);
});
