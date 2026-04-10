import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalysisSnapshotCacheKey,
  clearAnalysisSnapshotCache,
  peekAnalysisSnapshot,
  resolveAnalysisSnapshot,
} from '../electron/main/analysisSnapshotService';
import type { FilePayload } from '../electron/main/types';

function createTextPayload(content: string): FilePayload {
  return {
    content,
    bytes: null,
    metadata: null,
    perf: {
      readMs: 0,
      parserMs: 0,
      metadataMs: 0,
      byteLength: Buffer.byteLength(content, 'utf-8'),
    },
  };
}

test('buildAnalysisSnapshotCacheKey differentiates compare modes and revision pairs', () => {
  const strictKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r11',
    compareMode: 'strict',
  });
  const contentKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r11',
    compareMode: 'content',
  });
  const otherRevisionKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r12',
    compareMode: 'strict',
  });

  assert.notEqual(strictKey, contentKey);
  assert.notEqual(strictKey, otherRevisionKey);
});

test('resolveAnalysisSnapshot reuses cached text analysis for identical keys', async () => {
  clearAnalysisSnapshotCache();
  const basePayload = createTextPayload(['header', 'alpha', 'tail'].join('\n'));
  const minePayload = createTextPayload(['header', 'alpha updated', 'tail'].join('\n'));

  const first = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::text-source',
    compareMode: 'strict',
    fileName: 'example.ts',
    isWorkbook: false,
    basePayload,
    minePayload,
    baseLocalPath: '',
    mineLocalPath: '',
  });
  const second = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::text-source',
    compareMode: 'strict',
    fileName: 'example.ts',
    isWorkbook: false,
    basePayload: createTextPayload(basePayload.content ?? ''),
    minePayload: createTextPayload(minePayload.content ?? ''),
    baseLocalPath: '',
    mineLocalPath: '',
  });

  assert.equal(first, second);
  assert.ok((first.textAnalysis?.diffLines.length ?? 0) > 0);
  assert.ok((first.textAnalysis?.splitRowDescriptors.length ?? 0) > 0);
  assert.ok((first.textAnalysis?.replacementPairs.length ?? 0) > 0);
});

test('peekAnalysisSnapshot returns cached analysis without recomputing payload-dependent work', async () => {
  clearAnalysisSnapshotCache();
  const basePayload = createTextPayload(['header', 'alpha', 'tail'].join('\n'));
  const minePayload = createTextPayload(['header', 'alpha updated', 'tail'].join('\n'));

  const resolved = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::peek-source',
    compareMode: 'strict',
    fileName: 'peek.ts',
    isWorkbook: false,
    basePayload,
    minePayload,
    baseLocalPath: '',
    mineLocalPath: '',
  });
  const cached = peekAnalysisSnapshot({
    sourceIdentity: 'cli::peek-source',
    compareMode: 'strict',
    baseRevisionId: undefined,
    mineRevisionId: undefined,
  });

  assert.equal(cached, resolved);
  assert.equal(cached?.textAnalysis?.diffLines.length, resolved.textAnalysis?.diffLines.length);
});
