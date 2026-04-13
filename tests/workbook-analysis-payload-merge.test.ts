import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeWorkbookCompareModePayload,
  mergeWorkbookMetadataPayload,
} from '../src/hooks/app/helpers';
import type {
  DiffAnalysisSnapshot,
  DiffData,
  DiffLine,
  WorkbookCompareModePayload,
  WorkbookMetadataMap,
  WorkbookMetadataPayload,
  WorkbookPrecomputedDeltaPayload,
} from '../src/types';

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
  metadata: { base: WorkbookMetadataMap | null; mine: WorkbookMetadataMap | null },
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
      metadata,
      artifactDiff: null,
      perf: {
        metadataMs: 1,
        rustDiffMs: 2,
      },
    },
  };
}

function createWorkbookDiffData(): DiffData {
  const strictDiffLines = [
    createDiffLine('equal', 'Sheet: Sheet1', 'Sheet: Sheet1'),
    createDiffLine('delete', 'Alpha', null),
    createDiffLine('add', null, 'Bravo'),
  ];
  const strictMetadata = {
    base: createWorkbookMetadata('Sheet1'),
    mine: createWorkbookMetadata('Sheet1'),
  };

  return {
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
    precomputedDiffLines: strictDiffLines,
    precomputedWorkbookDelta: createWorkbookDelta('strict'),
    precomputedDiffLinesByMode: {
      strict: strictDiffLines,
    },
    precomputedWorkbookDeltaByMode: {
      strict: createWorkbookDelta('strict'),
    },
    analysisSnapshotsByMode: {
      strict: createWorkbookSnapshot('strict', strictDiffLines, strictMetadata),
    },
    baseWorkbookMetadata: strictMetadata.base,
    mineWorkbookMetadata: strictMetadata.mine,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: {
      source: 'local-dev',
      rustDiffMs: 2,
      metadataMs: 1,
    },
  };
}

test('mergeWorkbookCompareModePayload ignores redundant legacy arrays and keeps snapshot-backed workbook projections authoritative', () => {
  const initial = createWorkbookDiffData();
  const contentDiffLines = [
    createDiffLine('equal', 'Sheet: Sheet1', 'Sheet: Sheet1'),
    createDiffLine('equal', 'Alpha', 'Bravo'),
  ];
  const payload: WorkbookCompareModePayload = {
    compareMode: 'content',
    diffLines: contentDiffLines,
    workbookDelta: createWorkbookDelta('content'),
    analysisSnapshot: createWorkbookSnapshot('content', contentDiffLines, {
      base: initial.baseWorkbookMetadata ?? null,
      mine: initial.mineWorkbookMetadata ?? null,
    }),
    perf: {
      rustDiffMs: 3,
    },
  };

  const merged = mergeWorkbookCompareModePayload(initial, payload);

  assert.equal(merged.precomputedDiffLinesByMode?.content, undefined);
  assert.equal(merged.precomputedWorkbookDeltaByMode?.content, undefined);
  assert.equal(merged.analysisSnapshotsByMode?.content?.workbookAnalysis?.diffLinesByMode.content, contentDiffLines);
  assert.equal(merged.analysisSnapshotsByMode?.content?.workbookAnalysis?.workbookDeltaByMode.content?.compareMode, 'content');
  assert.deepEqual(merged.baseWorkbookMetadata, initial.baseWorkbookMetadata);
  assert.deepEqual(merged.mineWorkbookMetadata, initial.mineWorkbookMetadata);
});

test('mergeWorkbookCompareModePayload keeps legacy projections lean when transport payload is snapshot-only', () => {
  const initial = createWorkbookDiffData();
  const contentDiffLines = [
    createDiffLine('equal', 'Sheet: Sheet1', 'Sheet: Sheet1'),
    createDiffLine('equal', 'Alpha', 'Bravo'),
  ];
  const payload: WorkbookCompareModePayload = {
    compareMode: 'content',
    diffLines: null,
    workbookDelta: null,
    analysisSnapshot: createWorkbookSnapshot('content', contentDiffLines, {
      base: initial.baseWorkbookMetadata ?? null,
      mine: initial.mineWorkbookMetadata ?? null,
    }),
    perf: {
      rustDiffMs: 3,
    },
  };

  const merged = mergeWorkbookCompareModePayload(initial, payload);

  assert.equal(merged.precomputedDiffLinesByMode?.content, undefined);
  assert.equal(merged.precomputedWorkbookDeltaByMode?.content, undefined);
  assert.equal(merged.analysisSnapshotsByMode?.content?.workbookAnalysis?.diffLinesByMode.content, contentDiffLines);
  assert.equal(merged.analysisSnapshotsByMode?.content?.workbookAnalysis?.workbookDeltaByMode.content?.compareMode, 'content');
});

test('mergeWorkbookMetadataPayload enriches all cached workbook snapshots with metadata', () => {
  const initial = createWorkbookDiffData();
  const contentDiffLines = [
    createDiffLine('equal', 'Sheet: Sheet1', 'Sheet: Sheet1'),
    createDiffLine('equal', 'Alpha', 'Bravo'),
  ];
  const withoutMetadata: DiffData = {
    ...initial,
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
    analysisSnapshotsByMode: {
      strict: createWorkbookSnapshot('strict', initial.precomputedDiffLines ?? [], {
        base: null,
        mine: null,
      }),
      content: createWorkbookSnapshot('content', contentDiffLines, {
        base: null,
        mine: null,
      }),
    },
  };
  const payload: WorkbookMetadataPayload = {
    base: createWorkbookMetadata('Sheet1'),
    mine: createWorkbookMetadata('Sheet1'),
    analysisSnapshot: createWorkbookSnapshot('strict', initial.precomputedDiffLines ?? [], {
      base: null,
      mine: null,
    }),
    perf: {
      metadataMs: 4,
    },
  };

  const merged = mergeWorkbookMetadataPayload(withoutMetadata, payload);

  assert.equal(Object.keys(merged.baseWorkbookMetadata?.sheets ?? {}).length, 1);
  assert.equal(Object.keys(merged.mineWorkbookMetadata?.sheets ?? {}).length, 1);
  assert.equal(Object.keys(merged.analysisSnapshotsByMode?.strict?.workbookAnalysis?.metadata.base?.sheets ?? {}).length, 1);
  assert.equal(Object.keys(merged.analysisSnapshotsByMode?.content?.workbookAnalysis?.metadata.base?.sheets ?? {}).length, 1);
});
