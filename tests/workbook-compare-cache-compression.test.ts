import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateWorkbookComparePayloadMemoryBytes,
  readWorkbookCompareCachePayload,
  storeWorkbookCompareCachePayload,
} from '../electron/main/cache';
import type { WorkbookCompareModePayload } from '../electron/main/types';

function buildSmallPayload(): WorkbookCompareModePayload {
  return {
    compareMode: 'strict',
    diffLines: [
      {
        type: 'equal',
        base: '@@row\t1\tID\tName',
        mine: '@@row\t1\tID\tName',
        baseLineNo: 1,
        mineLineNo: 1,
        baseCharSpans: null,
        mineCharSpans: null,
      },
    ],
    workbookDelta: null,
    perf: null,
  };
}

function buildLargePayload(): WorkbookCompareModePayload {
  const repeatedCell = 'CELL'.repeat(512);
  return {
    compareMode: 'strict',
    diffLines: Array.from({ length: 2048 }, (_, index) => ({
      type: index % 2 === 0 ? 'equal' as const : 'delete' as const,
      base: `@@row\t${index + 1}\t${repeatedCell}`,
      mine: `@@row\t${index + 1}\t${repeatedCell}`,
      baseLineNo: index + 1,
      mineLineNo: index + 1,
      baseCharSpans: null,
      mineCharSpans: null,
    })),
    workbookDelta: null,
    perf: null,
  };
}

test('storeWorkbookCompareCachePayload keeps small payloads inline', async () => {
  const payload = buildSmallPayload();

  const stored = await storeWorkbookCompareCachePayload(payload);

  assert.equal(stored.payload.kind, 'inline');
  assert.equal(stored.memoryBytes, estimateWorkbookComparePayloadMemoryBytes(payload));
  assert.deepEqual(await readWorkbookCompareCachePayload(stored.payload), payload);
});

test('storeWorkbookCompareCachePayload compresses large payloads and round-trips losslessly', async () => {
  const payload = buildLargePayload();

  const stored = await storeWorkbookCompareCachePayload(payload);

  assert.equal(stored.payload.kind, 'gzip-json-v1');
  assert.ok(stored.memoryBytes < estimateWorkbookComparePayloadMemoryBytes(payload));
  assert.deepEqual(await readWorkbookCompareCachePayload(stored.payload), payload);
});
