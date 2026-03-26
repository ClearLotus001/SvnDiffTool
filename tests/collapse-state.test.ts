import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandCollapseBlock,
  expandCollapseBlockFully,
  getCollapseLeadingRevealCount,
  getCollapseExpandStep,
  getExpandedHiddenCount,
  getCollapseRevealRanges,
  revealCollapsedLine,
} from '../src/utils/collapseState';

test('expandCollapseBlock fully expands small hidden ranges in one click', () => {
  const blockId = 'block-100-200';
  const nextState = expandCollapseBlock({}, blockId, 0, 119, getCollapseExpandStep(120));

  assert.equal(getExpandedHiddenCount(nextState, blockId), 120);
});

test('expandCollapseBlock uses fixed-step expansion for large hidden ranges', () => {
  const blockId = 'block-100-200';
  const step = getCollapseExpandStep(10_000);
  const firstState = expandCollapseBlock({}, blockId, 0, 9_999, step);
  const secondState = expandCollapseBlock(firstState, blockId, 1_000, 8_999, step);

  assert.equal(step, 2_000);
  assert.equal(getExpandedHiddenCount(firstState, blockId), 2_000);
  assert.equal(getExpandedHiddenCount(secondState, blockId), 4_000);
});

test('expandCollapseBlockFully reveals the entire hidden range in one click', () => {
  const blockId = 'block-100-200';
  const nextState = expandCollapseBlockFully({}, blockId, 0, 9_999);

  assert.equal(getExpandedHiddenCount(nextState, blockId), 10_000);
});

test('expandCollapseBlockFully keeps existing full expansion stable', () => {
  const blockId = 'block-100-200';
  const initialState = { [blockId]: [{ start: 0, end: 9_999 }] };
  const nextState = expandCollapseBlockFully(initialState, blockId, 0, 9_999);

  assert.equal(nextState, initialState);
});

test('revealCollapsedLine opens a small centered window around the target line', () => {
  const blockId = 'block-100-200';
  const nextState = revealCollapsedLine({}, blockId, 0, 999, 500, 8);
  const ranges = getCollapseRevealRanges(nextState, blockId, 1000);

  assert.deepEqual(ranges, [{ start: 492, end: 508 }]);
});

test('getCollapseLeadingRevealCount returns the rows inserted before the remaining collapsed segment', () => {
  assert.equal(getCollapseLeadingRevealCount(800, 500), 250);
  assert.equal(getCollapseLeadingRevealCount(801, 500), 250);
});

test('getCollapseLeadingRevealCount returns zero when the segment is fully expanded', () => {
  assert.equal(getCollapseLeadingRevealCount(500, 500), 0);
  assert.equal(getCollapseLeadingRevealCount(120, 200), 0);
});
