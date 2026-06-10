import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine, SplitRow } from '../src/types';
import { buildWorkbookRenderModel } from '../src/utils/workbook/workbookRenderModel';

type RenderModelProbeItem =
  | { kind: 'row'; row: SplitRow }
  | { kind: 'hidden-rows'; rows: SplitRow[]; rowNumbers: number[] };

function createWorkbookDiffLine(rowNumber: number): DiffLine {
  const displayLine = `@@row\t${rowNumber}\tvalue-${rowNumber}`;
  return {
    type: 'equal',
    base: displayLine,
    mine: displayLine,
    baseLineNo: rowNumber,
    mineLineNo: rowNumber,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function createSplitRow(rowNumber: number): SplitRow {
  const line = createWorkbookDiffLine(rowNumber);
  return {
    left: line,
    right: line,
    lineIdx: rowNumber,
    lineIdxs: [rowNumber],
  };
}

function buildModel(sectionRows: SplitRow[], items: RenderModelProbeItem[]) {
  return buildWorkbookRenderModel({
    sectionRows,
    sheetName: 'Thing',
    baseVersion: 'BASE',
    mineVersion: 'MINE',
    visibleColumns: [0],
    compareMode: 'strict',
    items,
    renderItemIndexesCacheKey: 'probe:model:v1',
    getRow: (item) => (item.kind === 'row' ? item.row : null),
    getHiddenRows: (item) => (item.kind === 'hidden-rows' ? item.rows : null),
    getHiddenRowNumbers: (item) => (item.kind === 'hidden-rows' ? item.rowNumbers : null),
  });
}

test('buildWorkbookRenderModel reuses row entry, compare cell and item index caches', () => {
  const sectionRows = [
    createSplitRow(1),
    createSplitRow(2),
  ];
  const items: RenderModelProbeItem[] = sectionRows.map((row) => ({ kind: 'row', row }));

  const first = buildModel(sectionRows, items);
  const second = buildModel(sectionRows, items);

  assert.equal(first.rowEntryByRowNumber, second.rowEntryByRowNumber);
  assert.equal(first.compareStateByRow, second.compareStateByRow);
  assert.equal(first.compareCellsByRowNumber, second.compareCellsByRowNumber);
  assert.equal(first.renderItemIndexes, second.renderItemIndexes);
  assert.equal(first.rowEntryByRowNumber.base.get(1)?.versionLabel, 'BASE');
  assert.equal(first.rowEntryByRowNumber.mine.get(2)?.versionLabel, 'MINE');
  assert.equal(first.compareStateByRow.get(sectionRows[0]!)?.cellDeltas, first.compareCellsByRowNumber.base.get(1));
  assert.equal(first.compareCellsByRowNumber.base.get(1)?.size, 1);
  assert.equal(first.renderItemIndexes.rowItemIndexBySide.base.get(2), 1);
});
