import test from 'node:test';
import assert from 'node:assert/strict';

import { cssAlpha, cssVar } from '../src/theme/cssUtils';
import {
  resolveTextDiffCssPalette,
  resolveTextInlineBackground,
} from '../src/utils/diff/textDiffVisuals';

test('modify tone exposes the shared yellow diff palette', () => {
  assert.deepEqual(resolveTextDiffCssPalette('modify'), {
    rowBackground: cssVar('chgBg'),
    accent: cssVar('chgTx'),
    prefix: cssVar('chgTx'),
    inlineHighlight: cssAlpha('chgTx', '40'),
  });
});

test('replacement lines keep row background in split views when no higher-priority overlay exists', () => {
  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: false,
    isRangeSelected: false,
  }), cssVar('chgBg'));
});

test('search, selection, and explicit row surfaces suppress inline row background', () => {
  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: true,
    isRangeSelected: false,
  }), undefined);

  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: false,
    isRangeSelected: true,
  }), undefined);

  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: false,
    isRangeSelected: false,
    hasRowSurfaceOverride: true,
  }), undefined);
});
