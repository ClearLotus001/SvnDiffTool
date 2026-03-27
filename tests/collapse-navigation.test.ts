import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  findNextCollapseIndex,
  findNextCollapseIndexWithWrap,
  findPreviousCollapseIndex,
  findPreviousCollapseIndexWithWrap,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '../src/utils/collapse/collapseNavigation';

test('findNextCollapseIndex returns the first collapsed item after the current viewport', () => {
  const items = ['row', 'collapse', 'row', 'collapse', 'collapse'];

  assert.equal(findNextCollapseIndex(items, 2, (item) => item === 'collapse'), 3);
});

test('countRemainingCollapses counts collapsed items after the current viewport', () => {
  const items = ['row', 'collapse', 'row', 'collapse', 'collapse'];

  assert.equal(countRemainingCollapses(items, 2, (item) => item === 'collapse'), 2);
});

test('findNextCollapseIndexWithWrap wraps to the first collapsed item when none remain below', () => {
  const items = ['row', 'collapse', 'row'];

  assert.equal(findNextCollapseIndexWithWrap(items, 2, (item) => item === 'collapse'), 1);
});

test('findPreviousCollapseIndex returns the previous collapsed item before the current viewport', () => {
  const items = ['collapse', 'row', 'collapse', 'row'];

  assert.equal(findPreviousCollapseIndex(items, 2, (item) => item === 'collapse'), 2);
  assert.equal(findPreviousCollapseIndex(items, 1, (item) => item === 'collapse'), 0);
});

test('findPreviousCollapseIndexWithWrap wraps to the last collapsed item when none remain above', () => {
  const items = ['row', 'collapse', 'row', 'collapse'];

  assert.equal(findPreviousCollapseIndexWithWrap(items, 0, (item) => item === 'collapse'), 3);
});

test('getCollapseIndexes returns ordered collapse item indexes', () => {
  const items = ['row', 'collapse', 'row', 'collapse'];

  assert.deepEqual(getCollapseIndexes(items, (item) => item === 'collapse'), [1, 3]);
});

test('findCyclicCollapseIndex advances from the last jumped collapse and wraps around', () => {
  const indexes = [4, 12, 20];

  assert.equal(findCyclicCollapseIndex(indexes, 12, 0, 'next'), 20);
  assert.equal(findCyclicCollapseIndex(indexes, 20, 0, 'next'), 4);
  assert.equal(findCyclicCollapseIndex(indexes, 4, 99, 'prev'), 20);
});

test('findCyclicCollapseIndex falls back to viewport position when there is no active collapse target', () => {
  const indexes = [4, 12, 20];

  assert.equal(findCyclicCollapseIndex(indexes, null, 10, 'next'), 12);
  assert.equal(findCyclicCollapseIndex(indexes, null, 10, 'prev'), 4);
  assert.equal(findCyclicCollapseIndex(indexes, null, 21, 'next'), 4);
  assert.equal(findCyclicCollapseIndex(indexes, null, 0, 'prev'), 20);
});

test('resolveActiveCollapsePosition keeps the current collapse when available and otherwise uses viewport fallback', () => {
  const indexes = [4, 12, 20];

  assert.equal(resolveActiveCollapsePosition(indexes, 12, 0), 1);
  assert.equal(resolveActiveCollapsePosition(indexes, null, 10), 1);
  assert.equal(resolveActiveCollapsePosition(indexes, null, 21), 0);
});

test('collapse navigation helpers return empty state when no collapsed items remain', () => {
  const items = ['row', 'collapse', 'row'];

  assert.equal(findNextCollapseIndex(items, 2, (item) => item === 'collapse'), -1);
  assert.equal(findNextCollapseIndexWithWrap(['row', 'row'], 1, (item) => item === 'collapse'), -1);
  assert.equal(findPreviousCollapseIndex(['row', 'row'], 1, (item) => item === 'collapse'), -1);
  assert.equal(findPreviousCollapseIndexWithWrap(['row', 'row'], 1, (item) => item === 'collapse'), -1);
  assert.equal(findCyclicCollapseIndex([], null, 0, 'next'), -1);
  assert.equal(countRemainingCollapses(items, 2, (item) => item === 'collapse'), 0);
});
