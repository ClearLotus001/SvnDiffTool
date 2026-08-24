import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import DialogFrame from '../src/components/shared/DialogFrame';

test('DialogFrame exposes its title and description and can receive fallback focus', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DialogFrame,
      {
        animationState: 'entered',
        className: 'dialog-test',
        titleId: 'dialog-title',
        descriptionId: 'dialog-description',
        onClose: () => {},
      },
      React.createElement('h2', { id: 'dialog-title' }, 'Dialog title'),
      React.createElement('p', { id: 'dialog-description' }, 'Dialog description'),
    ),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-labelledby="dialog-title"/);
  assert.match(html, /aria-describedby="dialog-description"/);
  assert.match(html, /tabindex="-1"/);
});
