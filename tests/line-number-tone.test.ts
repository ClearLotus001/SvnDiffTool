import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import Ln from '../src/components/diff/Ln';
import {
  resolveLineNumberColor,
  resolveSharedWorkbookLineNumberTone,
  resolveWorkbookStackedLineNumberTone,
} from '../src/utils/diff/lineNumberTone';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Ln uses side-specific tones for base and mine line numbers', () => {
  const baseHtml = renderToStaticMarkup(
    React.createElement(Ln, {
      n: 12,
      tone: 'base',
    }),
  );
  const mineHtml = renderToStaticMarkup(
    React.createElement(Ln, {
      n: 12,
      tone: 'mine',
    }),
  );

  assert.match(baseHtml, new RegExp(`color:${escapeRegExp(resolveLineNumberColor('base'))}`));
  assert.match(mineHtml, new RegExp(`color:${escapeRegExp(resolveLineNumberColor('mine'))}`));
});

test('Ln renders a seven-character Git attribution badge without ellipsis', () => {
  const html = renderToStaticMarkup(
    React.createElement(Ln, {
      n: 1234,
      tone: 'base',
      blame: {
        revision: '9a36908ae7',
        author: 'ClearLotus',
        date: '2026-03-26 11:23',
        uncommitted: false,
      },
    }),
  );

  assert.match(html, />9a36908</);
  assert.doesNotMatch(html, /text-overflow:ellipsis/);
  assert.match(html, /width:84px/);
});

test('base and mine attribution badges share one shape and only vary their color token', () => {
  const blame = {
    revision: '9a36908ae7',
    author: 'ClearLotus',
    date: '2026-03-26 11:23',
    uncommitted: false,
  };
  const baseHtml = renderToStaticMarkup(
    React.createElement(Ln, { n: 12, tone: 'base', blame }),
  );
  const mineHtml = renderToStaticMarkup(
    React.createElement(Ln, { n: 12, tone: 'mine', blame }),
  );

  for (const html of [baseHtml, mineHtml]) {
    assert.match(html, /data-line-blame-badge="true"/);
    assert.match(html, /height:15px/);
    assert.match(html, /border-radius:4px/);
    assert.match(html, /padding:0 3px/);
  }
  assert.match(baseHtml, /var\(--acc2\)/);
  assert.match(mineHtml, /var\(--accent\)/);
  assert.doesNotMatch(mineHtml, /var\(--acc\)/);
});

test('shared workbook line number tone only uses side accents for single-sided rows', () => {
  assert.equal(resolveSharedWorkbookLineNumberTone(true, false), 'base');
  assert.equal(resolveSharedWorkbookLineNumberTone(false, true), 'mine');
  assert.equal(resolveSharedWorkbookLineNumberTone(true, true), 'neutral');
});

test('stacked workbook line numbers use side colors when both bands are visible', () => {
  assert.equal(resolveWorkbookStackedLineNumberTone({
    side: 'mine',
    hasCompanionBand: true,
    tone: 'delete',
    hasBaseRow: true,
    hasMineRow: false,
  }), 'mine');
  assert.equal(resolveWorkbookStackedLineNumberTone({
    side: 'base',
    hasCompanionBand: true,
    tone: 'add',
    hasBaseRow: false,
    hasMineRow: true,
  }), 'base');
});
