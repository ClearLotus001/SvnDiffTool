import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import Ln from '../src/components/diff/Ln';
import { THEMES } from '../src/theme';
import { resolveSharedWorkbookLineNumberTone } from '../src/utils/diff/lineNumberTone';

test('Ln uses side-specific tones for base and mine line numbers', () => {
  const baseHtml = renderToStaticMarkup(
    React.createElement(Ln, {
      n: 12,
      T: THEMES.light,
      tone: 'base',
    }),
  );
  const mineHtml = renderToStaticMarkup(
    React.createElement(Ln, {
      n: 12,
      T: THEMES.light,
      tone: 'mine',
    }),
  );

  assert.match(baseHtml, /color:#6a9bccbf/);
  assert.match(mineHtml, /color:#d97757bf/);
});

test('shared workbook line number tone only uses side accents for single-sided rows', () => {
  assert.equal(resolveSharedWorkbookLineNumberTone(true, false), 'base');
  assert.equal(resolveSharedWorkbookLineNumberTone(false, true), 'mine');
  assert.equal(resolveSharedWorkbookLineNumberTone(true, true), 'neutral');
});
