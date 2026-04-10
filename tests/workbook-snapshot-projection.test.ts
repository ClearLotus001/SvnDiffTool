import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareWorkbookProjection } from '../electron/main/workbookProjection';
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
