import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampSearchResultsPanelLeft,
  clampSearchResultsPanelHeight,
  clampSearchResultsPanelTop,
  clampSearchResultsPanelWidth,
  getSearchResultsPanelHeightRatio,
  getSearchResultsPanelWidthRatio,
  parseSearchResultsPanelWidthRatio,
  resizeSearchResultsPanelProportionally,
  resolveSearchResultsPanelHeight,
  resolveSearchResultsPanelWidth,
} from '../src/utils/diff/searchResultsPanelLayout';

test('search results panel width follows a persisted viewport ratio within safe bounds', () => {
  assert.equal(resolveSearchResultsPanelWidth(0.6, 1600), 960);
  assert.equal(getSearchResultsPanelWidthRatio(960, 1600), 0.6);
  assert.equal(clampSearchResultsPanelWidth(200, 1600), 520);
  assert.equal(clampSearchResultsPanelWidth(2000, 1600), 1568);
});

test('search results panel rejects invalid ratios and stays inside the viewport', () => {
  assert.equal(parseSearchResultsPanelWidthRatio('0.72'), 0.72);
  assert.equal(parseSearchResultsPanelWidthRatio('not-a-ratio'), null);
  assert.equal(parseSearchResultsPanelWidthRatio('1.2'), null);
  assert.equal(clampSearchResultsPanelLeft(1200, 920, 1440), 504);
  assert.equal(clampSearchResultsPanelLeft(-20, 920, 1440), 16);
});

test('search results panel height follows its own viewport ratio and bounds', () => {
  assert.equal(resolveSearchResultsPanelHeight(0.6, 900), 540);
  assert.equal(getSearchResultsPanelHeightRatio(540, 900), 0.6);
  assert.equal(clampSearchResultsPanelHeight(120, 900), 280);
  assert.equal(clampSearchResultsPanelHeight(1200, 900), 868);
  assert.equal(clampSearchResultsPanelTop(800, 460, 900), 424);
  assert.equal(clampSearchResultsPanelTop(-20, 460, 900), 16);
});

test('diagonal resizing preserves the panel aspect ratio', () => {
  const start = { width: 920, height: 460 };
  const enlarged = resizeSearchResultsPanelProportionally(start, 184, 40, 1600, 1000);
  const reduced = resizeSearchResultsPanelProportionally(start, -184, -40, 1600, 1000);

  assert.deepEqual(enlarged, { width: 1104, height: 552 });
  assert.deepEqual(reduced, { width: 736, height: 368 });
  assert.equal(enlarged.width / enlarged.height, start.width / start.height);
  assert.equal(reduced.width / reduced.height, start.width / start.height);
});
