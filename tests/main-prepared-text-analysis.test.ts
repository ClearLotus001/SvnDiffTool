import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareTextDiffAnalysis } from '../electron/main/text/diff';
import { computeDiff } from '../src/engine/text/diff';
import {
  arePreparedTextAnalysesEquivalent,
  buildLegacyPreparedTextAnalysis,
} from '../src/utils/diff/preparedTextAnalysis';

test('main prepareTextDiffAnalysis matches legacy prepared analysis for aligned replacements', () => {
  const baseText = [
    'header',
    'alpha value',
    'beta value',
    'shared line',
    'removed line',
    'tail',
  ].join('\n');
  const mineText = [
    'header',
    'alpha value updated',
    'beta value',
    'shared line',
    'added line',
    'tail',
  ].join('\n');

  const prepared = prepareTextDiffAnalysis(baseText, mineText);
  const legacy = buildLegacyPreparedTextAnalysis(computeDiff(baseText, mineText));

  assert.equal(arePreparedTextAnalysesEquivalent(prepared, legacy), true);
});

test('main prepareTextDiffAnalysis matches legacy prepared analysis for repetitive fallback-heavy input', () => {
  const baseLines = Array.from({ length: 8_000 }, (_, index) => (
    index % 3 === 0 ? 'shared repeated line' : `base-${Math.floor(index / 9)}`
  ));
  const mineLines = [...baseLines];
  mineLines.splice(2_500, 0, ...Array.from({ length: 120 }, (_, index) => `inserted-${index % 7}`));
  for (let index = 1_000; index < mineLines.length; index += 777) {
    mineLines[index] = `mine-updated-${Math.floor(index / 13)}`;
  }

  const baseText = baseLines.join('\n');
  const mineText = mineLines.join('\n');

  const prepared = prepareTextDiffAnalysis(baseText, mineText);
  const legacy = buildLegacyPreparedTextAnalysis(computeDiff(baseText, mineText));

  assert.equal(arePreparedTextAnalysesEquivalent(prepared, legacy), true);
  assert.equal(prepared.diffLines.length, legacy.diffLines.length);
});
