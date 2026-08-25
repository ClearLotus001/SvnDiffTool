import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveWorkbookMaskedCellOpacity,
  shouldMaskWorkbookCell,
} from '../src/utils/workbook/workbookMaskedCellVisual';

test('differences-only masks a region until that region is revealed', () => {
  const baseOptions = {
    maskedRegionId: 'masked-region-1',
    revealedRegionId: '',
    isHeaderRow: false,
    isSearchMatch: false,
  };

  assert.equal(shouldMaskWorkbookCell(baseOptions), true);
  assert.equal(shouldMaskWorkbookCell({ ...baseOptions, revealedRegionId: 'masked-region-1' }), false);
  assert.equal(shouldMaskWorkbookCell({ ...baseOptions, revealedRegionId: 'masked-region-2' }), true);
  assert.equal(shouldMaskWorkbookCell({ ...baseOptions, isSearchMatch: true }), false);
});

test('cells without a masked region and header cells remain visible', () => {
  const options = {
    maskedRegionId: null,
    revealedRegionId: '',
    isHeaderRow: false,
    isSearchMatch: false,
  };

  assert.equal(shouldMaskWorkbookCell(options), false);
  assert.equal(shouldMaskWorkbookCell({ ...options, maskedRegionId: 'region', isHeaderRow: true }), false);
});

test('masked region opacity fades outward from the pointer origin', () => {
  const motion = {
    rowNumber: 3,
    column: 2,
    revealProgress: 0.5,
    targetProgress: 1 as const,
  };
  const baseOptions = {
    maskedRegionId: 'region',
    motion,
    rowNumber: 3,
    column: 2,
    isHeaderRow: false,
    isSearchMatch: false,
  };

  const originOpacity = resolveWorkbookMaskedCellOpacity(baseOptions);
  const nearbyOpacity = resolveWorkbookMaskedCellOpacity({ ...baseOptions, column: 3 });
  const distantOpacity = resolveWorkbookMaskedCellOpacity({ ...baseOptions, rowNumber: 8, column: 6 });
  assert.ok(originOpacity > 0 && originOpacity < 1);
  assert.ok(nearbyOpacity > originOpacity);
  assert.ok(distantOpacity > nearbyOpacity);
  assert.equal(resolveWorkbookMaskedCellOpacity({
    ...baseOptions,
    motion: { ...motion, revealProgress: 1 },
  }), 0);
});

test('mask animation never affects another region, headers, or search results', () => {
  const motion = {
    rowNumber: 2,
    column: 0,
    revealProgress: 1,
    targetProgress: 1 as const,
  };
  const baseOptions = {
    maskedRegionId: 'region-a',
    motion,
    rowNumber: 2,
    column: 0,
    isHeaderRow: false,
    isSearchMatch: false,
  };

  assert.equal(resolveWorkbookMaskedCellOpacity(baseOptions), 0);
  assert.equal(resolveWorkbookMaskedCellOpacity({ ...baseOptions, motion: undefined }), 1);
  assert.equal(resolveWorkbookMaskedCellOpacity({ ...baseOptions, isHeaderRow: true }), 0);
  assert.equal(resolveWorkbookMaskedCellOpacity({ ...baseOptions, isSearchMatch: true }), 0);
});
