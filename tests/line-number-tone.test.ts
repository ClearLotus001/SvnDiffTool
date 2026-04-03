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
