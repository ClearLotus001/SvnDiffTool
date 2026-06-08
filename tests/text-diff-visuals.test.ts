import test from 'node:test';
import assert from 'node:assert/strict';

import { cssAlpha, cssVar } from '../src/theme/cssUtils';
import {
  composeTextRowBackground,
  resolveTextDiffCssPalette,
  resolveTextEmptySideBackground,
  resolveTextEmptySideBackgroundPosition,
  resolveTextInlineBackground,
  resolveTextSelectedRowBackground,
} from '../src/utils/diff/textDiffVisuals';

test('modify tone exposes the shared yellow diff palette', () => {
  assert.deepEqual(resolveTextDiffCssPalette('modify'), {
    rowBackground: cssVar('chgBg'),
    accent: cssVar('chgBrd'),
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

test('search keeps inline semantic row background available', () => {
  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: true,
    isRangeSelected: false,
  }), cssVar('chgBg'));
});

test('range selection and explicit row surfaces suppress inline row background', () => {
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

test('logical text selection keeps inline semantic diff background available', () => {
  assert.equal(resolveTextInlineBackground({
    tone: 'modify',
    hasSearchRanges: false,
    isRangeSelected: false,
    hasTextSelection: true,
  }), cssVar('chgBg'));
});

test('range selection keeps semantic diff row background as a lower layer', () => {
  assert.equal(resolveTextSelectedRowBackground({
    tone: 'add',
    isRangeSelected: true,
  }), cssVar('addBg'));

  assert.equal(resolveTextSelectedRowBackground({
    tone: 'delete',
    isRangeSelected: true,
  }), cssVar('delBg'));

  assert.equal(resolveTextSelectedRowBackground({
    tone: 'equal',
    isRangeSelected: true,
  }), undefined);
});

test('row background composition preserves overlay order', () => {
  assert.equal(
    composeTextRowBackground('selection-layer', cssVar('addBg')),
    `selection-layer, ${cssVar('addBg')}`,
  );
});

test('empty split side uses a continuous low-contrast placeholder surface', () => {
  const background = resolveTextEmptySideBackground({
    isRangeSelected: false,
  });

  assert.match(background, /repeating-linear-gradient\(135deg/);
  assert.match(background, /var\(--border-strong\)/);
  assert.match(background, /var\(--bg-surface-hover\)/);
  assert.doesNotMatch(background, /linear-gradient\(180deg/);
});

test('empty split side aligns placeholder texture by visual row index', () => {
  assert.equal(
    resolveTextEmptySideBackgroundPosition({
      visualRowIndex: 3,
      rowHeight: 24,
    }),
    '0 -72px',
  );

  assert.equal(
    resolveTextEmptySideBackgroundPosition({
      visualRowIndex: null,
      rowHeight: 24,
    }),
    undefined,
  );
});
