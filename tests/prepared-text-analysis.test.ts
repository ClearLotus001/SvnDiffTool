import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDiff, buildSplitRows } from '../src/engine/text/diff';
import { buildReplacementPairIndex, summarizeDiffChanges } from '../src/engine/text/textChangeAlignment';
import {
  buildReplacementPairIndexFromPairs,
  materializeSplitRowsFromDescriptors,
  prepareTextDiffAnalysisFromDiffLines,
} from '../src/utils/diff/preparedTextAnalysis';
import {
  arePreparedTextAnalysesEquivalent,
  buildLegacyPreparedTextAnalysis,
} from './helpers/legacyPreparedTextAnalysis';

test('prepareTextDiffAnalysisFromDiffLines matches legacy stats, replacement pairs, and split rows', () => {
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
  const diffLines = computeDiff(baseText, mineText);

  const prepared = prepareTextDiffAnalysisFromDiffLines(diffLines);
  const legacy = buildLegacyPreparedTextAnalysis(diffLines);

  assert.equal(prepared.stats.add, summarizeDiffChanges(diffLines).add);
  assert.equal(prepared.stats.del, summarizeDiffChanges(diffLines).del);
  assert.equal(prepared.stats.chg, summarizeDiffChanges(diffLines).chg);
  assert.deepEqual(
    buildReplacementPairIndexFromPairs(prepared.replacementPairs),
    buildReplacementPairIndex(diffLines),
  );
  assert.equal(arePreparedTextAnalysesEquivalent(prepared, legacy), true);
});

test('materializeSplitRowsFromDescriptors reproduces legacy split-row structure', () => {
  const baseText = ['row-1', 'row-2', 'row-3', 'row-4'].join('\n');
  const mineText = ['row-1', 'row-two', 'row-3', 'row-4', 'row-5'].join('\n');
  const diffLines = computeDiff(baseText, mineText);
  const prepared = prepareTextDiffAnalysisFromDiffLines(diffLines);

  const materialized = materializeSplitRowsFromDescriptors(diffLines, prepared.splitRowDescriptors);
  const legacyRows = buildSplitRows(diffLines);

  assert.equal(materialized.length, legacyRows.length);
  assert.deepEqual(
    materialized.map((row) => ({
      left: row.left?.base ?? null,
      right: row.right?.mine ?? null,
      lineIdx: row.lineIdx,
      lineIdxs: row.lineIdxs,
      isReplacementPair: Boolean(row.isReplacementPair),
    })),
    legacyRows.map((row) => ({
      left: row.left?.base ?? null,
      right: row.right?.mine ?? null,
      lineIdx: row.lineIdx,
      lineIdxs: row.lineIdxs,
      isReplacementPair: Boolean(row.isReplacementPair),
    })),
  );
});

test('materializeSplitRowsFromDescriptors refreshes rows when line metadata is enriched', () => {
  const diffLines = computeDiff('before', 'after');
  const prepared = prepareTextDiffAnalysisFromDiffLines(diffLines);
  const initialRows = materializeSplitRowsFromDescriptors(
    diffLines,
    prepared.splitRowDescriptors,
  );
  const enrichedDiffLines = diffLines.map((line) => ({
    ...line,
    baseBlame: line.baseLineNo == null ? null : {
      revision: 'abc123',
      author: 'alice',
      date: '2026-08-20 11:04',
      uncommitted: false,
    },
  }));
  const enrichedRows = materializeSplitRowsFromDescriptors(
    enrichedDiffLines,
    prepared.splitRowDescriptors,
  );

  assert.notEqual(enrichedRows, initialRows);
  assert.equal(enrichedRows[0]?.left, enrichedDiffLines[0]);
  assert.equal(enrichedRows[0]?.left?.baseBlame?.author, 'alice');
});
