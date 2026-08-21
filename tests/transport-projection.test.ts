import test from 'node:test';
import assert from 'node:assert/strict';

import { projectTransportDiffData } from '../electron/main/transportProjection.js';
import type {
  DiffAnalysisSnapshot,
  DiffData,
  DiffLine,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
} from '../electron/main/types.js';

function createDiffLine(type: DiffLine['type'], base: string | null, mine: string | null): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo: base != null ? 1 : null,
    mineLineNo: mine != null ? 1 : null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function createWorkbookMetadata(sheetName: string): WorkbookMetadataMap {
  return {
    sheets: {
      [sheetName]: {
        name: sheetName,
        hiddenColumns: [],
        mergeRanges: [],
      },
    },
  };
}

function createWorkbookDelta(compareMode: 'strict' | 'content'): WorkbookPrecomputedDeltaPayload {
  return {
    compareMode,
    sections: [
      {
        name: 'Sheet1',
        rows: [],
      },
    ],
  };
}

function createWorkbookSnapshot(
  compareMode: 'strict' | 'content',
  diffLines: DiffLine[],
): DiffAnalysisSnapshot {
  return {
    compareMode,
    textAnalysis: null,
    workbookAnalysis: {
      diffLinesByMode: {
        [compareMode]: diffLines,
      },
      workbookDeltaByMode: {
        [compareMode]: createWorkbookDelta(compareMode),
      },
      metadata: {
        base: createWorkbookMetadata('Sheet1'),
        mine: createWorkbookMetadata('Sheet1'),
      },
      artifactDiff: null,
      perf: {
        metadataMs: 1,
        rustDiffMs: 2,
      },
    },
  };
}

test('projectTransportDiffData leaves snapshot-only workbook payloads unchanged', () => {
  const strictDiffLines = [
    createDiffLine('equal', '@@sheet\tSheet1', '@@sheet\tSheet1'),
    createDiffLine('add', null, '@@row\t1\tBravo'),
  ];
  const data: DiffData = {
    svnUrl: '',
    fileName: 'demo.xlsx',
    sourceIdentity: 'local-dev::demo.xlsx',
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: false,
    initialPair: null,
    resetPair: null,
    launchBaseName: 'base.xlsx',
    launchMineName: 'mine.xlsx',
    baseName: 'base.xlsx',
    mineName: 'mine.xlsx',
    baseContent: null,
    mineContent: null,
    baseBytes: null,
    mineBytes: null,
    analysisSnapshotsByMode: {
      strict: createWorkbookSnapshot('strict', strictDiffLines),
    },
    baseWorkbookMetadata: createWorkbookMetadata('Sheet1'),
    mineWorkbookMetadata: createWorkbookMetadata('Sheet1'),
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: {
      source: 'cli',
    },
  };

  const projected = projectTransportDiffData(data);

  assert.equal(projected, data);
  assert.equal(projected.analysisSnapshotsByMode?.strict?.workbookAnalysis?.diffLinesByMode.strict, strictDiffLines);
});

test('projectTransportDiffData strips large raw text payloads when snapshot text analysis already covers first paint', () => {
  const baseContent = `${'const value = 1;\n'.repeat(12_000)}`;
  const mineContent = `${'const value = 1;\n'.repeat(12_000)}const tail = 2;\n`;
  const diffLines = [
    createDiffLine('equal', 'const value = 1;', 'const value = 1;'),
    createDiffLine('add', null, 'const tail = 2;'),
  ];
  const data: DiffData = {
    svnUrl: '',
    fileName: 'demo.ts',
    sourceIdentity: 'local-dev::demo.ts',
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: false,
    initialPair: null,
    resetPair: null,
    launchBaseName: 'base.ts',
    launchMineName: 'mine.ts',
    baseName: 'base.ts',
    mineName: 'mine.ts',
    baseContent,
    mineContent,
    baseBytes: null,
    mineBytes: null,
    analysisSnapshotsByMode: {
      strict: {
        compareMode: 'strict',
        textAnalysis: {
          diffLines,
          stats: { add: 1, del: 0, chg: 0 },
          replacementPairs: [],
          splitRowDescriptors: [
            { leftLineIdx: 0, rightLineIdx: 0, lineIdx: 0, lineIdxs: [0] },
            { leftLineIdx: null, rightLineIdx: 1, lineIdx: 1, lineIdxs: [1] },
          ],
          perf: { diffMs: 1 },
        },
        workbookAnalysis: null,
      },
    },
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: {
      source: 'cli',
    },
  };

  const projected = projectTransportDiffData(data);

  assert.equal(projected.baseContent, null);
  assert.equal(projected.mineContent, null);
  assert.equal(projected.analysisSnapshotsByMode?.strict?.textAnalysis?.diffLines, diffLines);
  assert.deepEqual(projected.analysisSnapshotsByMode?.strict?.textAnalysis?.replacementPairs, []);
  assert.deepEqual(projected.analysisSnapshotsByMode?.strict?.textAnalysis?.splitRowDescriptors, []);
});

test('projectTransportDiffData uses columnar lines for large prepared text snapshots', () => {
  const baseContent = `${'const value = 1;\n'.repeat(12_000)}`;
  const mineContent = `${'const value = 1;\n'.repeat(12_000)}const tail = 2;\n`;
  const diffLines = Array.from({ length: 3_000 }, (_, index) => ({
    ...createDiffLine('equal', `const value_${index} = 1;`, `const value_${index} = 1;`),
    baseLineNo: index + 1,
    mineLineNo: index + 1,
  }));
  const data: DiffData = {
    svnUrl: '',
    fileName: 'demo.ts',
    sourceIdentity: 'local-dev::demo.ts',
    compareContext: 'literal_two_file_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: false,
    initialPair: null,
    resetPair: null,
    launchBaseName: 'base.ts',
    launchMineName: 'mine.ts',
    baseName: 'base.ts',
    mineName: 'mine.ts',
    baseContent,
    mineContent,
    baseBytes: null,
    mineBytes: null,
    analysisSnapshotsByMode: {
      strict: {
        compareMode: 'strict',
        textAnalysis: {
          diffLines,
          stats: { add: 0, del: 0, chg: 0 },
          replacementPairs: [],
          splitRowDescriptors: [],
          perf: { diffMs: 1 },
        },
        workbookAnalysis: null,
      },
    },
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: { source: 'cli' },
  };

  const projected = projectTransportDiffData(data);
  const analysis = projected.analysisSnapshotsByMode?.strict?.textAnalysis;

  assert.deepEqual(analysis?.diffLines, []);
  assert.equal(analysis?.compactDiffLines?.types.length, diffLines.length);
  assert.equal(analysis?.compactDiffLines?.texts[2_999], 'const value_2999 = 1;');
  assert.equal(projected.baseContent, null);
  assert.equal(projected.mineContent, null);
});
