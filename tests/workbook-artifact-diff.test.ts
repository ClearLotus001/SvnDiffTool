import test from 'node:test';
import assert from 'node:assert/strict';

import { detectWorkbookArtifactOnlyDiff } from '../electron/workbookArtifactDiff';

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

test('detectWorkbookArtifactOnlyDiff returns artifact-only diff when workbook bytes differ and diff lines are all equal', () => {
  const result = detectWorkbookArtifactOnlyDiff({
    isWorkbook: true,
    baseBytes: bytes([1, 2, 3]),
    mineBytes: bytes([1, 2, 4]),
    diffLines: [
      { type: 'equal' },
      { type: 'equal' },
    ],
  });

  assert.deepEqual(result, {
    hasArtifactOnlyDiff: true,
    kind: 'binary-only',
    baseBytes: 3,
    mineBytes: 3,
  });
});

test('detectWorkbookArtifactOnlyDiff returns null when workbook diff has content changes', () => {
  const result = detectWorkbookArtifactOnlyDiff({
    isWorkbook: true,
    baseBytes: bytes([1, 2, 3]),
    mineBytes: bytes([1, 2, 4]),
    diffLines: [
      { type: 'equal' },
      { type: 'add' },
    ],
  });

  assert.equal(result, null);
});

test('detectWorkbookArtifactOnlyDiff returns null when workbook delta reports structural changes', () => {
  const result = detectWorkbookArtifactOnlyDiff({
    isWorkbook: true,
    baseBytes: bytes([1, 2, 3]),
    mineBytes: bytes([1, 2, 4]),
    diffLines: [
      { type: 'equal' },
      { type: 'equal' },
    ],
    workbookDelta: {
      sections: [
        {
          rows: [
            { changedCount: 1 },
          ],
        },
      ],
    },
  });

  assert.equal(result, null);
});

test('detectWorkbookArtifactOnlyDiff returns null when workbook bytes are identical or file is not workbook', () => {
  const sameBytes = detectWorkbookArtifactOnlyDiff({
    isWorkbook: true,
    baseBytes: bytes([1, 2, 3]),
    mineBytes: bytes([1, 2, 3]),
    diffLines: [{ type: 'equal' }],
  });
  const nonWorkbook = detectWorkbookArtifactOnlyDiff({
    isWorkbook: false,
    baseBytes: bytes([1, 2, 3]),
    mineBytes: bytes([1, 2, 4]),
    diffLines: [{ type: 'equal' }],
  });

  assert.equal(sameBytes, null);
  assert.equal(nonWorkbook, null);
});
