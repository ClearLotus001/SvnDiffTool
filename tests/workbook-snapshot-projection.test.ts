import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareWorkbookProjection,
  projectWorkbookDeltaForSnapshot,
} from '../electron/main/workbookProjection';
import { applyWorkbookRegionVersionLabels } from '../src/hooks/app/helpers';
import { createWorkbookRowLine, createWorkbookSheetLine } from '../src/utils/workbook/workbookDisplay';
import {
  buildWorkbookDiffRegions,
  buildWorkbookNavigationRegions,
} from '../src/utils/workbook/workbookDiffRegion';
import { getWorkbookSections } from '../src/utils/workbook/workbookSections';
import { buildWorkbookSectionRowIndexFromPrecomputedDelta } from '../src/utils/workbook/workbookSheetIndex';
import type { DiffLine, WorkbookDiffRegion, WorkbookMetadataMap, WorkbookPrecomputedDeltaPayload } from '../src/types';
import type {
  DiffLine as MainDiffLine,
  WorkbookMetadataMap as MainWorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload as MainWorkbookPrecomputedDeltaPayload,
} from '../electron/main/types';

function createDiffLine(type: DiffLine['type'], base: string | null, mine: string | null, lineNo: number | null): DiffLine {
  return {
    type,
    base,
    mine,
    baseLineNo: base != null ? lineNo : null,
    mineLineNo: mine != null ? lineNo : null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('prepareWorkbookProjection matches legacy workbook sections and navigation regions', () => {
  const diffLines: DiffLine[] = [
    createDiffLine('equal', createWorkbookSheetLine('Sheet1'), createWorkbookSheetLine('Sheet1'), null),
    createDiffLine('equal', createWorkbookRowLine(1, ['ID', 'Name']), createWorkbookRowLine(1, ['ID', 'Name']), 1),
    createDiffLine('equal', createWorkbookRowLine(2, ['1001', 'Alice']), createWorkbookRowLine(2, ['1001', 'Alicia']), 2),
    createDiffLine('delete', createWorkbookRowLine(3, ['1002', 'Legacy']), null, 3),
    createDiffLine('add', null, createWorkbookRowLine(3, ['1002', 'Modern']), 3),
  ];
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [
      {
        name: 'Sheet1',
        rows: [
          {
            lineIdx: 1,
            lineIdxs: [1],
            leftLineIdx: 1,
            rightLineIdx: 1,
            cellDeltas: [],
            changedColumns: [],
            strictOnlyColumns: [],
            changedCount: 0,
            hasChanges: false,
            tone: 'equal',
          },
          {
            lineIdx: 2,
            lineIdxs: [2],
            leftLineIdx: 2,
            rightLineIdx: 2,
            cellDeltas: [
              {
                column: 1,
                baseCell: { value: 'Alice', formula: '' },
                mineCell: { value: 'Alicia', formula: '' },
                changed: true,
                masked: false,
                strictOnly: false,
                kind: 'modify',
                hasBaseContent: true,
                hasMineContent: true,
                hasContent: true,
              },
            ],
            changedColumns: [1],
            strictOnlyColumns: [],
            changedCount: 1,
            hasChanges: true,
            tone: 'mixed',
          },
          {
            lineIdx: 3,
            lineIdxs: [3, 4],
            leftLineIdx: 3,
            rightLineIdx: 4,
            cellDeltas: [
              {
                column: 1,
                baseCell: { value: 'Legacy', formula: '' },
                mineCell: { value: 'Modern', formula: '' },
                changed: true,
                masked: false,
                strictOnly: false,
                kind: 'modify',
                hasBaseContent: true,
                hasMineContent: true,
                hasContent: true,
              },
            ],
            changedColumns: [1],
            strictOnlyColumns: [],
            changedCount: 1,
            hasChanges: true,
            tone: 'mixed',
          },
        ],
      },
    ],
  };
  const metadata: WorkbookMetadataMap = {
    sheets: {
      Sheet1: {
        name: 'Sheet1',
        hiddenColumns: [],
        mergeRanges: [],
      },
    },
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: metadata as MainWorkbookMetadataMap,
    mineWorkbookMetadata: metadata as MainWorkbookMetadataMap,
  });

  const legacySections = getWorkbookSections(diffLines, 'strict');
  const legacyRowIndex = buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, workbookDelta);
  const legacyRegions = buildWorkbookNavigationRegions(
    buildWorkbookDiffRegions(
      legacySections,
      legacyRowIndex,
      'Base',
      'Mine',
      'strict',
      metadata,
      metadata,
    ),
    [],
    legacySections.map((section) => section.name),
  );

  assert.deepEqual(projection.sections, legacySections);
  assert.deepEqual(
    applyWorkbookRegionVersionLabels(projection.navigationRegions, 'Base', 'Mine'),
    legacyRegions,
  );
});

test('prepareWorkbookProjection can project unchanged workbook sections from delta metadata', () => {
  const diffLines: DiffLine[] = [
    createDiffLine('equal', createWorkbookSheetLine('Sheet1'), createWorkbookSheetLine('Sheet1'), null),
    createDiffLine('equal', createWorkbookRowLine(1, ['ID', 'Name']), createWorkbookRowLine(1, ['ID', 'Name']), 1),
    createDiffLine('equal', createWorkbookRowLine(2, ['1001', 'Alice']), createWorkbookRowLine(2, ['1001', 'Alice']), 2),
  ];
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [
      {
        name: 'Sheet1',
        hasBaseSide: true,
        hasMineSide: true,
        startLineIdx: 0,
        endLineIdx: 2,
        maxColumns: 2,
        rowCount: 2,
        firstDataLineIdx: 1,
        firstDataRowNumber: 1,
        rows: [
          {
            lineIdx: 1,
            lineIdxs: [1],
            leftLineIdx: 1,
            rightLineIdx: 1,
            baseRowNumber: 1,
            mineRowNumber: 1,
            cellDeltas: [],
            changedColumns: [],
            strictOnlyColumns: [],
            changedCount: 0,
            hasChanges: false,
            tone: 'equal',
          },
          {
            lineIdx: 2,
            lineIdxs: [2],
            leftLineIdx: 2,
            rightLineIdx: 2,
            baseRowNumber: 2,
            mineRowNumber: 2,
            cellDeltas: [],
            changedColumns: [],
            strictOnlyColumns: [],
            changedCount: 0,
            hasChanges: false,
            tone: 'equal',
          },
        ],
      },
    ],
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });

  assert.deepEqual(projection.sections, getWorkbookSections(diffLines, 'strict'));
  assert.deepEqual(projection.navigationRegions, []);
});

test('prepareWorkbookProjection preserves separate visual regions when equal row deltas are omitted', () => {
  const rowCount = 51;
  const changedRowNumbers = new Set([10, 50]);
  const diffLines: DiffLine[] = [
    createDiffLine('equal', createWorkbookSheetLine('Sheet1'), createWorkbookSheetLine('Sheet1'), null),
    ...Array.from({ length: rowCount }, (_, index) => {
      const rowNumber = index + 1;
      const baseValue = `Value-${rowNumber}`;
      const mineValue = changedRowNumbers.has(rowNumber) ? `Changed-${rowNumber}` : baseValue;
      return createDiffLine(
        'equal',
        createWorkbookRowLine(rowNumber, [baseValue]),
        createWorkbookRowLine(rowNumber, [mineValue]),
        rowNumber,
      );
    }),
  ];
  const makeEqualAnchor = (rowNumber: number) => ({
    lineIdx: rowNumber,
    lineIdxs: [rowNumber],
    leftLineIdx: rowNumber,
    rightLineIdx: rowNumber,
    baseRowNumber: rowNumber,
    mineRowNumber: rowNumber,
    cellDeltas: [],
    changedColumns: [],
    strictOnlyColumns: [],
    changedCount: 0,
    hasChanges: false,
    tone: 'equal' as const,
  });
  const makeChangedRow = (rowNumber: number) => ({
    lineIdx: rowNumber,
    lineIdxs: [rowNumber],
    leftLineIdx: rowNumber,
    rightLineIdx: rowNumber,
    baseRowNumber: rowNumber,
    mineRowNumber: rowNumber,
    cellDeltas: [{
      column: 0,
      baseCell: { value: `Value-${rowNumber}`, formula: '' },
      mineCell: { value: `Changed-${rowNumber}`, formula: '' },
      changed: true,
      masked: false,
      strictOnly: false,
      kind: 'modify' as const,
      hasBaseContent: true,
      hasMineContent: true,
      hasContent: true,
    }],
    changedColumns: [0],
    strictOnlyColumns: [],
    changedCount: 1,
    hasChanges: true,
    tone: 'mixed' as const,
  });
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [{
      name: 'Sheet1',
      hasBaseSide: true,
      hasMineSide: true,
      startLineIdx: 0,
      endLineIdx: rowCount,
      maxColumns: 1,
      rowCount,
      firstDataLineIdx: 1,
      firstDataRowNumber: 1,
      rows: [
        makeEqualAnchor(1),
        makeChangedRow(10),
        makeChangedRow(50),
        makeEqualAnchor(rowCount),
      ],
    }],
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });

  assert.equal(projection.navigationRegions.length, 2);
  assert.deepEqual(
    projection.navigationRegions.map((region) => region.startRowIndex),
    [9, 49],
  );
  assert.deepEqual(
    projection.navigationRegions.map((region) => region.anchorSelection?.rowNumber),
    [10, 50],
  );
  assert.deepEqual(
    projection.navigationRegions.map((region) => region.patches.length),
    [1, 1],
  );
});

test('prepareWorkbookProjection compresses whole-sheet additions and deletions into structural regions', () => {
  const diffLines: DiffLine[] = [
    createDiffLine('delete', createWorkbookSheetLine('Removed'), null, null),
    createDiffLine('delete', createWorkbookRowLine(1, ['old']), null, 1),
    createDiffLine('add', null, createWorkbookSheetLine('Added'), null),
    createDiffLine('add', null, createWorkbookRowLine(1, ['new']), 1),
  ];
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [
      {
        name: 'Removed',
        hasBaseSide: true,
        hasMineSide: false,
        startLineIdx: 0,
        endLineIdx: 1,
        maxColumns: 1,
        rowCount: 1,
        firstDataLineIdx: 1,
        firstDataRowNumber: 1,
        rows: [{
          lineIdx: 1,
          lineIdxs: [1],
          leftLineIdx: 1,
          rightLineIdx: null,
          baseRowNumber: 1,
          mineRowNumber: null,
          cellDeltas: [{
            column: 0,
            baseCell: { value: 'old', formula: '' },
            mineCell: { value: '', formula: '' },
            changed: true,
            masked: false,
            strictOnly: false,
            kind: 'delete',
            hasBaseContent: true,
            hasMineContent: false,
            hasContent: true,
          }],
          changedColumns: [0],
          strictOnlyColumns: [],
          changedCount: 1,
          hasChanges: true,
          tone: 'delete',
        }],
      },
      {
        name: 'Added',
        hasBaseSide: false,
        hasMineSide: true,
        startLineIdx: 2,
        endLineIdx: 3,
        maxColumns: 1,
        rowCount: 1,
        firstDataLineIdx: 3,
        firstDataRowNumber: 1,
        rows: [{
          lineIdx: 3,
          lineIdxs: [3],
          leftLineIdx: null,
          rightLineIdx: 3,
          baseRowNumber: null,
          mineRowNumber: 1,
          cellDeltas: [{
            column: 0,
            baseCell: { value: '', formula: '' },
            mineCell: { value: 'new', formula: '' },
            changed: true,
            masked: false,
            strictOnly: false,
            kind: 'add',
            hasBaseContent: false,
            hasMineContent: true,
            hasContent: true,
          }],
          changedColumns: [0],
          strictOnlyColumns: [],
          changedCount: 1,
          hasChanges: true,
          tone: 'add',
        }],
      },
    ],
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });

  assert.deepEqual(
    projection.sections.map(section => [section.name, section.changeType]),
    [['Removed', 'delete'], ['Added', 'add']],
  );
  assert.equal(projection.navigationRegions.length, 2);
  assert.deepEqual(projection.navigationRegions.map(region => region.patches.length), [1, 1]);
  assert.equal(projection.navigationRegions[0]?.hasBaseSide, true);
  assert.equal(projection.navigationRegions[1]?.hasMineSide, true);

  const projectedDelta = projectWorkbookDeltaForSnapshot(
    workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    projection.sections as Parameters<typeof projectWorkbookDeltaForSnapshot>[1],
  );
  assert.equal(projectedDelta?.sections[0]?.rows[0]?.structuralChange, 'delete');
  assert.equal(projectedDelta?.sections[1]?.rows[0]?.structuralChange, 'add');
  assert.deepEqual(projectedDelta?.sections[0]?.rows[0]?.cellDeltas, []);
  assert.deepEqual(projectedDelta?.sections[0]?.rows[0]?.changedColumns, []);
});

test('prepareWorkbookProjection projects large workbook sections without overflowing the call stack', () => {
  const rowCount = 70_000;
  const diffLines: DiffLine[] = [
    createDiffLine('equal', createWorkbookSheetLine('Sheet1'), createWorkbookSheetLine('Sheet1'), null),
  ];
  const rows: WorkbookPrecomputedDeltaPayload['sections'][number]['rows'] = Array.from(
    { length: rowCount },
    (_, index) => {
      const rowNumber = index + 1;
      return {
        lineIdx: index + 1,
        lineIdxs: [index + 1],
        leftLineIdx: null,
        rightLineIdx: null,
        baseRowNumber: rowNumber,
        mineRowNumber: rowNumber,
        cellDeltas: [],
        changedColumns: [],
        strictOnlyColumns: [],
        changedCount: 0,
        hasChanges: false,
        tone: 'equal',
      };
    },
  );
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [
      {
        name: 'Sheet1',
        hasBaseSide: true,
        hasMineSide: true,
        startLineIdx: 0,
        endLineIdx: rowCount,
        maxColumns: 24,
        rowCount,
        firstDataLineIdx: 1,
        firstDataRowNumber: 1,
        rows,
      },
    ],
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });

  assert.equal(projection.sections.length, 1);
  assert.equal(projection.sections[0]?.startLineIdx, 0);
  assert.equal(projection.sections[0]?.endLineIdx, rowCount);
  assert.equal(projection.sections[0]?.maxColumns, 24);
  assert.equal(projection.sections[0]?.rowCount, rowCount);
  assert.deepEqual(projection.navigationRegions, []);
});

test('prepareWorkbookProjection aggregates a very large connected diff region without argument spreading', () => {
  const rowCount = 140_000;
  const sharedRowLineIdx = 1;
  const diffLines: DiffLine[] = [
    createDiffLine('equal', createWorkbookSheetLine('Sheet1'), createWorkbookSheetLine('Sheet1'), null),
    createDiffLine('equal', createWorkbookRowLine(1, ['before']), createWorkbookRowLine(1, ['after']), 1),
  ];
  const rows: WorkbookPrecomputedDeltaPayload['sections'][number]['rows'] = Array.from(
    { length: rowCount },
    (_, index) => {
      const rowNumber = index + 1;
      return {
        lineIdx: sharedRowLineIdx,
        lineIdxs: [sharedRowLineIdx],
        leftLineIdx: sharedRowLineIdx,
        rightLineIdx: sharedRowLineIdx,
        baseRowNumber: rowNumber,
        mineRowNumber: rowNumber,
        cellDeltas: [],
        changedColumns: [0],
        strictOnlyColumns: [],
        changedCount: 1,
        hasChanges: true,
        tone: 'mixed' as const,
      };
    },
  );
  const workbookDelta: WorkbookPrecomputedDeltaPayload = {
    compareMode: 'strict',
    sections: [{
      name: 'Sheet1',
      hasBaseSide: true,
      hasMineSide: true,
      startLineIdx: 0,
      endLineIdx: sharedRowLineIdx,
      maxColumns: 1,
      rowCount,
      firstDataLineIdx: sharedRowLineIdx,
      firstDataRowNumber: 1,
      rows,
    }],
  };

  const projection = prepareWorkbookProjection({
    diffLines: diffLines as MainDiffLine[],
    workbookDelta: workbookDelta as MainWorkbookPrecomputedDeltaPayload,
    compareMode: 'strict',
    baseWorkbookMetadata: null,
    mineWorkbookMetadata: null,
  });

  assert.equal(projection.navigationRegions.length, 1);
  assert.equal(projection.navigationRegions[0]?.startRowIndex, 0);
  assert.equal(projection.navigationRegions[0]?.endRowIndex, rowCount - 1);
  assert.equal(projection.navigationRegions[0]?.rowNumberStart, 1);
  assert.equal(projection.navigationRegions[0]?.rowNumberEnd, rowCount);
  assert.equal(projection.navigationRegions[0]?.patches.length, rowCount);
});

test('applyWorkbookRegionVersionLabels hydrates snapshot-projected anchor selections', () => {
  const projectedPatch = {
    startRowIndex: 1,
    endRowIndex: 1,
    startCol: 1,
    endCol: 1,
    baseRowStart: 2,
    baseRowEnd: 2,
    mineRowStart: 2,
    mineRowEnd: 2,
    hasBaseSide: true,
    hasMineSide: true,
    lineIdxs: [2],
    anchorSelection: {
      kind: 'cell' as const,
      sheetName: 'Sheet1',
      side: 'mine' as const,
      versionLabel: '',
      rowNumber: 2,
      colIndex: 1,
      colLabel: 'B',
      address: 'B2',
      value: 'Alicia',
      formula: '',
    },
  };
  const projectedRegions: WorkbookDiffRegion[] = [
    {
      id: 'Sheet1:1:1:0',
      sheetName: 'Sheet1',
      startRowIndex: 1,
      endRowIndex: 1,
      startCol: 1,
      endCol: 1,
      rowNumberStart: 2,
      rowNumberEnd: 2,
      lineStartIdx: 2,
      lineEndIdx: 2,
      anchorLineIdx: 2,
      hasBaseSide: true,
      hasMineSide: true,
      anchorSelection: {
        kind: 'cell',
        sheetName: 'Sheet1',
        side: 'mine',
        versionLabel: '',
        rowNumber: 2,
        colIndex: 1,
        colLabel: 'B',
        address: 'B2',
        value: 'Alicia',
        formula: '',
      },
      patches: [
        projectedPatch,
      ] as WorkbookDiffRegion['patches'],
    },
  ];

  const hydrated = applyWorkbookRegionVersionLabels(projectedRegions, 'Base', 'Mine');

  assert.equal(hydrated[0]?.anchorSelection?.versionLabel, 'Mine');
  assert.equal(hydrated[0]?.anchorSelection?.value, 'Alicia');
  assert.equal(
    (hydrated[0]?.patches[0] as WorkbookDiffRegion['patches'][number] & { anchorSelection?: WorkbookDiffRegion['anchorSelection'] })
      ?.anchorSelection?.versionLabel,
    'Mine',
  );
});
