import test from 'node:test';
import assert from 'node:assert/strict';

import type { SplitRow } from '../src/types';
import { collectWorkbookRenderBodyRows } from '../src/utils/workbook/workbookRenderBodyRows';

const firstRow: SplitRow = {
  left: null,
  right: null,
  lineIdx: 1,
  lineIdxs: [1],
};

const secondRow: SplitRow = {
  left: null,
  right: null,
  lineIdx: 2,
  lineIdxs: [2],
};

test('collectWorkbookRenderBodyRows reuses cached body-row projections for the same items and cache key', () => {
  const items = [
    { kind: 'split-line', row: firstRow },
    { kind: 'hidden-rows', rows: [secondRow] },
    { kind: 'split-line', row: secondRow },
  ];

  const first = collectWorkbookRenderBodyRows(
    items,
    'body-rows:v1',
    (item) => ('row' in item ? item.row : null),
  );
  const second = collectWorkbookRenderBodyRows(
    items,
    'body-rows:v1',
    (item) => ('row' in item ? item.row : null),
  );

  assert.equal(first, second);
  assert.deepEqual(first, [firstRow, secondRow]);
});

test('collectWorkbookRenderBodyRows keeps cache entries isolated by cache key', () => {
  const items = [
    { kind: 'row', row: firstRow },
    { kind: 'row', row: secondRow },
  ];

  const first = collectWorkbookRenderBodyRows(items, 'rows:all', (item) => item.row);
  const second = collectWorkbookRenderBodyRows(items, 'rows:first-only', (item) => (
    item.row.lineIdx === 1 ? item.row : null
  ));

  assert.notEqual(first, second);
  assert.deepEqual(first, [firstRow, secondRow]);
  assert.deepEqual(second, [firstRow]);
});
