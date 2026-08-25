import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceWorkbookMaskedRegionMotions,
  createWorkbookMaskedRegionMotion,
  WORKBOOK_MASK_RESTORE_DURATION_MS,
  WORKBOOK_MASK_REVEAL_DURATION_MS,
} from '../src/utils/workbook/workbookMaskedRegionMotion';

test('masked region reveal advances smoothly and settles at fully revealed', () => {
  const initial = {
    region: createWorkbookMaskedRegionMotion({ rowNumber: 4, column: 2 }),
  };
  const halfway = advanceWorkbookMaskedRegionMotions(initial, WORKBOOK_MASK_REVEAL_DURATION_MS / 2);
  assert.equal(halfway.hasRunningMotion, true);
  assert.equal(halfway.motionByRegion.region?.revealProgress, 0.5);

  const complete = advanceWorkbookMaskedRegionMotions(
    halfway.motionByRegion,
    WORKBOOK_MASK_REVEAL_DURATION_MS,
  );
  assert.equal(complete.hasRunningMotion, false);
  assert.equal(complete.motionByRegion.region?.revealProgress, 1);
});

test('masked region restore reverses from its current progress without a visual jump', () => {
  const restoring = {
    region: {
      ...createWorkbookMaskedRegionMotion({ rowNumber: 4, column: 2 }, 0.75),
      targetProgress: 0 as const,
    },
  };
  const halfway = advanceWorkbookMaskedRegionMotions(restoring, WORKBOOK_MASK_RESTORE_DURATION_MS / 2);
  assert.equal(halfway.hasRunningMotion, true);
  assert.equal(halfway.motionByRegion.region?.revealProgress, 0.25);

  const complete = advanceWorkbookMaskedRegionMotions(
    halfway.motionByRegion,
    WORKBOOK_MASK_RESTORE_DURATION_MS,
  );
  assert.equal(complete.hasRunningMotion, false);
  assert.equal(complete.motionByRegion.region, undefined);
});
